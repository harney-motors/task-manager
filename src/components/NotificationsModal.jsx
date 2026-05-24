import { useEffect } from 'react'
import { useActiveNudges, useDismissNudge } from '../lib/queries'
import ModalHeader from './ModalHeader'

const SEVERITY_STYLE = {
  urgent: 'bg-red-600 text-white',
  high:   'bg-orange-500 text-white',
  medium: 'bg-info text-white',
  low:    'bg-text-3/30 text-text-2',
}

const SEVERITY_ICON = {
  urgent: 'ti-flame',
  high:   'ti-alert-triangle',
  medium: 'ti-bulb',
  low:    'ti-info-circle',
}

const SEVERITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 }

// Centralised Notifications sheet/modal. Opened by the NudgeBadge
// from the topbar so notifications are reachable from any view —
// not just Today (which is the only place the inline NudgesBanner
// historically mounted).
//
// On mobile, slides up as a bottom sheet (via .tickd-modal-content
// CSS). On desktop, centered modal. Each nudge row is interactive:
// tap to open its primary task (dispatches the global `tickd:open-task`
// event so any host listening can pop the TaskModal), tap × to
// dismiss, "Dismiss all" in the header clears the whole inbox.
export default function NotificationsModal({ open, onClose }) {
  const { data: nudges = [] } = useActiveNudges()
  const dismiss = useDismissNudge()

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const sorted = [...nudges].sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] ?? 99
    const sb = SEVERITY_RANK[b.severity] ?? 99
    if (sa !== sb) return sa - sb
    return new Date(b.created_at) - new Date(a.created_at)
  })

  function handleOpenTask(taskId) {
    if (!taskId) return
    onClose()
    // Dispatch the same event Home listens for from the quick-add
    // toast — keeps the open-task path decoupled from where the modal
    // is mounted, so it works from Settings/SuperAdmin/Pulse too.
    window.dispatchEvent(
      new CustomEvent('tickd:open-task', { detail: { taskId } }),
    )
  }

  function dismissAll() {
    // Fire all dismissals optimistically — the hook's onMutate strips
    // them from cache immediately so the list empties without waiting.
    for (const n of sorted) dismiss.mutate(n.id)
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto tickd-modal-backdrop"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] tickd-modal-content">
        <ModalHeader
          title="Notifications"
          icon="ti-bell"
          onClose={onClose}
          rightSlot={
            nudges.length > 0 ? (
              <button
                onClick={dismissAll}
                className="text-[11px] text-text-3 hover:text-text underline flex-shrink-0 mr-2"
              >
                Dismiss all
              </button>
            ) : null
          }
        />

        <div className="flex-1 overflow-y-auto">
          {nudges.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-border">
              {sorted.map((n) => (
                <NotificationRow
                  key={n.id}
                  nudge={n}
                  onOpenTask={handleOpenTask}
                  onDismiss={() => dismiss.mutate(n.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function NotificationRow({ nudge, onOpenTask, onDismiss }) {
  const tone = SEVERITY_STYLE[nudge.severity] || SEVERITY_STYLE.medium
  const icon = SEVERITY_ICON[nudge.severity] || SEVERITY_ICON.medium
  const taskIds = nudge.payload?.task_ids ?? []
  const primaryTaskId = taskIds[0]
  const additionalCount = taskIds.length - 1

  // Whole row is tappable when there's a task to open — left-click
  // bleed into the dismiss button is guarded via stopPropagation.
  function handleRowClick() {
    if (primaryTaskId) onOpenTask(primaryTaskId)
  }

  return (
    <li>
      <div
        onClick={handleRowClick}
        className={`group flex items-start gap-3 px-4 py-3 transition-colors ${
          primaryTaskId ? 'cursor-pointer hover:bg-surface-2 active:bg-surface-3' : ''
        }`}
      >
        {/* Severity badge — vivid pill on the left so the row reads
            at a distance, like ClickUp status tags. */}
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-lg inline-flex items-center justify-center ${tone}`}
        >
          <i className={`ti ${icon} text-sm`} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-snug">{nudge.title}</div>
          {nudge.body && (
            <div className="text-[11px] sm:text-xs text-text-2 mt-0.5 leading-snug">
              {nudge.body}
            </div>
          )}
          <div className="text-[10px] text-text-3 mt-1 flex items-center gap-2">
            <span>{formatRelative(nudge.created_at)}</span>
            {primaryTaskId && (
              <span className="text-info inline-flex items-center gap-0.5">
                <i className="ti ti-arrow-right text-[10px]" />
                Open task
                {additionalCount > 0 && ` (+${additionalCount} more)`}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          aria-label="Dismiss"
          title="Dismiss"
          className="flex-shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center text-text-3 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors"
        >
          <i className="ti ti-x text-sm" />
        </button>
      </div>
    </li>
  )
}

function EmptyState() {
  return (
    <div className="py-12 px-6 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success-bg text-success mb-3">
        <i className="ti ti-check text-2xl" />
      </div>
      <div className="text-sm font-medium">All caught up</div>
      <div className="text-xs text-text-2 mt-1">
        Tickd AI will surface anything worth your attention here.
      </div>
    </div>
  )
}

// Compact relative-time formatter — "just now / 12m / 3h / 2d".
function formatRelative(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  const days = Math.floor(diff / 86_400_000)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
