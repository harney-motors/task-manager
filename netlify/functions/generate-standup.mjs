// Netlify Function — generate a copy-paste daily standup for the
// signed-in user. Pulls today's activity from the user's workspace
// (their owned tasks + tasks they watch), asks Claude to compose a
// friendly markdown summary, and returns it.
//
// Sections covered: Done today / In progress / Watched updates /
// Due tomorrow. The model has discretion to skip empty sections.
//
// Auth: Bearer JWT. Required env: SUPABASE_URL, SUPABASE_ANON_KEY,
// ANTHROPIC_API_KEY.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

function buildSystemPrompt({ tone, format, scope }) {
  const styleNote =
    tone === 'detailed'
      ? 'Include a sentence of context for each item — what shifted or what comes next.'
      : 'Keep each line terse — title only, plus PIC if it isn\'t me.'
  const formatNote =
    format === 'plain'
      ? `Format as plain text, NO Markdown headings (#), NO bullet asterisks. Use simple lines like "Done today:" followed by indented dashes. Emojis are fine.`
      : `Format strictly as Markdown.`
  const speakerNote =
    scope === 'team'
      ? `Speak in third person about the whole team — "Anna closed", "James is working on…", "We have 3 items due tomorrow."`
      : `Speak in first person — "I closed", "I noted", "Errol's task is now…".`

  return `You are an executive standup writer for Tickd.

You are given a single user's workspace state plus a structured digest of what changed today. Produce a short, friendly standup the user can paste straight into Slack / WhatsApp / email.

${formatNote}

Sections, each optional (skip if empty):

✅ Done${scope === 'team' ? '' : ' today'}
- Title — (PIC if not me)

🔄 In progress
- Title

📝 Notes added
- "First line of the note" — Task title

👀 Updates I'm watching
- Title — what changed

⏰ Due tomorrow
- Title — (PIC)

Rules:
- Keep titles short; truncate at ~70 chars with "…" if needed.
- If nothing happened, return a single-line "Quiet day — nothing to report." (no headings).
- ${speakerNote}
- ${styleNote}
- Do NOT invent activity. If the digest is empty for a section, omit it.`
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!ANTHROPIC_API_KEY) return jsonError(500, 'Server missing ANTHROPIC_API_KEY')

  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing bearer token')
  const jwt = authHeader.slice('Bearer '.length).trim()

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonError(401, 'Invalid token')
  const user = userData.user

  let body
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Invalid JSON body')
  }
  const workspaceId = String(body?.workspace_id ?? '').trim()
  if (!workspaceId) return jsonError(400, 'workspace_id is required')

  // Pre-flight options (all optional, all have defaults).
  //   scope:   'mine' (default) | 'team'      — whose activity to include
  //   period:  'today' (default) | 'yesterday-today' — for Monday-style standups
  //   tone:    'brief' (default) | 'detailed' — verbosity of each bullet
  //   format:  'markdown' (default) | 'plain' — output format
  const scope = body?.scope === 'team' ? 'team' : 'mine'
  const period = body?.period === 'yesterday-today' ? 'yesterday-today' : 'today'
  const tone = body?.tone === 'detailed' ? 'detailed' : 'brief'
  const format = body?.format === 'plain' ? 'plain' : 'markdown'

  // Membership gate
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!membership) return jsonError(403, 'Not a member of that workspace')

  // Find caller's person row (so we can identify "my" tasks)
  const { data: meRow } = await supabase
    .from('people')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  const todayIso = new Date().toISOString().slice(0, 10)
  const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  // "Period" controls how far back we look for completed work + notes.
  // For Monday standups, weekend changes go missing without yesterday-today.
  const periodStartIso = period === 'yesterday-today' ? yesterdayIso : todayIso
  function inPeriod(ts) {
    if (!ts) return false
    return ts.slice(0, 10) >= periodStartIso
  }

  // Pull tasks once with watchers + journal date hints
  const { data: tasks } = await supabase
    .from('tasks')
    .select(`
      id, title, status, priority, due_date, pic_id, updated_at,
      pic:people!tasks_pic_id_fkey(id, name),
      task_watchers(person:people(id, user_id))
    `)
    .eq('workspace_id', workspaceId)

  // Build the digest the model reasons over.
  const myId = meRow?.id ?? null
  function isMine(t) {
    return myId && t.pic_id === myId
  }
  function isWatchedByMe(t) {
    return (t.task_watchers ?? []).some((tw) => tw.person?.user_id === user.id)
  }
  // Scope filter — 'mine' keeps the original "my owned + watched" lens;
  // 'team' broadens to the whole workspace so team leads can produce a
  // single roll-up for the group.
  function inScope(t) {
    if (scope === 'team') return true
    return isMine(t) || isWatchedByMe(t)
  }

  const doneToday = (tasks ?? [])
    .filter(
      (t) =>
        t.status === 'Done' &&
        inPeriod(t.updated_at) &&
        inScope(t),
    )
    .map((t) => ({
      title: t.title,
      pic: t.pic?.name ?? null,
      mine: isMine(t),
    }))

  const inProgress = (tasks ?? [])
    .filter((t) =>
      t.status === 'In progress' && (scope === 'team' ? true : isMine(t)),
    )
    .map((t) => ({
      title: t.title,
      due_date: t.due_date,
      pic: t.pic?.name ?? null,
      mine: isMine(t),
    }))

  const dueTomorrow = (tasks ?? [])
    .filter(
      (t) =>
        t.status !== 'Done' &&
        t.due_date === tomorrowIso &&
        (scope === 'team' ? true : isMine(t) || isWatchedByMe(t)),
    )
    .map((t) => ({
      title: t.title,
      pic: t.pic?.name ?? null,
      mine: isMine(t),
    }))

  // Journal entries within the period. In 'team' scope we pull everyone's
  // notes for the workspace; in 'mine' scope we pull only the caller's.
  const notesQuery = supabase
    .from('journal_entries')
    .select('body, created_at, author_id, task:tasks(id, title, workspace_id)')
    .gte('created_at', `${periodStartIso}T00:00:00`)
    .order('created_at', { ascending: true })
  if (scope !== 'team') notesQuery.eq('author_id', user.id)
  const { data: rawNotes } = await notesQuery

  const notes = (rawNotes ?? [])
    .filter((n) => n.task?.workspace_id === workspaceId)
    .map((n) => ({
      first_line: String(n.body ?? '').split(/\r?\n/)[0].slice(0, 120),
      task_title: n.task?.title ?? null,
      mine: n.author_id === user.id,
    }))

  // Watched updates within the period: tasks I watch (not mine) updated
  // in the window, still active. Not relevant in 'team' scope (the whole
  // team already shows up in doneToday / inProgress).
  const watchedUpdates =
    scope === 'team'
      ? []
      : (tasks ?? [])
          .filter(
            (t) =>
              isWatchedByMe(t) &&
              !isMine(t) &&
              inPeriod(t.updated_at) &&
              t.status !== 'Done', // 'Done' lands in doneToday above when relevant
          )
          .map((t) => ({
            title: t.title,
            pic: t.pic?.name ?? null,
            status: t.status,
          }))

  const digest = {
    date: todayIso,
    period,
    scope,
    tone,
    format,
    user_name: meRow?.name ?? user.email?.split('@')[0] ?? 'I',
    done_today: doneToday,
    in_progress: inProgress,
    my_notes: notes,
    watched_updates: watchedUpdates,
    due_tomorrow: dueTomorrow,
  }

  const totalActivity =
    doneToday.length +
    inProgress.length +
    notes.length +
    watchedUpdates.length +
    dueTomorrow.length

  if (totalActivity === 0) {
    return new Response(
      JSON.stringify({ markdown: 'Quiet day — nothing to report.' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  // Compose via Claude
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  let response
  try {
    response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: tone === 'detailed' ? 1200 : 800,
      system: buildSystemPrompt({ tone, format, scope }),
      messages: [
        {
          role: 'user',
          content: `Compose the standup for ${digest.user_name} (date ${digest.date}, scope=${scope}, period=${period}, tone=${tone}, format=${format}). Digest JSON:\n\n${JSON.stringify(
            digest,
            null,
            2,
          )}`,
        },
      ],
    })
  } catch (err) {
    console.warn('[generate-standup] anthropic error', err)
    return jsonError(500, 'Standup generation failed')
  }

  const block = response.content.find((b) => b.type === 'text')
  const markdown = block?.text?.trim() ?? ''
  return new Response(JSON.stringify({ markdown }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
