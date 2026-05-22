// Netlify Function — Tier 2 AI: translate a natural-language query
// ("Sasha's overdue parts tasks", "ongoing service stuff", "what's
// Clem on this week") into a structured filter the client can apply.
//
// Auth: same pattern as extract-tasks — Bearer token, Supabase JWT.
// Returns: { filter: { pic_first_name, department_name, status, include_done, view_hint, query_summary } }

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

const SYSTEM_BASE = `You translate natural-language queries into structured filter specs for the Tickd task manager.

You only fill in fields that the query clearly implies — never guess. Default to showing active tasks (status != Done) unless the user explicitly mentions Done / completed / finished work.

Resolve names by first-name match against the workspace people list. If a query references a name that isn't in the list, leave pic_first_name null and mention it in query_summary so the user knows.

view_hint is which view best surfaces the result:
- "pic"      — if the user wants one specific person's full picture
- "grid"     — if filtering by multiple fields, or by status/department
- "today"    — if the user asks about "today" specifically
- "calendar" — if the user asks about a date range or "this week"
- "list"     — fallback for everything else

query_summary is a one-line, plain-English recap of what you applied. Show this back to the user so they know what was understood. Mention anything you couldn't apply (e.g. "Couldn't find anyone named 'Bob' — showed all overdue instead").`

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!ANTHROPIC_API_KEY) {
    return jsonError(500, 'Server missing ANTHROPIC_API_KEY')
  }

  // Auth
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

  // Body
  let body
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Invalid JSON body')
  }
  const query = String(body?.query ?? '').trim()
  if (!query) {
    return jsonError(400, 'query is required')
  }
  if (query.length > 1000) {
    return jsonError(413, 'query too long (max 1000 chars)')
  }

  // Workspace context — caller passes workspace_id (they own the
  // multi-workspace state). We verify membership via RLS by selecting
  // through workspace_members; the row only comes back if the caller
  // is a member, so an empty result means "not allowed".
  const workspaceId = String(body?.workspace_id ?? '').trim()
  if (!workspaceId) {
    return jsonError(400, 'workspace_id is required')
  }
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!membership) {
    return jsonError(403, 'Not a member of that workspace')
  }

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

  // Call Claude
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  let response
  try {
    response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: systemPrompt,
      tools: [
        {
          name: 'apply_filter',
          description:
            'Apply a filter to the task list based on the user query. Only set fields the query clearly implies.',
          input_schema: {
            type: 'object',
            properties: {
              pic_first_name: {
                type: ['string', 'null'],
                description:
                  'First name of a specific person. Must match one of the listed people. null if no person is mentioned.',
              },
              department_name: {
                type: ['string', 'null'],
                description:
                  'Department name, exact match. null if no department mentioned.',
              },
              status: {
                type: ['string', 'null'],
                enum: ['Open', 'In progress', 'Ongoing', 'Done', null],
                description:
                  'Exact status if the user implies one. null if any status is fine.',
              },
              include_done: {
                type: 'boolean',
                description:
                  'true if the user explicitly mentions Done / completed / finished. Default false.',
              },
              view_hint: {
                type: 'string',
                enum: ['today', 'list', 'grid', 'pic', 'calendar'],
                description:
                  'Best view to show this in. Use "pic" if focused on one person; "grid" otherwise.',
              },
              query_summary: {
                type: 'string',
                description:
                  'One-line plain-English recap of what was applied — shown back to the user.',
              },
            },
            required: ['view_hint', 'query_summary'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'apply_filter' },
      messages: [{ role: 'user', content: query }],
    })
  } catch (err) {
    console.warn('[nl-filter] anthropic error', err)
    if (err instanceof Anthropic.APIError) {
      return jsonError(err.status ?? 500, `Claude API error: ${err.message}`)
    }
    return jsonError(500, 'Filter generation failed')
  }

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse) {
    return jsonError(500, 'Model did not return a structured filter')
  }

  return new Response(JSON.stringify({ filter: toolUse.input, usage: response.usage }), {
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
