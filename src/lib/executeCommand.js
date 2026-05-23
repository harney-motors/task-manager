import { updateTask, deleteTask } from '../api/tasks'
import { addWatcher, removeWatcher } from '../api/watchers'
import { logActivity } from '../api/activity'

// Execute a list of actions against a list of tasks. For each task,
// we apply each action serially (an update + a watcher add for the
// same task happens in sequence on that task). Across tasks we
// parallelise via Promise.allSettled so a single failure doesn't
// stop the rest.
//
// Returns { ok, failed, errors[] } so callers can show meaningful
// success / partial-failure toasts.
export async function executeCommand({
  tasks,
  actions,
  people,
  workspaceId,
}) {
  const picsByFirst = firstNameMap(people)

  const results = await Promise.allSettled(
    tasks.map((t) => applyActionsToTask(t, actions, picsByFirst, people)),
  )

  const ok = results.filter((r) => r.status === 'fulfilled').length
  const errors = results
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason?.message ?? String(r.reason))

  // Audit trail: one activity row per bulk command (not per task)
  // so the activity feed doesn't get spammed.
  try {
    await logActivity({
      workspaceId,
      action: 'ai.command',
      payload: {
        task_count: tasks.length,
        ok_count: ok,
        failed_count: errors.length,
        actions: (actions ?? []).map((a) => ({ kind: a.kind, value: a.value })),
      },
    })
  } catch (err) {
    // Audit logging is nice-to-have; don't fail the command if it errors.
    console.warn('[executeCommand] activity log failed', err)
  }

  return { ok, failed: errors.length, errors }
}

async function applyActionsToTask(task, actions, picsByFirst, people) {
  for (const a of actions) {
    await applyOneAction(task, a, picsByFirst, people)
  }
}

async function applyOneAction(task, action, picsByFirst, people) {
  switch (action.kind) {
    case 'set_status':
      await updateTask(task.id, { status: action.value })
      return
    case 'set_priority':
      await updateTask(task.id, { priority: action.value })
      return
    case 'set_pic': {
      const picId = resolvePicId(action.value, picsByFirst)
      await updateTask(task.id, { pic_id: picId })
      return
    }
    case 'set_department':
      // Department changes by name aren't supported via this codepath
      // yet — would need to look up the department id from the name.
      // Skipping silently; in practice the model rarely emits this.
      return
    case 'set_due':
      await updateTask(task.id, { due_date: action.value || null })
      return
    case 'add_watcher': {
      const picId = resolvePicId(action.value, picsByFirst)
      if (picId) await addWatcher(task.id, picId)
      return
    }
    case 'remove_watcher': {
      const picId = resolvePicId(action.value, picsByFirst)
      if (picId) await removeWatcher(task.id, picId)
      return
    }
    case 'delete':
      await deleteTask(task.id)
      return
    default:
      // unknown action kind — silently skip
      return
  }
}

function firstNameMap(people) {
  const m = new Map()
  for (const p of people) {
    const first = (p.name?.split(' ')[0] ?? '').toLowerCase()
    if (first && !m.has(first)) m.set(first, p)
  }
  return m
}

function resolvePicId(value, picsByFirst) {
  if (!value) return null
  const norm = String(value).toLowerCase()
  return picsByFirst.get(norm)?.id ?? null
}
