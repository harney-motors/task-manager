// Netlify Background Function — extracts action items from a meeting
// transcript stored in an ai_extraction_jobs row.
//
// The `-background` suffix is significant: Netlify recognises it,
// returns 202 to the caller immediately, then runs the function for
// up to 15 minutes. That sidesteps the 26s synchronous ceiling that
// kept timing out Opus extraction on long transcripts.
//
// Flow:
//   1. Client INSERTs an ai_extraction_jobs row (pending) and POSTs
//      its id here in `{ job_id }`. The user's JWT is in Authorization.
//   2. We read the row via the user's JWT (RLS gates it).
//   3. Call Claude.
//   4. UPDATE the row with result + status='completed' (or 'failed').
//   5. Client polls the row until status != 'pending'.
//
// Required Netlify env vars (Functions scope):
//   SUPABASE_URL, SUPABASE_ANON_KEY
//   ANTHROPIC_API_KEY

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

const SYSTEM_BASE = `You extract action items from executive meeting transcripts/notes for the Tickd task manager.

Your goal: produce a clean, structured list of tasks from the transcript. Match each task's Person-In-Charge (PIC) to one of the listed people by first name. Identify any other named people as watchers (collaborators who should be aware but aren't accountable).

Rules:
- Only extract actual action items — things someone agreed to do or was assigned. Do not extract general discussion, status reports without an action, or rhetorical questions.
- pic_first_name must match one of the listed people by first name (case-insensitive). If no specific person is assigned, leave it null.
- watcher_first_names: other people mentioned in connection with the task. Must also match the listed people.
- due_date: parse natural language ("by Friday", "next week", "end of June", "May 30") to ISO YYYY-MM-DD using "today" from the user message. Leave null if no date is mentioned. Do not invent dates.
- priority defaults to "Medium". Use "High" for explicit urgency ("ASAP", "critical", "urgent", "by EOD"). Use "Low" for clearly non-urgent or background items.
- status defaults to "Open". Use "In progress" only when the transcript clearly states work has started. Use "Ongoing" for perpetual / recurring initiatives ("weekly", "monthly", "continuously").
- title: clear and actionable, ideally starting with a verb ("Submit Q3 report" not "Q3 report"). Under 100 chars. No PIC name in the title (that's separate).
- source_quote: the exact phrase from the transcript this was extracted from — helps the user verify.
- If the transcript is empty or contains no action items, return an empty tasks array.`

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!ANTHROPIC_API_KEY) {
    // No row to update yet at this point; just log and bail. Caller
    // already got their 202 so this only surfaces in function logs.
    console.error('[extract-tasks-background] missing ANTHROPIC_API_KEY')
    return new Response('missing key', { status: 500 })
  }

  // ---------- Auth ----------
  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    console.warn('[extract-tasks-background] missing bearer')
    return new Response('unauthorized', { status: 401 })
  }
  const jwt = authHeader.slice('Bearer '.length).trim()

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ---------- Body ----------
  let body
  try {
    body = await req.json()
  } catch {
    return new Response('bad json', { status: 400 })
  }
  const jobId = String(body?.job_id ?? '').trim()
  if (!jobId) {
    return new Response('job_id required', { status: 400 })
  }

  // ---------- Load job row (RLS gates ownership) ----------
  const { data: job, error: jobErr } = await supabase
    .from('ai_extraction_jobs')
    .select('id, workspace_id, transcript, status')
    .eq('id', jobId)
    .maybeSingle()
  if (jobErr || !job) {
    console.warn('[extract-tasks-background] job not found', jobId, jobErr)
    return new Response('job not found', { status: 404 })
  }
  if (job.status !== 'pending') {
    // Already processed (or retry collision). Idempotent no-op.
    return new Response('already processed', { status: 200 })
  }

  // ---------- Load workspace context ----------
  const [peopleRes, deptsRes] = await Promise.all([
    supabase
      .from('people')
      .select('name, title, department, role')
      .eq('workspace_id', job.workspace_id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('departments')
      .select('name')
      .eq('workspace_id', job.workspace_id)
      .order('name'),
  ])

  const people = peopleRes.data ?? []
  const departments = deptsRes.data ?? []

  if (people.length === 0) {
    await failJob(supabase, jobId, 'No active people in workspace — onboard PICs first')
    return new Response('no people', { status: 200 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const peopleList = people
    .map((p) => {
      const first = p.name.split(' ')[0]
      const role = p.role === 'pic' ? 'PIC' : p.role
      return `- ${first} (${p.name}, ${role}${p.title ? ', ' + p.title : ''}${p.department ? ', ' + p.department : ''})`
    })
    .join('\n')
  const deptList = departments.map((d) => d.name).join(', ') || '(none)'

  const systemPrompt = `${SYSTEM_BASE}

Workspace people (first names matter for pic_first_name matching):
${peopleList}

Workspace departments (must match exactly if used):
${deptList}`

  // ---------- Call Claude ----------
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  let response
  try {
    response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      system: systemPrompt,
      tools: [
        {
          name: 'extract_tasks',
          description:
            'Submit the extracted action items as structured task drafts. ' +
            'Return an empty tasks array if no action items are present.',
          input_schema: {
            type: 'object',
            properties: {
              tasks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: {
                      type: 'string',
                      description:
                        'Clear, actionable title under 100 chars. Start with a verb when possible. Do not include the PIC name.',
                    },
                    pic_first_name: {
                      type: ['string', 'null'],
                      description:
                        'First name of the primary owner. Must match one of the listed people (case-insensitive). null if no one is assigned.',
                    },
                    department: {
                      type: ['string', 'null'],
                      description:
                        'Must match one of the listed department names exactly. null if not inferable.',
                    },
                    due_date: {
                      type: ['string', 'null'],
                      description:
                        'ISO YYYY-MM-DD. Parse natural-language dates relative to the today value in the user message. null if no date is mentioned.',
                    },
                    priority: {
                      type: 'string',
                      enum: ['High', 'Medium', 'Low'],
                    },
                    status: {
                      type: 'string',
                      enum: ['Open', 'In progress', 'Ongoing'],
                    },
                    watcher_first_names: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Other people named in the action item. Each must match one of the listed people by first name.',
                    },
                    source_quote: {
                      type: 'string',
                      description:
                        'The phrase from the transcript this task was extracted from.',
                    },
                  },
                  required: ['title', 'priority', 'status'],
                },
              },
            },
            required: ['tasks'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_tasks' },
      messages: [
        {
          role: 'user',
          content: `Today's date: ${today}\n\nMeeting transcript / notes:\n\n${job.transcript}`,
        },
      ],
    })
  } catch (err) {
    console.warn('[extract-tasks-background] anthropic error', err)
    const msg =
      err instanceof Anthropic.APIError
        ? `Claude API error: ${err.message}`
        : 'Extraction failed'
    await failJob(supabase, jobId, msg)
    return new Response('claude error', { status: 200 })
  }

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse) {
    await failJob(supabase, jobId, 'Model did not return a structured extraction')
    return new Response('no tool use', { status: 200 })
  }

  const tasks = toolUse.input?.tasks ?? []

  const { error: updateErr } = await supabase
    .from('ai_extraction_jobs')
    .update({
      status: 'completed',
      result: { tasks, usage: response.usage },
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (updateErr) {
    console.warn('[extract-tasks-background] update error', updateErr)
  }

  return new Response('ok', { status: 200 })
}

async function failJob(supabase, jobId, message) {
  await supabase
    .from('ai_extraction_jobs')
    .update({
      status: 'failed',
      error: message,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}
