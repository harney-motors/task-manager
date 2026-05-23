import { supabase } from '../lib/supabase'

// Self-push (caller's own devices). Used for "test notification".
export async function sendSelfPush({ trigger, title, body, url, taskId, tag, urgent }) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return
  try {
    await fetch('/.netlify/functions/send-push', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        trigger,
        payload: {
          title,
          body,
          url,
          task_id: taskId,
          tag,
          urgent: !!urgent,
        },
      }),
    })
  } catch (err) {
    console.warn('[notify] send-push failed', err)
  }
}

// Cross-user fanout (PIC + watchers, minus actor). Best-effort —
// never blocks the user flow if delivery fails. The server side
// validates that the caller can see the task before fanning out.
//
// kind: 'pic_changed' | 'watcher_added' | 'status_changed' | 'due_changed' | 'journal_added'
// extra: optional metadata used to enrich the notification copy
//   { new_status?, new_pic_name?, new_due_date?, snippet? }
export async function notifyTaskEvent({ taskId, kind, extra }) {
  if (!taskId || !kind) return
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return
  try {
    await fetch('/.netlify/functions/notify-task-event', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        task_id: taskId,
        kind,
        extra: extra ?? {},
      }),
    })
  } catch (err) {
    console.warn('[notify] notify-task-event failed', err)
  }
}
