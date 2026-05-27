// Defer-and-cancel bulk delete with Undo.
//
// Pattern (Gmail-style):
//   1. Optimistically remove the tasks from the cache so the UI feels
//      instant.
//   2. Show a toast with an Undo action.
//   3. If the user clicks Undo before the toast times out: roll back
//      the optimistic removal — the rows were never actually deleted
//      on the server, so undo is genuinely free.
//   4. If the toast times out: fire the real deletes.
//
// Cancellation safety: if the page closes (unload) during the window,
// we flush the pending deletes via a beforeunload-driven fetch so we
// don't leave the UI showing rows as deleted that still exist on the
// server.

import { deleteTask } from '../api/tasks'
import { queryKeys } from './queries'

const UNDO_WINDOW_MS = 5000

// Shared registry of pending deletes so a beforeunload flush can find
// them, and so cancel() can be triggered from outside the timeout.
const pending = new Map() // toastId -> { ids, timer, cancelled }

function flushAll() {
  for (const [toastId, entry] of pending) {
    if (entry.cancelled) continue
    entry.cancelled = true
    clearTimeout(entry.timer)
    // Fire-and-forget — the page is unloading.
    for (const id of entry.ids) {
      try {
        deleteTask(id)
      } catch {
        /* best-effort */
      }
    }
    pending.delete(toastId)
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushAll)
}

// Run a delete (single or bulk) with an Undo toast.
//
//   tasks       — full task rows being deleted (used to restore the
//                 cache on undo)
//   queryClient — React Query QueryClient
//   workspaceId — for the tasks query key
//   showToast   — useToast() result
//   onComplete  — optional callback fired AFTER actual delete or after
//                 undo, with { delivered, cancelled } counts. Use for
//                 follow-up cache invalidation if needed.
//   message     — optional custom toast message (defaults to count-based)
export function bulkDeleteWithUndo({
  tasks,
  queryClient,
  workspaceId,
  showToast,
  onComplete,
  message,
}) {
  if (!tasks?.length) return
  const ids = tasks.map((t) => t.id)
  const key = queryKeys.tasks(workspaceId)

  // Snapshot the pre-delete cache so undo can fully restore.
  const previous = queryClient.getQueryData(key)

  // Optimistic UI: remove right away.
  queryClient.setQueryData(key, (old) => (old ?? []).filter((t) => !ids.includes(t.id)))

  const defaultMsg =
    ids.length === 1
      ? `Deleted "${truncate(tasks[0]?.title ?? 'task', 32)}"`
      : `Deleted ${ids.length} tasks`
  const toastId = showToast(
    message ?? defaultMsg,
    {
      action: {
        label: 'Undo',
        onClick: () => {
          const entry = pending.get(toastId)
          if (!entry || entry.cancelled) return
          entry.cancelled = true
          clearTimeout(entry.timer)
          // Restore the original cache snapshot — nothing hit the
          // server, so there's no rollback needed beyond UI state.
          if (previous) queryClient.setQueryData(key, previous)
          pending.delete(toastId)
          onComplete?.({ delivered: 0, cancelled: ids.length })
        },
      },
    },
  )

  const timer = setTimeout(async () => {
    const entry = pending.get(toastId)
    if (!entry || entry.cancelled) return
    entry.cancelled = true
    pending.delete(toastId)
    const results = await Promise.allSettled(ids.map((id) => deleteTask(id)))
    const delivered = results.filter((r) => r.status === 'fulfilled').length
    // Refresh in case the server-side state differs (e.g. some rows
    // failed to delete due to RLS) — RQ will reconcile.
    queryClient.invalidateQueries({ queryKey: key })
    onComplete?.({ delivered, cancelled: 0, failed: ids.length - delivered })
  }, UNDO_WINDOW_MS)

  pending.set(toastId, { ids, timer, cancelled: false })
}

function truncate(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
