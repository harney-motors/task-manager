import { supabase } from '../lib/supabase'

// ============================================================
// Inbox event-stream API
// ============================================================
// The Updates tab in NotificationsView is a derived feed of discrete
// events that touch tasks the current user PICs or watches. Sources:
//
//   - activity_log (task.created, task.updated payloads)
//   - synthetic "task became overdue" events computed client-side
//     from the current tasks state (these aren't logged anywhere
//     because "overdue" isn't a user action — it just happens when
//     the clock crosses midnight)
//
// Dismissal is server-stored via the inbox_dismissals table so a user
// who clears an event on desktop doesn't see it again on mobile.

// How far back the events feed reaches. 14 days is enough for the
// "I missed something last week" case without dragging in months of
// stale chatter.
const INBOX_LOOKBACK_DAYS = 14

// Pull activity rows relevant to the inbox. RLS already gates by
// workspace membership; we filter to my-tasks-of-interest client-side
// because the relevance check needs current task pic_id + watchers,
// which RLS can't express cleanly. Limit is generous so a chatty
// workspace still surfaces older events on the Dismissed tab.
export async function fetchInboxActivity(workspaceId, days = INBOX_LOOKBACK_DAYS) {
  const cutoff = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString()
  const { data, error } = await supabase
    .from('activity_log')
    .select(
      `
      id, action, payload, actor_id, task_id, created_at,
      task:tasks(
        id, title, pic_id, status, due_date,
        watchers:task_watchers(person:people(id, user_id))
      )
    `,
    )
    .eq('workspace_id', workspaceId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw error
  return data ?? []
}

// All dismissed event_ids for the signed-in user. Returns a Set for
// O(1) "is this event dismissed?" checks downstream.
export async function fetchInboxDismissals() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Set()
  const { data, error } = await supabase
    .from('inbox_dismissals')
    .select('event_id')
    .eq('user_id', user.id)
  if (error) {
    console.warn('[inbox] dismissals fetch failed', error)
    return new Set()
  }
  return new Set((data ?? []).map((r) => r.event_id))
}

export async function dismissInboxEvent(eventId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { error } = await supabase
    .from('inbox_dismissals')
    .upsert(
      { user_id: user.id, event_id: eventId },
      { onConflict: 'user_id,event_id' },
    )
  if (error) throw error
}

export async function restoreInboxEvent(eventId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { error } = await supabase
    .from('inbox_dismissals')
    .delete()
    .eq('user_id', user.id)
    .eq('event_id', eventId)
  if (error) throw error
}

// Bulk "Mark all read" — one upsert.
export async function dismissInboxEvents(eventIds) {
  if (!eventIds || eventIds.length === 0) return
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const rows = eventIds.map((event_id) => ({ user_id: user.id, event_id }))
  const { error } = await supabase
    .from('inbox_dismissals')
    .upsert(rows, { onConflict: 'user_id,event_id' })
  if (error) throw error
}

// ============================================================
// Pure derivation — call this with the already-loaded inputs.
// ============================================================
//
// Inputs:
//   tasks            — useTasks() result (current state, with watchers)
//   activity         — fetchInboxActivity() result
//   me               — the people row for the signed-in user (or null)
//   myUserId         — auth.users.id for the signed-in user
//   peopleByUserId   — { [user_id]: 'Display Name' } for actor lookup
//   dismissedIds     — Set<string> of already-dismissed event_ids
//
// Output: array of inbox events, newest first. Each event has:
//   { id, kind, taskId, taskTitle, actorName, occurredAt, body,
//     severity, icon, dismissed }
//
// Pure / synchronous so the UI can memoize.
export function deriveInboxEvents({
  tasks,
  activity,
  me,
  myUserId,
  peopleByUserId,
  dismissedIds,
}) {
  const events = []

  // ---- 1. Activity-log-derived events ----
  for (const row of activity) {
    // My own actions never notify me.
    if (row.actor_id === myUserId) continue
    // Task was deleted / RLS-hidden — skip orphans.
    if (!row.task) continue
    const task = row.task
    const isMyPIC = me?.id && task.pic_id === me.id
    const isWatcher =
      me?.id &&
      (task.watchers ?? []).some((w) => w.person?.id === me.id)
    if (!isMyPIC && !isWatcher) continue

    const evt = renderActivityEvent(row, { me, peopleByUserId })
    if (!evt) continue
    events.push({ ...evt, dismissed: dismissedIds.has(evt.id) })
  }

  // ---- 2. Synthetic "task became overdue" events ----
  // One event per overdue task; event_id encodes the due_date so that
  // if the user reschedules a task and it goes overdue AGAIN later,
  // it surfaces as a fresh event instead of staying dismissed forever.
  const todayIso = new Date().toISOString().slice(0, 10)
  for (const task of tasks) {
    if (!me?.id) break
    if (task.pic_id !== me.id) continue
    if (task.status === 'Done') continue
    if (!task.due_date || task.due_date >= todayIso) continue
    const eventId = `overdue:${task.id}:${task.due_date}`
    events.push({
      id: eventId,
      kind: 'overdue',
      taskId: task.id,
      taskTitle: task.title,
      actorName: null,
      // Sort key — use the due_date so the most-overdue tasks surface
      // first within their own group, but still pre-dated relative to
      // today's fresh activity-log events.
      occurredAt: `${task.due_date}T23:59:59Z`,
      body: 'This task is past its due date.',
      severity: 'high',
      icon: 'ti-alert-triangle',
      dismissed: dismissedIds.has(eventId),
    })
  }

  // Sort by recency, newest first.
  events.sort((a, b) =>
    a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
  )
  return events
}

// Map a single activity_log row to an inbox event shape, or return
// null if the row isn't notification-worthy. Priority ordering inside
// task.updated: assignment > status > due date > everything else.
// Multiple changes in one update collapse to the most important event.
function renderActivityEvent(row, { me, peopleByUserId }) {
  const actorName = peopleByUserId[row.actor_id] ?? 'Someone'
  const task = row.task

  if (row.action === 'task.created') {
    // Only worth notifying if the creator made me the PIC immediately.
    if (task.pic_id !== me?.id) return null
    return {
      id: `created:${row.id}`,
      kind: 'created',
      taskId: task.id,
      taskTitle: task.title,
      actorName,
      occurredAt: row.created_at,
      body: `${actorName} created this task for you.`,
      severity: 'high',
      icon: 'ti-user-plus',
    }
  }

  if (row.action === 'task.updated') {
    const changes = row.payload?.changes ?? {}

    // Assignment to me — highest signal.
    if ('pic_id' in changes && changes.pic_id === me?.id) {
      return {
        id: `assigned:${row.id}`,
        kind: 'assigned',
        taskId: task.id,
        taskTitle: task.title,
        actorName,
        occurredAt: row.created_at,
        body: `${actorName} assigned this to you.`,
        severity: 'high',
        icon: 'ti-user-plus',
      }
    }

    // Status change — medium signal. Worth knowing especially on
    // watched tasks ("they marked it Done", "they hit a blocker").
    if ('status' in changes) {
      const verb =
        changes.status === 'Done'
          ? 'marked this Done'
          : changes.status === 'In progress'
            ? 'started work on this'
            : changes.status === 'Blocked'
              ? 'flagged a blocker on this'
              : `set status to ${changes.status}`
      return {
        id: `status:${row.id}`,
        kind: 'status_changed',
        taskId: task.id,
        taskTitle: task.title,
        actorName,
        occurredAt: row.created_at,
        body: `${actorName} ${verb}.`,
        severity: changes.status === 'Blocked' ? 'high' : 'medium',
        icon:
          changes.status === 'Done'
            ? 'ti-circle-check'
            : changes.status === 'Blocked'
              ? 'ti-alert-octagon'
              : 'ti-progress',
      }
    }

    // Due-date move — low signal, but worth knowing.
    if ('due_date' in changes) {
      return {
        id: `due:${row.id}`,
        kind: 'due_changed',
        taskId: task.id,
        taskTitle: task.title,
        actorName,
        occurredAt: row.created_at,
        body: `${actorName} moved the due date.`,
        severity: 'low',
        icon: 'ti-calendar-event',
      }
    }

    // Other field changes (title, notes, priority, etc.) aren't
    // notification-worthy at v1. They'll still appear in the
    // workspace-wide Recent activity feed below the view.
    return null
  }

  return null
}
