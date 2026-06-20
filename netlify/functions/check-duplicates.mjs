// Netlify Function — AI-powered duplicate task detection.
//
// Two modes:
//
//   1. mode='new-task' + new_task_id
//      Compare ONE freshly-created task against the rest of the PIC's
//      open tasks. Fires automatically from the client after a task
//      creates. Returns at most one match (the closest), so the UI
//      can pop a single non-modal "looks like a duplicate of X?"
//      toast.
//
//   2. mode='batch' + pic_id
//      Sweep ALL open tasks for a single PIC and return every pair
//      that looks like the same underlying work. Fires when the user
//      clicks "Scan for duplicates" in the PIC view.
//
// Both modes use Claude Haiku for cost (one paid call per scan, ~5k
// tokens prompt / 1k response). The system prompt is tuned for the
// "same action restated" case (which the user flagged as the most
// common); Claude is also told NOT to match across different external
// entities (different customer / different vehicle).
//
// Dismissed pairs are filtered server-side: we read
// task_duplicate_dismissals and drop matching pairs before responding.
//
// Required env (Functions scope):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   ANTHROPIC_API_KEY

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { logServerError } from './_lib/errorLog.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

const MODEL = 'claude-haiku-4-5-20251001'

// Hard cap on tasks examined per call. Keeps Claude latency + token
// cost predictable even for a heavy PIC with hundreds of open tasks.
// If we hit the cap the scan is "best-effort over the most recent N";
// the UI calls this out.
const MAX_TASKS_PER_SCAN = 80

const SYSTEM_PROMPT = `You detect duplicate tasks for a single person (PIC) in a workplace task manager.

Your job: identify pairs (or groups) of tasks that represent the SAME underlying work, even when the wording differs. The most common case is the same action restated — e.g. "Order brake pads" and "Get the brake parts in" are duplicates.

Rules:
- Only flag pairs that are very likely the same work. Err on the side of NOT matching when unsure.
- Do NOT match across different external entities — different customer names, different vehicle plates, different invoice numbers mean different tasks.
- Two general tasks ("Send weekly update" twice) are duplicates only if they obviously refer to the same instance, not recurring work.
- A sub-task of a larger task is NOT a duplicate of the larger task — they're related but distinct.
- Confidence levels:
    - "high"   — clearly the same work; safe to suggest as a duplicate
    - "medium" — looks like a duplicate but the user should verify
    - Skip pairs you'd rate "low" — don't return them at all.
- "reason" is one short sentence explaining why they're duplicates ("Both are about ordering brake pads for the same vehicle").`

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError(500, 'Server missing SUPABASE_SERVICE_ROLE_KEY')
  }
  if (!ANTHROPIC_API_KEY) {
    return jsonError(500, 'Server missing ANTHROPIC_API_KEY')
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
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonError(401, 'Invalid token')
  const caller = userData.user

  let body
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Invalid JSON body')
  }

  const mode = String(body?.mode ?? '').trim()
  const workspaceId = String(body?.workspace_id ?? '').trim()
  const picId = String(body?.pic_id ?? '').trim()
  const newTaskId = body?.new_task_id ? String(body.new_task_id) : null

  if (!workspaceId) return jsonError(400, 'workspace_id required')
  if (mode !== 'new-task' && mode !== 'batch') {
    return jsonError(400, 'mode must be "new-task" or "batch"')
  }
  if (!picId) return jsonError(400, 'pic_id required')
  if (mode === 'new-task' && !newTaskId) {
    return jsonError(400, 'new_task_id required when mode=new-task')
  }

  // Pull this PIC's open tasks. RLS scopes the visibility automatically
  // (caller must be in the workspace), so we don't add a workspace
  // filter — and they'll still only see tasks they can read.
  const { data: tasks, error: tErr } = await userClient
    .from('tasks')
    .select('id, title, notes, due_date, created_at, status')
    .eq('pic_id', picId)
    .neq('status', 'Done')
    .order('created_at', { ascending: false })
    .limit(MAX_TASKS_PER_SCAN)
  if (tErr) {
    console.warn('[check-duplicates] tasks fetch failed', tErr)
    return jsonError(500, tErr.message)
  }
  if (!tasks || tasks.length < 2) {
    return new Response(
      JSON.stringify({ pairs: [], total_scanned: tasks?.length ?? 0 }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  // Existing dismissals to filter results.
  const { data: dismissals } = await userClient
    .from('task_duplicate_dismissals')
    .select('task_a_id, task_b_id')
    .eq('workspace_id', workspaceId)
  const dismissed = new Set(
    (dismissals ?? []).map((d) => `${d.task_a_id}|${d.task_b_id}`),
  )

  // Mode 1: new-task — compare the new task against the rest.
  // Mode 2: batch — find all pairs in the list.
  let prompt
  if (mode === 'new-task') {
    const newTask = tasks.find((t) => t.id === newTaskId)
    if (!newTask) {
      // The new task is no longer in this PIC's open pool (status
      // changed, PIC reassigned, race with realtime). Quietly return
      // no matches.
      return new Response(
        JSON.stringify({ pairs: [], total_scanned: tasks.length }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const others = tasks.filter((t) => t.id !== newTaskId)
    prompt = `A new task was just created. Find the single most likely existing duplicate (if any).

NEW TASK:
${formatTask(newTask)}

EXISTING OPEN TASKS for the same PIC:
${others.map(formatTask).join('\n')}

Return at most ONE pair, with task_a_id = ${newTaskId} and task_b_id = the matching existing task. Skip if no match is high or medium confidence.`
  } else {
    prompt = `Find all duplicate pairs among this PIC's open tasks. List each pair once.

TASKS:
${tasks.map(formatTask).join('\n')}

Return pairs canonical: task_a_id = the smaller id alphabetically, task_b_id = the larger.`
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  let toolResult
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'submit_duplicates',
          description: 'Submit detected duplicate pairs.',
          input_schema: {
            type: 'object',
            properties: {
              pairs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    task_a_id: { type: 'string' },
                    task_b_id: { type: 'string' },
                    reason: { type: 'string' },
                    confidence: {
                      type: 'string',
                      enum: ['high', 'medium'],
                    },
                  },
                  required: ['task_a_id', 'task_b_id', 'reason', 'confidence'],
                },
              },
            },
            required: ['pairs'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_duplicates' },
      messages: [{ role: 'user', content: prompt }],
    })
    const toolUse = response.content.find((b) => b.type === 'tool_use')
    toolResult = toolUse?.input ?? { pairs: [] }
  } catch (err) {
    logServerError({
      source: 'netlify-fn:check-duplicates',
      message: `Claude call failed: ${err?.message ?? err}`,
      context: { mode, pic_id: picId, stack: err?.stack ?? null },
      workspaceId,
      userId: caller.id,
    })
    return jsonError(502, `Claude error: ${err?.message ?? err}`)
  }

  // Canonicalise + filter dismissed + drop self-matches and invalid ids
  const validIds = new Set(tasks.map((t) => t.id))
  const seen = new Set()
  const cleanPairs = []
  for (const p of toolResult.pairs ?? []) {
    let { task_a_id: a, task_b_id: b, reason, confidence } = p
    if (!validIds.has(a) || !validIds.has(b) || a === b) continue
    // Canonical order (smaller first)
    if (a > b) [a, b] = [b, a]
    const key = `${a}|${b}`
    if (seen.has(key)) continue
    if (dismissed.has(key)) continue
    seen.add(key)
    cleanPairs.push({
      task_a_id: a,
      task_b_id: b,
      task_a: pickTaskSummary(tasks.find((t) => t.id === a)),
      task_b: pickTaskSummary(tasks.find((t) => t.id === b)),
      reason: String(reason ?? '').slice(0, 280),
      confidence,
    })
  }

  return new Response(
    JSON.stringify({
      pairs: cleanPairs,
      total_scanned: tasks.length,
      hit_cap: tasks.length >= MAX_TASKS_PER_SCAN,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

// Compact JSON-like rendering keeps token count down. Notes truncated
// to 200 chars so a wall of text in one task doesn't drown out the
// signal from the title.
function formatTask(t) {
  const notes = t.notes ? ` notes:"${truncate(t.notes, 200)}"` : ''
  const due = t.due_date ? ` due:${t.due_date}` : ''
  return `- id:${t.id} title:"${escapeQuotes(truncate(t.title, 200))}"${due}${notes}`
}

function pickTaskSummary(t) {
  if (!t) return null
  return {
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    status: t.status,
    created_at: t.created_at,
  }
}

function truncate(s, max) {
  if (!s) return ''
  const str = String(s)
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}
function escapeQuotes(s) {
  return String(s).replace(/"/g, '\\"')
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
