// Netlify Function — send reply / reaction emails on a comment.
//
// Sister to notify-mention.mjs. Triggered from the client right
// after a reply is posted (parent_id set) or after a reaction is
// added. The function:
//   1. Validates the caller's auth (Bearer JWT)
//   2. Loads the target entry (the comment whose author should be
//      notified) + its task + workspace
//   3. Skips when the caller is the same person as the target author
//      (no self-notifications)
//   4. Skips when the target author has opted out of mention emails
//      (we reuse the same per-workspace toggle for now — adding a
//      separate "reply emails" toggle would be a Settings change)
//   5. Sends the right template via the shared sendEmail() helper
//
// Required env mirrors notify-mention.

import { createClient } from '@supabase/supabase-js'
import {
  renderReplyEmail,
  renderReactionEmail,
} from '../../src/lib/mentionEmailTemplate.js'
import { sendEmail, emailProvider, emailDiagnostic } from './_lib/email.mjs'
import { logServerError } from './_lib/errorLog.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Same defensive resolution as notify-mention.mjs — see comments there.
// Auto-prepends `https://` to bare domains so a misconfigured env var
// (e.g. APP_URL=tickd.netlify.app without the scheme) still works.
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
      } else {
        continue
      }
    }
    try {
      const u = new URL(s)
      const final = `${u.protocol}//${u.host}`
      console.log(
        `[notify-comment-event] APP_URL resolved from ${source}: ${final} (raw=${raw})`,
      )
      return final
    } catch {
      continue
    }
  }
  console.warn(
    '[notify-comment-event] no usable APP_URL — set APP_URL env var to https://your-site',
  )
  return 'http://localhost:5173'
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!emailProvider()) {
    const diag = emailDiagnostic()
    return jsonError(
      500,
      `Server missing email config. Function sees: ${JSON.stringify(diag)}.`,
    )
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError(500, 'Server missing SUPABASE_SERVICE_ROLE_KEY')
  }

  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError(401, 'Missing bearer token')
  }
  const jwt = authHeader.slice('Bearer '.length).trim()

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonError(401, 'Invalid token')
  const caller = userData.user

  let body
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Invalid JSON body')
  }

  const targetEntryId = String(body?.target_entry_id ?? '').trim()
  const kind = String(body?.kind ?? '').trim()
  const emoji = body?.emoji ? String(body.emoji) : ''
  if (!targetEntryId) return jsonError(400, 'target_entry_id is required')
  if (kind !== 'reply' && kind !== 'reaction') {
    return jsonError(400, 'kind must be "reply" or "reaction"')
  }
  if (kind === 'reaction' && !emoji) {
    return jsonError(400, 'emoji is required for reaction kind')
  }

  console.log(
    `[notify-comment-event] start kind=${kind} target=${targetEntryId} caller=${caller.id}`,
  )

  // Load the target comment + its task. RLS gates this to entries the
  // caller can see (workspace member of the task's workspace), which
  // is the same authorization gate as the mention path.
  const { data: target, error: targetErr } = await userClient
    .from('journal_entries')
    .select(
      'id, body, author_id, task_id, task:tasks(id, title, workspace_id)',
    )
    .eq('id', targetEntryId)
    .single()
  if (targetErr || !target) return jsonError(404, 'Target entry not found')
  if (!target.task) return jsonError(404, 'Source task missing')
  if (!target.author_id) {
    return new Response(
      JSON.stringify({ sent: 0, skipped: 1, reason: 'no author' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  // No self-notifications. The reactor / replier IS the target author.
  if (target.author_id === caller.id) {
    return new Response(
      JSON.stringify({ sent: 0, skipped: 1, reason: 'self' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  // Workspace context for the email template.
  const workspaceId = target.task.workspace_id
  const { data: workspace } = await userClient
    .from('workspaces')
    .select('id, name, brand_color')
    .eq('id', workspaceId)
    .single()
  if (!workspace) return jsonError(404, 'Workspace not found')

  // Per-user opt-out (re-uses the existing mention-email toggle).
  const { data: prefs } = await userClient
    .from('workspace_members')
    .select('user_id, email_mentions_enabled')
    .eq('workspace_id', workspaceId)
    .eq('user_id', target.author_id)
    .maybeSingle()
  if (prefs?.email_mentions_enabled === false) {
    return new Response(
      JSON.stringify({ sent: 0, skipped: 1, reason: 'opted out' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  // Recipient's name (for the greeting) + email (via service role).
  const { data: recipientPerson } = await userClient
    .from('people')
    .select('name')
    .eq('workspace_id', workspaceId)
    .eq('user_id', target.author_id)
    .maybeSingle()
  const { data: recipientUser } = await adminClient.auth.admin.getUserById(
    target.author_id,
  )
  const recipientEmail = recipientUser?.user?.email
  if (!recipientEmail) {
    return jsonError(
      404,
      'Recipient has no email on their auth.users record',
    )
  }

  // Caller's name (for the body).
  const { data: callerPerson } = await userClient
    .from('people')
    .select('name')
    .eq('workspace_id', workspaceId)
    .eq('user_id', caller.id)
    .maybeSingle()
  const actorName =
    callerPerson?.name ??
    caller.user_metadata?.full_name ??
    caller.email?.split('@')[0] ??
    'A teammate'

  // Deep-link includes &focus=comments so the link opens straight
  // into the Comments tab of the TaskModal.
  const APP_URL = resolveAppUrl(req)
  console.log(
    `[notify-comment-event] resolved APP_URL=${APP_URL} env_APP_URL=${process.env.APP_URL || '(unset)'} env_URL=${process.env.URL || '(unset)'} origin=${req.headers.get('origin') || '(unset)'}`,
  )
  const taskUrl = `${APP_URL.replace(/\/$/, '')}/?task=${target.task.id}&focus=comments`
  const unsubscribeUrl = `${APP_URL.replace(/\/$/, '')}/?view=today#email-prefs`
  console.log(`[notify-comment-event] taskUrl=${taskUrl}`)

  let templated
  if (kind === 'reply') {
    // Pull the reply body (the new entry the caller just posted) so
    // we can quote it back to the recipient. Easiest path: find the
    // newest entry by this caller with parent_id = targetEntryId.
    const { data: replyRows } = await userClient
      .from('journal_entries')
      .select('id, body, created_at')
      .eq('parent_id', targetEntryId)
      .eq('author_id', caller.id)
      .order('created_at', { ascending: false })
      .limit(1)
    const reply = replyRows?.[0]
    templated = renderReplyEmail({
      recipientName: recipientPerson?.name,
      replierName: actorName,
      taskTitle: target.task.title,
      replyExcerpt: reply?.body ?? '',
      originalExcerpt: target.body,
      workspaceName: workspace.name,
      workspaceBrandColor: workspace.brand_color,
      taskUrl,
      appUrl: APP_URL,
      unsubscribeUrl,
    })
  } else {
    templated = renderReactionEmail({
      recipientName: recipientPerson?.name,
      reactorName: actorName,
      emoji,
      taskTitle: target.task.title,
      commentExcerpt: target.body,
      workspaceName: workspace.name,
      workspaceBrandColor: workspace.brand_color,
      taskUrl,
      appUrl: APP_URL,
      unsubscribeUrl,
    })
  }

  try {
    const result = await sendEmail({
      to: recipientEmail,
      subject: templated.subject,
      html: templated.html,
      text: templated.text,
      tags: [{ name: 'kind', value: kind }],
    })
    console.log(
      `[notify-comment-event] sent via ${result.provider} to ${recipientEmail} kind=${kind} id=${result.id}`,
    )
    return new Response(
      JSON.stringify({ sent: 1, provider: result.provider, id: result.id }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  } catch (err) {
    console.error(`[notify-comment-event] send FAILED to ${recipientEmail}:`, err)
    logServerError({
      source: 'netlify-fn:notify-comment-event',
      message: `send FAILED to ${recipientEmail}: ${err?.message ?? err}`,
      context: {
        recipient_email: recipientEmail,
        target_entry_id: targetEntryId,
        kind,
        stack: err?.stack ?? null,
      },
      workspaceId: target.task.workspace_id,
      userId: caller.id,
    })
    return jsonError(500, err?.message || 'Send failed')
  }
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
