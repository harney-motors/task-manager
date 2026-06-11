// Netlify Function — send a "you were @mentioned" email.
//
// Called from the client immediately after a journal entry with
// mentions is created. The function:
//   1. Validates the caller's auth (Bearer JWT)
//   2. Confirms the caller is the author of the entry (no email
//      injection from third parties)
//   3. Loads the entry + task + mentioned people + recipients' email
//      prefs in one round-trip
//   4. Sends one email per recipient who hasn't opted out and isn't
//      the author themselves, via the shared sendEmail() helper
//
// Required env:
//   SUPABASE_URL                — for the rest client
//   SUPABASE_ANON_KEY           — for the rest client (RLS-respecting)
//   SUPABASE_SERVICE_ROLE_KEY   — for reading auth.users emails
//   RESEND_API_KEY              — preferred email provider
//   EMAIL_FROM                  — friendly From: header, e.g.
//                                  "Tickd <notifications@…>"
//   APP_URL                     — e.g. https://tickd.netlify.app
//
// SMTP_* env vars are still honored as a fallback path inside the
// shared email module — useful during migration.

import { createClient } from '@supabase/supabase-js'
import { renderMentionEmail } from '../../src/lib/mentionEmailTemplate.js'
import { sendEmail, emailProvider, emailDiagnostic } from './_lib/email.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Resolve the app's public URL with a defensive multi-level fallback.
// Used to build the "View comment" deep-link in the email. We do NOT
// want to silently fall through to '#' — Gmail rewrites that into its
// internal anchor format and the CTA stops working.
//
// Order of preference:
//   1. process.env.APP_URL      — explicit production override
//   2. request Origin/Referer   — works even when env vars are unset
//   3. process.env.URL          — Netlify auto-sets this
//   4. process.env.DEPLOY_PRIME_URL — fallback for preview deploys
//   5. http://localhost:5173    — last resort
//
// Forgiving normalization: a bare domain like `tickd.netlify.app`
// (common mistake when entering env vars without the scheme) gets
// auto-prefixed with `https://`. Localhost-style values get `http://`.
// Each candidate's source is logged so a misconfiguration is visible
// in one Netlify log line.
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
    // Auto-prepend a scheme so bare-domain misconfigurations still work.
    if (!/^https?:\/\//i.test(s)) {
      if (/^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(s)) {
        s = `http://${s}`
      } else if (/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+/i.test(s)) {
        s = `https://${s}`
      } else {
        // Not a domain, not a URL — give up on this candidate.
        continue
      }
    }
    try {
      const u = new URL(s)
      const final = `${u.protocol}//${u.host}`
      console.log(
        `[notify-mention] APP_URL resolved from ${source}: ${final} (raw=${raw})`,
      )
      return final
    } catch {
      continue
    }
  }
  console.warn(
    '[notify-mention] no usable APP_URL — set APP_URL env var to https://your-site',
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
      `Server missing email config. Function sees: ${JSON.stringify(diag)}. ` +
        'Make sure RESEND_API_KEY + EMAIL_FROM are scoped to "Functions" in Netlify env vars and the site has been redeployed since they were added.',
    )
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError(500, 'Server missing SUPABASE_SERVICE_ROLE_KEY')
  }

  // Resolve the app URL ONCE per request so all callsites below get
  // the same value. Logged for forensic diagnosis of "View comment"
  // link issues.
  const APP_URL = resolveAppUrl(req)
  console.log(
    `[notify-mention] resolved APP_URL=${APP_URL} env_APP_URL=${process.env.APP_URL || '(unset)'} env_URL=${process.env.URL || '(unset)'} origin=${req.headers.get('origin') || '(unset)'}`,
  )

  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError(401, 'Missing bearer token')
  }
  const jwt = authHeader.slice('Bearer '.length).trim()

  // Two clients: RLS-respecting for the membership / journal check,
  // service-role for reading auth.users emails.
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

  // `test_to_self: true` short-circuits the normal entry-driven flow
  // and emails the caller with a sample mention. Used by the
  // "Send test email" button in Settings so users can verify their
  // delivery setup (SMTP, opt-out toggle, spam filtering) without
  // having to coordinate with another teammate.
  if (body?.test_to_self === true) {
    const workspaceId = String(body?.workspace_id ?? '').trim()
    if (!workspaceId) return jsonError(400, 'workspace_id is required')
    return handleSelfTest({
      caller,
      userClient,
      workspaceId,
      appUrl: APP_URL,
    })
  }

  const entryId = String(body?.entry_id ?? '').trim()
  if (!entryId) return jsonError(400, 'entry_id is required')

  // Verbose tracing so deliverability issues are debuggable from the
  // Netlify function logs without re-deploying with extra logs.
  console.log(`[notify-mention] start entry=${entryId} caller=${caller.id}`)

  // Fetch the entry + task + mentions. RLS gates this to entries the
  // caller can see (workspace member) AND we verify the caller is the
  // author below so a malicious client can't trigger emails for entries
  // they didn't write.
  const { data: entry, error: entryErr } = await userClient
    .from('journal_entries')
    .select(
      'id, body, mentions, author_id, task_id, created_at, task:tasks(id, title, workspace_id)',
    )
    .eq('id', entryId)
    .single()
  if (entryErr || !entry) return jsonError(404, 'Entry not found')
  if (entry.author_id !== caller.id) {
    return jsonError(403, 'Only the entry author can trigger notifications')
  }
  if (!entry.task) return jsonError(404, 'Source task missing')

  const mentionIds = (entry.mentions ?? []).filter(Boolean)
  console.log(
    `[notify-mention] entry resolved task=${entry.task?.id} mentions=${mentionIds.length}`,
  )
  if (mentionIds.length === 0) {
    console.log('[notify-mention] no mentions on entry — exit')
    return new Response(JSON.stringify({ sent: 0, skipped: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  // Workspace context — name + brand colour for the template, and
  // membership rows so we can filter to opt-in recipients.
  const workspaceId = entry.task.workspace_id
  const { data: workspace } = userClient
    ? await userClient
        .from('workspaces')
        .select('id, name, brand_color')
        .eq('id', workspaceId)
        .single()
    : { data: null }
  if (!workspace) return jsonError(404, 'Workspace not found')

  // Mentioned people + their linked user ids + per-membership opt-out.
  // RLS lets workspace members read other people in the same workspace,
  // so userClient is fine here.
  const { data: people } = await userClient
    .from('people')
    .select('id, name, user_id')
    .in('id', mentionIds)
  const peopleByUser = new Map()
  for (const p of people ?? []) {
    if (p.user_id) peopleByUser.set(p.user_id, p)
  }
  const userIds = Array.from(peopleByUser.keys())
  console.log(
    `[notify-mention] resolved ${userIds.length}/${mentionIds.length} mentioned people to linked users`,
  )
  if (userIds.length === 0) {
    console.log(
      '[notify-mention] none of the mentioned people are linked to a user account — exit. ',
      'Person IDs:',
      mentionIds,
    )
    return new Response(JSON.stringify({ sent: 0, skipped: mentionIds.length }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  // Opt-out check. workspace_members.email_mentions_enabled = false → skip.
  const { data: prefs } = await userClient
    .from('workspace_members')
    .select('user_id, email_mentions_enabled')
    .eq('workspace_id', workspaceId)
    .in('user_id', userIds)
  const optedOut = new Set(
    (prefs ?? [])
      .filter((p) => p.email_mentions_enabled === false)
      .map((p) => p.user_id),
  )

  // Author identity — for the email header.
  const { data: callerPerson } = await userClient
    .from('people')
    .select('name')
    .eq('workspace_id', workspaceId)
    .eq('user_id', caller.id)
    .maybeSingle()
  const mentionerName =
    callerPerson?.name ??
    caller.user_metadata?.full_name ??
    caller.email?.split('@')[0] ??
    'A teammate'

  // Recipient emails via service role — auth.users isn't readable
  // through the regular client. We pull only the needed user ids by
  // looping listUsers paginated, which is fine for small workspaces.
  // For larger orgs we'd switch to admin.getUserById per id; same
  // round-trip count.
  const emailByUser = new Map()
  for (const uid of userIds) {
    const { data: u } = await adminClient.auth.admin.getUserById(uid)
    if (u?.user?.email) emailByUser.set(uid, u.user.email)
  }

  // Build the task URL — cold-start deep link Home.jsx already handles
  // (`?task=<id>` → opens the modal). `&focus=comments` opens the
  // modal straight to the Comments tab so the user lands where the
  // mention actually is.
  const taskUrl = `${APP_URL.replace(/\/$/, '')}/?task=${entry.task.id}&focus=comments`
  const unsubscribeUrl = `${APP_URL.replace(/\/$/, '')}/?view=today#email-prefs`
  console.log(`[notify-mention] taskUrl=${taskUrl}`)

  let sent = 0
  let skipped = 0
  const skipReasons = []
  for (const uid of userIds) {
    if (uid === caller.id) {
      skipped++
      skipReasons.push({ user_id: uid, reason: 'is the comment author' })
      continue
    }
    if (optedOut.has(uid)) {
      skipped++
      skipReasons.push({ user_id: uid, reason: 'opted out of mention emails' })
      continue
    }
    const email = emailByUser.get(uid)
    if (!email) {
      skipped++
      skipReasons.push({
        user_id: uid,
        reason: 'no email on auth.users record',
      })
      continue
    }
    const person = peopleByUser.get(uid)
    const { subject, html, text } = renderMentionEmail({
      recipientName: person?.name,
      mentionerName,
      taskTitle: entry.task.title,
      commentExcerpt: entry.body,
      workspaceName: workspace.name,
      workspaceBrandColor: workspace.brand_color,
      taskUrl,
      appUrl: APP_URL,
      unsubscribeUrl,
    })
    try {
      const result = await sendEmail({
        to: email,
        subject,
        html,
        text,
        tags: [{ name: 'kind', value: 'mention' }],
      })
      sent++
      console.log(
        `[notify-mention] sent via ${result.provider} to ${email} (user ${uid}, person ${person?.id}, id ${result.id})`,
      )
    } catch (err) {
      console.error(
        `[notify-mention] send FAILED to ${email}:`,
        err?.message ?? err,
      )
      skipped++
      skipReasons.push({ user_id: uid, reason: `send error: ${err?.message ?? err}` })
    }
  }

  console.log(
    `[notify-mention] done sent=${sent} skipped=${skipped}`,
    skipReasons.length ? skipReasons : '',
  )
  return new Response(JSON.stringify({ sent, skipped, skipReasons }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

// ============================================================
// Self-test path — fires a sample mention email to the caller
// ============================================================
//
// Used by Settings → "Send test email" so users can verify their
// own mention-email delivery without coordinating with a teammate.
// The body is fabricated, but the template, SMTP transport, and
// recipient lookup are exactly what the real send uses, so a
// successful test == a real mention would also arrive.
async function handleSelfTest({ caller, userClient, workspaceId, appUrl }) {
  // APP_URL is now resolved per-request in the main handler and passed
  // through here so the self-test email uses the same deep-link rules
  // as the real mention email path.
  const APP_URL = appUrl
  console.log(
    `[notify-mention] SELF-TEST caller=${caller.id} workspace=${workspaceId}`,
  )

  // Membership check — caller must belong to the workspace they're
  // claiming. Otherwise an outside user could spam the function.
  const { data: membership } = await userClient
    .from('workspace_members')
    .select('workspace_id, email_mentions_enabled')
    .eq('user_id', caller.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!membership) {
    console.warn('[notify-mention] self-test: caller not in workspace')
    return jsonError(403, 'Not a member of that workspace')
  }

  // Workspace metadata for the template (name + brand color).
  const { data: workspace } = await userClient
    .from('workspaces')
    .select('id, name, brand_color')
    .eq('id', workspaceId)
    .maybeSingle()
  if (!workspace) return jsonError(404, 'Workspace not found')

  // Caller's display name — same lookup path the real flow uses.
  const { data: callerPerson } = await userClient
    .from('people')
    .select('name')
    .eq('workspace_id', workspaceId)
    .eq('user_id', caller.id)
    .maybeSingle()
  const recipientName =
    callerPerson?.name ??
    caller.user_metadata?.full_name ??
    caller.email?.split('@')[0] ??
    'there'

  const recipientEmail = caller.email
  if (!recipientEmail) {
    console.warn('[notify-mention] self-test: no email on auth.users record')
    return jsonError(500, 'No email on your account')
  }

  const firstName = recipientName.split(' ')[0]
  const { subject, html, text } = renderMentionEmail({
    recipientName,
    mentionerName: 'Tickd (test)',
    taskTitle: 'Sample task — try the BYD Shark stock check',
    commentExcerpt: `Hey @${firstName} — this is a test message from your own Tickd workspace. If you’re reading this, your mention email delivery is working end-to-end. You can turn these off any time from Settings → Profile.`,
    workspaceName: workspace.name,
    workspaceBrandColor: workspace.brand_color,
    taskUrl: `${APP_URL.replace(/\/$/, '')}/`,
    appUrl: APP_URL,
    unsubscribeUrl: `${APP_URL.replace(/\/$/, '')}/?view=today#email-prefs`,
  })

  try {
    const result = await sendEmail({
      to: recipientEmail,
      subject,
      html,
      text,
      tags: [{ name: 'kind', value: 'mention-test' }],
    })
    console.log(
      `[notify-mention] self-test sent via ${result.provider} to ${recipientEmail} (id ${result.id})`,
    )
    return new Response(
      JSON.stringify({
        sent: 1,
        to: recipientEmail,
        provider: result.provider,
        id: result.id,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )
  } catch (err) {
    console.error(
      `[notify-mention] self-test send FAILED to ${recipientEmail}:`,
      err?.message ?? err,
    )
    return jsonError(500, `Send failed: ${err?.message ?? err}`)
  }
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
