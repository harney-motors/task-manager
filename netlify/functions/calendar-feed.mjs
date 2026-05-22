// Netlify Function — public .ics feed for a calendar subscription.
//
// Auth: by the token in the URL. No JWT — calendar apps subscribe with
// plain HTTP GET and refresh on their own schedule, so the URL itself
// has to be the secret. We use the service role key to look up the
// token (RLS would otherwise block anonymous reads).
//
// URL shape:
//   /.netlify/functions/calendar-feed?token=<token>
//   /calendar/<token>.ics                         (via netlify.toml rewrite)
//
// Required Netlify env vars (Functions scope):
//   SUPABASE_URL, SUPABASE_ANON_KEY (anon used for select; service for write)
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return new Response('server misconfigured', { status: 500 })
  }

  const url = new URL(req.url)
  const token = (url.searchParams.get('token') ?? '').trim()
  if (!token) {
    return new Response('token required', { status: 400 })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ---------- Resolve token ----------
  const { data: tokenRow, error: tokenErr } = await admin
    .from('calendar_feed_tokens')
    .select('id, user_id, workspace_id, revoked_at')
    .eq('token', token)
    .maybeSingle()
  if (tokenErr || !tokenRow || tokenRow.revoked_at) {
    return new Response('not found', { status: 404 })
  }

  // ---------- Fetch workspace + tasks ----------
  const [{ data: workspace }, { data: tasks }] = await Promise.all([
    admin
      .from('workspaces')
      .select('id, name')
      .eq('id', tokenRow.workspace_id)
      .maybeSingle(),
    admin
      .from('tasks')
      .select(
        'id, task_number, title, status, priority, due_date, updated_at, pic:people!tasks_pic_id_fkey(name)',
      )
      .eq('workspace_id', tokenRow.workspace_id)
      .not('due_date', 'is', null),
  ])

  if (!workspace) {
    return new Response('workspace gone', { status: 410 })
  }

  // ---------- Record access (fire-and-forget) ----------
  admin
    .from('calendar_feed_tokens')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', tokenRow.id)
    .then(() => {}, () => {})

  // ---------- Render .ics ----------
  const body = renderIcs({
    workspaceName: workspace.name,
    tasks: tasks ?? [],
  })

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `inline; filename="tickd-${slug(workspace.name)}.ics"`,
      // Calendar apps cache aggressively; let them, but allow a short
      // refresh so changes show up reasonably fast.
      'cache-control': 'public, max-age=900',
    },
  })
}

// ---------- ICS rendering ----------

function renderIcs({ workspaceName, tasks }) {
  const now = formatUtc(new Date())
  const calName = `Tickd · ${workspaceName}`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Harney Motors//Tickd//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
    `X-WR-CALDESC:${escapeText('Task due dates from Tickd')}`,
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ]

  for (const t of tasks) {
    if (!t.due_date) continue
    const date = t.due_date.replaceAll('-', '') // YYYYMMDD
    const dtstamp = t.updated_at ? formatUtc(new Date(t.updated_at)) : now
    const summary = buildSummary(t)
    const description = buildDescription(t)
    const status = t.status === 'Done' ? 'CANCELLED' : 'CONFIRMED'
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:tickd-task-${t.id}@tickd.hml.ag`)
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(`DTSTART;VALUE=DATE:${date}`)
    // All-day events: DTEND is exclusive; one day after DTSTART
    lines.push(`DTEND;VALUE=DATE:${addOneDay(date)}`)
    lines.push(`SUMMARY:${escapeText(summary)}`)
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`)
    lines.push(`STATUS:${status}`)
    if (t.priority === 'High') lines.push('PRIORITY:1')
    else if (t.priority === 'Low') lines.push('PRIORITY:9')
    lines.push('TRANSP:TRANSPARENT') // doesn't block your free/busy
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  // RFC 5545: lines must be CRLF-terminated and folded at 75 octets
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

function buildSummary(t) {
  const num = t.task_number ? `#${t.task_number} ` : ''
  return `${num}${t.title}`
}

function buildDescription(t) {
  const parts = []
  if (t.pic?.name) parts.push(`PIC: ${t.pic.name}`)
  if (t.status) parts.push(`Status: ${t.status}`)
  if (t.priority) parts.push(`Priority: ${t.priority}`)
  parts.push('Open in Tickd: https://tickd.hml.ag')
  return parts.join('\\n')
}

function escapeText(s) {
  // RFC 5545 §3.3.11: escape backslash, semicolon, comma, newline
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function foldLine(line) {
  // RFC 5545 §3.1: lines longer than 75 octets MUST be folded.
  // Continuation lines start with a single space.
  if (line.length <= 75) return line
  const parts = []
  let remaining = line
  // First chunk: 75 chars
  parts.push(remaining.slice(0, 75))
  remaining = remaining.slice(75)
  // Subsequent chunks: 74 chars (leading space counts as 1)
  while (remaining.length > 74) {
    parts.push(' ' + remaining.slice(0, 74))
    remaining = remaining.slice(74)
  }
  if (remaining.length > 0) parts.push(' ' + remaining)
  return parts.join('\r\n')
}

function formatUtc(d) {
  // YYYYMMDDTHHMMSSZ
  const pad = (n) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

function addOneDay(yyyymmdd) {
  const y = Number(yyyymmdd.slice(0, 4))
  const m = Number(yyyymmdd.slice(4, 6))
  const d = Number(yyyymmdd.slice(6, 8))
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  const pad = (n) => String(n).padStart(2, '0')
  return (
    dt.getUTCFullYear().toString() +
    pad(dt.getUTCMonth() + 1) +
    pad(dt.getUTCDate())
  )
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}
