// Netlify Function — Tier 3 AI: parse a natural-language query into
// either a read-only filter or a structured write-command PLAN. The
// server never executes; it only proposes. The client resolves the
// matcher locally, previews to the user, and writes only on confirm.
//
// Tools exposed to Claude (it picks via tool_choice: auto):
//   apply_filter   — read-only filter, same shape as nl-filter
//   propose_command — structured matcher + actions
//
// Hard cap on dangerous breadth is enforced client-side too, but we
// encourage the model to scope tightly via the system prompt.
//
// Auth: same Bearer JWT + workspace_id pattern as the other AI funcs.
// Required env vars (Functions scope):
//   SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

const SYSTEM_BASE = `You are the command parser for Tickd, an executive task manager.

The user types a natural-language query. Your job is to decide:

1. Is this a READ-ONLY filter query? ("show me Errol's overdue tasks", "what's Clem on this week")
   → Use the apply_filter tool. Same as the existing nl-filter behavior.

2. Is this a WRITE command? ("mark Errol's overdue as done", "move parts tasks to next Monday", "delete all done tasks from last month")
   → Use the propose_command tool. You output a MATCHER (selector spec) plus ACTIONS to apply.

NEVER guess intent — if it's ambiguous, prefer filter. The user can always rephrase if they wanted a command.

Rules:
- Resolve names by first-name (case-insensitive) against the listed people. If the query references a name not in the list, do not include that pic in the matcher; mention it in the summary so the user knows.
- Parse natural-language dates ("today", "by Friday", "next Monday", "end of June") to ISO YYYY-MM-DD using today's date from the user message.
- The matcher's include_done defaults to false. Set it true only if the user explicitly mentions Done / completed / finished work.
- Be conservative with destructive actions (delete, change-PIC-en-masse). If the query is vague, narrow the matcher so the preview shows few tasks; the user can always broaden.
- For the propose_command summary: a one-sentence plain-English recap of what will happen, including expected scope. Example: "Mark all of Errol's 5 overdue tasks as Done."
- For the propose_command confirmation_text: a short sentence emphasising the change scope. Example: "This will change the status of 5 tasks. Continue?"`

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
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
  const query = String(body?.query ?? '').trim()
  if (!query) return jsonError(400, 'query is required')
  if (query.length > 1000) return jsonError(413, 'query too long (max 1000 chars)')

  const workspaceId = String(body?.workspace_id ?? '').trim()
  if (!workspaceId) return jsonError(400, 'workspace_id is required')

  // Membership check (RLS handles enforcement; this surfaces a clean 403)
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!membership) return jsonError(403, 'Not a member of that workspace')

  const [peopleRes, deptsRes] = await Promise.all([
    supabase
      .from('people')
      .select('name, title, department')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('departments')
      .select('name')
      .eq('workspace_id', workspaceId)
      .order('name'),
  ])
  const people = peopleRes.data ?? []
  const departments = deptsRes.data ?? []

  const today = new Date().toISOString().slice(0, 10)
  const peopleList = people
    .map((p) => `- ${p.name.split(' ')[0]} (${p.name}${p.department ? ', ' + p.department : ''})`)
    .join('\n')
  const deptList = departments.map((d) => d.name).join(', ') || '(none)'

  const systemPrompt = `${SYSTEM_BASE}

Workspace people:
${peopleList}

Workspace departments:
${deptList}

Today's date: ${today}`

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  let response
  try {
    response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1500,
      system: systemPrompt,
      tools: [APPLY_FILTER_TOOL, PROPOSE_COMMAND_TOOL],
      // tool_choice auto so the model picks; we accept whichever it uses.
      messages: [{ role: 'user', content: query }],
    })
  } catch (err) {
    console.warn('[ai-command] anthropic error', err)
    if (err instanceof Anthropic.APIError) {
      return jsonError(err.status ?? 500, `Claude API error: ${err.message}`)
    }
    return jsonError(500, 'Command parsing failed')
  }

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse) {
    return jsonError(500, 'Model did not produce a structured plan')
  }

  let plan
  if (toolUse.name === 'apply_filter') {
    plan = { kind: 'filter', filter: toolUse.input }
  } else if (toolUse.name === 'propose_command') {
    plan = { kind: 'command', ...toolUse.input }
  } else {
    return jsonError(500, `Unexpected tool: ${toolUse.name}`)
  }

  return new Response(JSON.stringify({ plan, usage: response.usage }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

// ============================================================
// Tool schemas
// ============================================================

const APPLY_FILTER_TOOL = {
  name: 'apply_filter',
  description:
    'Apply a read-only filter to the task list. Use when the user is asking to see or find tasks, not change them.',
  input_schema: {
    type: 'object',
    properties: {
      pic_first_name: {
        type: ['string', 'null'],
        description:
          'First name of a specific person. Must match one of the listed people. null if none.',
      },
      department_name: {
        type: ['string', 'null'],
        description: 'Department name, exact match. null if none.',
      },
      status: {
        type: ['string', 'null'],
        enum: ['Open', 'In progress', 'Ongoing', 'Done', null],
        description: 'Status if the query implies one.',
      },
      include_done: {
        type: 'boolean',
        description:
          'true if the user explicitly mentions Done / completed / finished.',
      },
      view_hint: {
        type: 'string',
        enum: ['today', 'list', 'grid', 'pic', 'calendar'],
        description:
          'Best view to show this in. Use "pic" if focused on one person; "grid" otherwise.',
      },
      query_summary: {
        type: 'string',
        description: 'One-line plain-English recap shown back to the user.',
      },
    },
    required: ['view_hint', 'query_summary'],
  },
}

const PROPOSE_COMMAND_TOOL = {
  name: 'propose_command',
  description:
    'Propose a write command — a bulk action over tasks matched by a selector. ' +
    'The server only proposes; the client previews the affected tasks and asks ' +
    'the user to confirm before executing. Use when the user is asking to change, ' +
    'update, reschedule, reassign, or delete tasks.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          'One-sentence plain-English description of the change. Example: ' +
          '"Mark all of Errol\'s 5 overdue tasks as Done."',
      },
      confirmation_text: {
        type: 'string',
        description:
          'Short sentence shown above the confirm button. Example: ' +
          '"This will change the status of 5 tasks. Continue?"',
      },
      matcher: {
        type: 'object',
        description:
          'Selector spec the client resolves against the live task list. ' +
          'Only set fields the query implies; combine fields with AND semantics.',
        properties: {
          pic_first_names: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Tasks whose PIC matches any of these first names (case-insensitive).',
          },
          department_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tasks in any of these departments.',
          },
          status_in: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['Open', 'In progress', 'Ongoing', 'Done'],
            },
            description: 'Tasks in any of these statuses.',
          },
          priority_in: {
            type: 'array',
            items: { type: 'string', enum: ['High', 'Medium', 'Low'] },
            description: 'Tasks at any of these priorities.',
          },
          overdue_only: {
            type: 'boolean',
            description: 'True to restrict to tasks past their due_date.',
          },
          due_within_days: {
            type: ['integer', 'null'],
            description:
              'Tasks due within N days from today (0 = today). null to skip.',
          },
          due_before: {
            type: ['string', 'null'],
            description: 'ISO YYYY-MM-DD. Tasks with due_date <= this.',
          },
          due_after: {
            type: ['string', 'null'],
            description: 'ISO YYYY-MM-DD. Tasks with due_date >= this.',
          },
          title_contains: {
            type: ['string', 'null'],
            description: 'Substring match on task title, case-insensitive.',
          },
          tag: {
            type: ['string', 'null'],
            description: 'Tasks whose tags array contains this tag.',
          },
          include_done: {
            type: 'boolean',
            description:
              'Default false. Set true only if user explicitly mentions Done.',
          },
        },
      },
      actions: {
        type: 'array',
        description:
          'List of changes to apply to each matched task. Each action mutates one field.',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: [
                'set_status',
                'set_priority',
                'set_pic',
                'set_department',
                'set_due',
                'add_watcher',
                'remove_watcher',
                'delete',
              ],
              description: 'Which field/operation.',
            },
            // Value semantics depend on kind. We don't strictly enum them
            // here because of the variety; the client validates per kind.
            value: {
              type: ['string', 'null'],
              description:
                'Target value. For set_status / set_priority: enum string. ' +
                'For set_pic / set_department / add_watcher / remove_watcher: first-name / name (or null/empty for set_pic/set_department to unassign). ' +
                'For set_due: ISO YYYY-MM-DD or null to clear. ' +
                'For delete: null (presence of the action is enough).',
            },
          },
          required: ['kind'],
        },
        minItems: 1,
      },
    },
    required: ['summary', 'confirmation_text', 'matcher', 'actions'],
  },
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
