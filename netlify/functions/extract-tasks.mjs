// Netlify Function — extracts action items from a pasted meeting transcript
// using Claude. Returns structured task drafts the client can review and
// bulk-insert.
//
// Auth: caller must pass their Supabase JWT in Authorization: Bearer <jwt>.
// We verify it, load their workspace people + departments via the same JWT
// (so RLS still applies), then call Claude with that context.
//
// Required Netlify env vars:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (already present)
//   ANTHROPIC_API_KEY                          (add via Site settings → Env)

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
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
    return jsonError(500, 'Server missing ANTHROPIC_API_KEY')
  }

  // ---------- Auth ----------
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError(401, 'Missing bearer token')
  }
  const jwt = authHeader.slice('Bearer '.length).trim()

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return jsonError(401, 'Invalid token')
  }
  const user = userData.user

  // ---------- Body ----------
  let body
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Invalid JSON body')
  }
  const transcript = String(body?.transcript ?? '').trim()
  if (!transcript) {
    return jsonError(400, 'transcript is required')
  }
  if (transcript.length > 50000) {
    return jsonError(413, 'transcript too long (max 50k chars)')
  }

  // ---------- Load workspace context ----------
  const { data: member, error: memberErr } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (memberErr || !member) {
    return jsonError(403, 'No workspace for this user')
  }

  const [peopleRes, deptsRes] = await Promise.all([
    supabase
      .from('people')
      .select('name, title, department, role')
      .eq('workspace_id', member.workspace_id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('departments')
      .select('name')
      .eq('workspace_id', member.workspace_id)
      .order('name'),
  ])

  const people = peopleRes.data ?? []
  const departments = deptsRes.data ?? []

  if (people.length === 0) {
    return jsonError(400, 'No active people in workspace — onboard PICs first')
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
          content: `Today's date: ${today}\n\nMeeting transcript / notes:\n\n${transcript}`,
        },
      ],
    })
  } catch (err) {
    console.warn('[extract-tasks] anthropic error', err)
    if (err instanceof Anthropic.APIError) {
      return jsonError(err.status ?? 500, `Claude API error: ${err.message}`)
    }
    return jsonError(500, 'Extraction failed')
  }

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse) {
    return jsonError(500, 'Model did not return a structured extraction')
  }

  return new Response(
    JSON.stringify({
      tasks: toolUse.input?.tasks ?? [],
      usage: response.usage,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
