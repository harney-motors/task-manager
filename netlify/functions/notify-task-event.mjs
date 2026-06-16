// Netlify Function — fans out push notifications for a task event.
//
// Called from the client whenever a mutation that should ping
// someone OTHER than the actor lands. The client provides the
// event kind + task_id; the server validates the caller can see
// the task (via their JWT + RLS), then uses the service key
// internally to look up subscriptions and fan out via web-push.
//
// Why server-side: the client cannot safely write to another
// user's push_subscriptions, and we don't want to leak who
// watches what through cross-user reads. RLS protects subscriptions
// from peer access, so cross-user delivery has to go through a
// privileged path.
//
// Body shape:
//   {
//     task_id:  "uuid",          // required
//     kind:     "pic_changed" | "watcher_added" | "status_changed"
//                | "due_changed" | "journal_added"
//     // Optional metadata to enrich the notification copy:
//     extra:    { new_status?, new_pic_name?, new_due_date?, snippet? }
//   }
//
// Required env (Functions scope):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   PUSH_SERVICE_KEY  (for the internal service-to-service call into send-push)
//   ...and VAPID_* if you also want to send directly (we delegate to send-push).
//
// We delegate to /.netlify/functions/send-push so the web-push
// machinery lives in one place.

import { createClient } from '@supabase/supabase-js'
import { renderAssignmentEmail } from '../../src/lib/mentionEmailTemplate.js'
import { sendEmail, emailProvider } from './_lib/email.mjs'
import { logServerError } from './_lib/errorLog.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PUSH_SERVICE_KEY = process.env.PUSH_SERVICE_KEY
const SITE_URL = process.env.URL || ''

// Same defensive URL resolution as notify-mention.mjs — see comments
// there. Auto-prepends https:// to bare-domain APP_URLs.
function resolveAppUrl(req) {
  const origin = req.headers.get('origin') || req.headers.get('referer')
  const candidates = [
    { source: 'env_APP_URL', raw: process.env.APP_URL },
    { source: 'request_origin', raw: origin },
    { source: 'env_URL', raw: process.env.URL },
    { source: 'env_DEPLOY_PRIME_URL', raw: process.env.DEPLOY_PRIME_URL },
    { source: 'fallback_localhost', raw: 'http://localhost:5173' },
  ]
  for (const { source, raw } of candidates) {
    if (!raw) continue
    let s = String(raw).trim().replace(/\/$/, '')
    if (!s) continue
    if (!/^https?:\/\//i.test(s)) {
      if (/^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(s)) {
        s = `http://${s}`
      } else if (/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+/i.test(s)) {
        s = `https://${s}`
      } else continue
    }
    try {
      const u = new URL(s)
      console.log(
        `[notify-task-event] APP_URL resolved from ${source}: ${u.protocol}//${u.host}`,
      )
      return `${u.protocol}//${u.host}`
    } catch {
      continue
    }
  }
  return 'http://localhost:5173'
}

// Maps event kind to the matching push_subscriptions.preferences key.
const TRIGGER_BY_KIND = {
  pic_changed:      'assigned_to_me',
  watcher_added:    'assigned_to_me',
  status_changed:   'watched_changed',
  due_changed:      'watched_changed',
  journal_added:    'journal_mention',
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) return jsonError(500, 'Server missing service key')
  if (!PUSH_SERVICE_KEY) return jsonError(500, 'Server missing PUSH_SERVICE_KEY')

  // Auth
  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing bearer token')
  const jwt = authHeader.slice('Bearer '.length).trim()

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonError(401, 'Invalid token')
  const actor = userData.user

  // Body
  let body
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Invalid JSON body')
  }
  const taskId = String(body?.task_id ?? '').trim()
  const kind = String(body?.kind ?? '').trim()
  const extra = body?.extra ?? {}
  if (!taskId || !kind) return jsonError(400, 'task_id and kind required')
  const trigger = TRIGGER_BY_KIND[kind]
  if (!trigger) return jsonError(400, `unknown kind: ${kind}`)

  // Verify caller can see the task (RLS gates it)
  const { data: task, error: taskErr } = await userClient
    .from('tasks')
    .select(`
      id, title, workspace_id, pic_id,
      pic:people!tasks_pic_id_fkey(id, name, user_id),
      task_watchers(person:people(id, name, user_id))
    `)
    .eq('id', taskId)
    .maybeSingle()
  if (taskErr || !task) return jsonError(404, 'Task not found or not visible')

  // ---------- Resolve recipients (other than the actor) ----------
  const recipientIds = new Set()

  function add(userId) {
    if (userId && userId !== actor.id) recipientIds.add(userId)
  }

  switch (kind) {
    case 'pic_changed':
    case 'watcher_added':
      // For PIC-changed, the new PIC gets pinged. We assume the caller
      // already mutated the task, so task.pic is the new pic.
      add(task.pic?.user_id)
      break
    case 'status_changed':
    case 'due_changed':
    case 'journal_added':
      // Ping the PIC + every watcher.
      add(task.pic?.user_id)
      for (const tw of task.task_watchers ?? []) {
        add(tw.person?.user_id)
      }
      break
  }

  if (recipientIds.size === 0) {
    return new Response(
      JSON.stringify({ attempted: 0, sent: 0, note: 'no recipients' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  // ---------- Build notification payload ----------
  const payload = buildPayload(task, kind, extra, actor)

  // ---------- Fan out via send-push (service auth) ----------
  // Prefer an absolute URL when SITE_URL is set (Netlify provides
  // process.env.URL); fall back to a relative path which works for
  // function-to-function calls within the same site.
  const sendPushUrl = SITE_URL
    ? `${SITE_URL}/.netlify/functions/send-push`
    : '/.netlify/functions/send-push'

  let result
  try {
    const res = await fetch(sendPushUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-service-key': PUSH_SERVICE_KEY,
      },
      body: JSON.stringify({
        user_ids: Array.from(recipientIds),
        trigger,
        payload,
      }),
    })
    result = await res.json().catch(() => ({}))
    if (!res.ok) {
      return jsonError(500, result.error || `send-push ${res.status}`)
    }
  } catch (err) {
    logServerError({
      source: 'netlify-fn:notify-task-event',
      message: `send-push call failed: ${err?.message ?? err}`,
      context: {
        task_id: taskId,
        kind,
        stack: err?.stack ?? null,
      },
      workspaceId: task?.workspace_id ?? null,
      userId: actor?.id ?? null,
    })
    return jsonError(500, err.message || 'send-push call failed')
  }

  // ---------- Side channel: assignment email ----------
  // Only fires for pic_changed AND when we have a deliverable email
  // provider AND the new PIC hasn't opted out. Failures are logged
  // but don't bubble up — push already succeeded, the response stays
  // 200 so the client doesn't retry.
  let emailResult = null
  if (kind === 'pic_changed' && task.pic?.user_id) {
    emailResult = await sendAssignmentEmail({
      req,
      task,
      actor,
      adminClient: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
      userClient,
    }).catch((err) => {
      console.warn('[notify-task-event] assignment email failed', err)
      return { sent: 0, skipped: 1, error: err?.message }
    })
  }

  return new Response(
    JSON.stringify(emailResult ? { ...result, email: emailResult } : result),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  )
}

// Build + send the "you were assigned this task" email. Run after the
// push fanout so the push has already gone out; this is best-effort.
// Skips when: no email provider configured, recipient has no user_id
// (i.e. an unlinked person), recipient opted out, no email on file,
// or the recipient is the same person as the actor (somehow assigning
// a task to yourself shouldn't email you).
async function sendAssignmentEmail({
  req,
  task,
  actor,
  adminClient,
  userClient,
}) {
  if (!emailProvider()) {
    console.log('[notify-task-event] no email provider — skip email')
    return { sent: 0, skipped: 1, reason: 'no provider' }
  }
  const recipientUserId = task.pic?.user_id
  if (!recipientUserId) return { sent: 0, skipped: 1, reason: 'no user_id' }
  if (recipientUserId === actor.id) {
    return { sent: 0, skipped: 1, reason: 'self-assigned' }
  }

  // Opt-out check (reuses the existing mention-email toggle for now —
  // splitting into a separate per-event preference is a follow-up).
  const { data: prefs } = await userClient
    .from('workspace_members')
    .select('email_mentions_enabled')
    .eq('workspace_id', task.workspace_id)
    .eq('user_id', recipientUserId)
    .maybeSingle()
  if (prefs?.email_mentions_enabled === false) {
    return { sent: 0, skipped: 1, reason: 'opted out' }
  }

  // Pull the recipient's email via service role (auth.users isn't
  // readable through anon).
  const { data: recipientUser } =
    await adminClient.auth.admin.getUserById(recipientUserId)
  const recipientEmail = recipientUser?.user?.email
  if (!recipientEmail) {
    return { sent: 0, skipped: 1, reason: 'no email on record' }
  }

  // Look up workspace + the full task (with notes / priority / due)
  // for the template. The compact task we joined for push fanout
  // doesn't include those fields.
  const { data: workspace } = await userClient
    .from('workspaces')
    .select('id, name, brand_color')
    .eq('id', task.workspace_id)
    .single()
  const { data: fullTask } = await userClient
    .from('tasks')
    .select('id, title, notes, due_date, priority, created_at, updated_at, pic_id')
    .eq('id', task.id)
    .maybeSingle()

  // Actor display name.
  const { data: actorPerson } = await userClient
    .from('people')
    .select('name')
    .eq('workspace_id', task.workspace_id)
    .eq('user_id', actor.id)
    .maybeSingle()
  const assignerName =
    actorPerson?.name ??
    actor.user_metadata?.full_name ??
    actor.email?.split('@')[0] ??
    'A teammate'

  // "is this a freshly-created task or a reassignment?" — within ~30s
  // of created_at we treat it as a creation; beyond that, reassignment.
  // Gives slightly different subject line copy ("assigned you a new
  // task" vs "reassigned this task to you"). Soft heuristic; the body
  // is identical.
  const ageMs = fullTask?.created_at
    ? Date.now() - new Date(fullTask.created_at).getTime()
    : Infinity
  const isNew = ageMs < 30_000

  const APP_URL = resolveAppUrl(req)
  const taskUrl = `${APP_URL.replace(/\/$/, '')}/?task=${task.id}`
  const unsubscribeUrl = `${APP_URL.replace(/\/$/, '')}/?view=today#email-prefs`
  console.log(`[notify-task-event] assignment taskUrl=${taskUrl}`)

  const { subject, html, text } = renderAssignmentEmail({
    recipientName: task.pic?.name,
    assignerName,
    taskTitle: fullTask?.title ?? task.title,
    taskNotes: fullTask?.notes,
    dueDate: fullTask?.due_date,
    priority: fullTask?.priority,
    isNew,
    workspaceName: workspace?.name,
    workspaceBrandColor: workspace?.brand_color,
    taskUrl,
    appUrl: APP_URL,
    unsubscribeUrl,
  })

  const result = await sendEmail({
    to: recipientEmail,
    subject,
    html,
    text,
    tags: [
      { name: 'kind', value: 'pic_assigned' },
      { name: 'is_new', value: isNew ? 'true' : 'false' },
    ],
  })
  console.log(
    `[notify-task-event] assignment email sent via ${result.provider} to ${recipientEmail} (id ${result.id})`,
  )
  return { sent: 1, provider: result.provider, id: result.id }
}

function buildPayload(task, kind, extra, actor) {
  const titleStub = truncate(task.title || 'Task', 60)
  const actorName = actor.user_metadata?.name || actor.email?.split('@')[0] || 'Someone'
  const url = '/' // future: deep-link by task id once we have routing for it
  const taskId = task.id
  const tag = `task:${taskId}:${kind}` // dedup repeat fires
  switch (kind) {
    case 'pic_changed':
      return {
        title: 'New task assigned to you',
        body: titleStub,
        url, task_id: taskId, tag,
      }
    case 'watcher_added':
      return {
        title: `${actorName} added you as a watcher`,
        body: titleStub,
        url, task_id: taskId, tag,
      }
    case 'status_changed':
      return {
        title: extra.new_status
          ? `Status → ${extra.new_status}`
          : 'Task status changed',
        body: titleStub,
        url, task_id: taskId, tag,
      }
    case 'due_changed':
      return {
        title: extra.new_due_date
          ? `Due → ${extra.new_due_date}`
          : 'Task due changed',
        body: titleStub,
        url, task_id: taskId, tag,
      }
    case 'journal_added':
      return {
        title: `${actorName} added a note`,
        body: extra.snippet
          ? `${titleStub} — “${truncate(extra.snippet, 80)}”`
          : titleStub,
        url, task_id: taskId, tag,
      }
    default:
      return { title: 'Task updated', body: titleStub, url, task_id: taskId, tag }
  }
}

function truncate(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
