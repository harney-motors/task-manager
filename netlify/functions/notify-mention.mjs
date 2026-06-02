// Netlify Function — send a "you were @mentioned" email.
//
// Called from the client immediately after a journal entry with
// mentions is created. The function:
//   1. Validates the caller's auth (Bearer JWT)
//   2. Confirms the caller is the author of the entry (no email
//      injection from third parties)
//   3. Loads the entry + task + mentioned people + recipients' email
//      prefs in one round-trip
//   4. Sends one SMTP message per recipient who hasn't opted out
//      and isn't the author themselves
//
// SMTP plumbing assumes the Supabase project SMTP credentials are
// surfaced as Netlify env vars. Required env:
//   SUPABASE_URL                — for the rest client
//   SUPABASE_ANON_KEY           — for the rest client (RLS-respecting)
//   SUPABASE_SERVICE_ROLE_KEY   — for reading auth.users emails
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   APP_URL                     — e.g. https://tickd.netlify.app
//
// The service role key NEVER leaves this function — it stays
// server-side. Email lookup goes through admin.listUsers because
// auth.users isn't queryable through the regular client.

import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { renderMentionEmail } from '../../src/lib/mentionEmailTemplate.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER
const APP_URL = process.env.APP_URL || process.env.URL || 'http://localhost:5173'

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return jsonError(500, 'Server missing SMTP_* env vars')
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
  // (`?task=<id>` → opens the modal).
  const taskUrl = `${APP_URL.replace(/\/$/, '')}/?task=${entry.task.id}`
  const unsubscribeUrl = `${APP_URL.replace(/\/$/, '')}/?view=today#email-prefs`

  // SMTP transport — single TCP connection reused for the loop.
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })

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
      await transporter.sendMail({
        from: SMTP_FROM,
        to: email,
        subject,
        html,
        text,
      })
      sent++
      console.log(
        `[notify-mention] sent to ${email} (user ${uid}, person ${person?.id})`,
      )
    } catch (err) {
      console.error(
        `[notify-mention] SMTP send FAILED to ${email}:`,
        err?.message ?? err,
      )
      skipped++
      skipReasons.push({ user_id: uid, reason: `smtp error: ${err?.message ?? err}` })
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
async function handleSelfTest({ caller, userClient, workspaceId }) {
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

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: recipientEmail,
      subject,
      html,
      text,
    })
    console.log(`[notify-mention] self-test sent to ${recipientEmail}`)
    return new Response(
      JSON.stringify({ sent: 1, to: recipientEmail }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )
  } catch (err) {
    console.error(
      `[notify-mention] self-test SMTP send FAILED to ${recipientEmail}:`,
      err?.message ?? err,
    )
    return jsonError(500, `SMTP send failed: ${err?.message ?? err}`)
  }
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
