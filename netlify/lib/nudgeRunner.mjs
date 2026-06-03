// Shared logic for the three scheduled nudge functions.
//
// Per slot (morning / afternoon / eod):
//   1. Iterate workspaces.
//   2. For each member of each workspace, compute their actionable
//      bucket (overdue / due-today / in-progress they own or watch).
//   3. If empty → skip (the "quiet day" rule — weekends/holidays
//      without active items get no notifications).
//   4. Call Claude with the bucket + slot context; receive ranked
//      nudges via structured tool use.
//   5. Insert into ai_nudges (uses service role; bypasses RLS).
//   6. Send a digest push to users who opted into daily_digest,
//      plus an urgent push for any urgent nudge.
//
// Runs use the service role key end-to-end. We DO NOT thread any
// end-user JWT through here.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const PUSH_SERVICE_KEY = process.env.PUSH_SERVICE_KEY
const SITE_URL = process.env.URL || ''

// How long a dismissed nudge stays suppressed before the runner is
// allowed to re-emit one with the same fingerprint. Tuned so users
// don't see "X is overdue" three times the same day after dismissing
// it, but still get a re-up next week if the issue persists.
const SUPPRESSION_DAYS = 7

// Build the suppression key for a nudge candidate.
//   `${kind}:${primary_task_id}`
// Pure FYI / summary nudges (no task subject) get `${kind}:` and are
// intentionally NEVER suppressed — they're general background colour,
// not actionable repeat offenders.
function fingerprintFor(kind, taskIds) {
  return `${kind || 'fyi'}:${taskIds?.[0] ?? ''}`
}
function isSuppressable(fp) {
  // Anything that ends with a real task_id is suppressable.
  return !fp.endsWith(':')
}

const SYSTEM_PROMPT = `You are the daily reflection bot for Tickd, an executive task manager.

You are given one user's actionable workspace state at a specific time of day. Return a short ranked list of nudges that an attentive chief-of-staff would surface — observations that help the user focus, unblock, or close out.

Slot semantics:
- "morning"   — set the day. Highlight what needs attention first, likely blockers, stale work.
- "afternoon" — check-in. Note what's still open, anything slipping, anyone overloaded.
- "eod"      — close-out. What got done, what's slipping into tomorrow, summary.

Rules:
- Max 4 nudges per call. Fewer if there's nothing genuinely useful — empty is fine.
- Each nudge has a short title (≤60 chars) and an optional one-sentence body (≤140 chars). Be concrete; cite a task title or count.
- Severity:
    - "urgent": needs action TODAY (e.g. high-priority overdue with no progress)
    - "high":   should look at this run
    - "medium": worth knowing
    - "low":    background colour
- kind: short label for the nudge family. Use one of: stale, blocker, overload, drift, win, fyi, summary.
- If the slot is "eod" and at least one task moved to Done today, include a "win" nudge.
- If the slot is "morning" and there are no overdue or due-today tasks, include a single "fyi" titled "Clear runway today" instead of inventing problems.
- task_ids: optional; reference 1-3 task ids the nudge points at so the UI can deep-link.
- digest_summary: one-paragraph friendly recap (≤200 chars). Always populate.`

export async function runNudges({ slot }) {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  if (!ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const todayIso = new Date().toISOString().slice(0, 10)
  const slotKey = `${todayIso}:${slot}`

  // ---------- Load all workspaces ----------
  const { data: workspaces } = await admin.from('workspaces').select('id, name')
  let totalUsers = 0
  let processed = 0
  let skipped = 0
  let inserted = 0
  let suppressed = 0
  let pushed = 0

  for (const ws of workspaces ?? []) {
    const { data: members } = await admin
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', ws.id)

    if (!members?.length) continue

    // Pull all this workspace's people + tasks once; partition per user.
    const { data: people } = await admin
      .from('people')
      .select('id, name, user_id')
      .eq('workspace_id', ws.id)

    const { data: tasks } = await admin
      .from('tasks')
      .select(`
        id, title, status, priority, due_date, raised_date, pic_id, updated_at,
        task_watchers(person:people(id, user_id))
      `)
      .eq('workspace_id', ws.id)

    for (const member of members) {
      totalUsers++
      const me = people?.find((p) => p.user_id === member.user_id)

      const actionable = pickActionable(tasks ?? [], me)
      if (actionable.length === 0) {
        skipped++
        continue
      }

      try {
        const result = await generateForUser(anthropic, {
          slot,
          user: { id: member.user_id, name: me?.name ?? null },
          workspace: ws,
          tasks: actionable,
          today: todayIso,
        })

        // Pull this user's recently-dismissed fingerprints so we can
        // skip re-emitting a nudge they just told us they don't want
        // to see again. Window is SUPPRESSION_DAYS. The partial index
        // on (user_id, fingerprint) where status='dismissed' makes
        // this query cheap even on a long-lived workspace.
        const suppressionCutoff = new Date(
          Date.now() - SUPPRESSION_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString()
        const { data: dismissedRows } = await admin
          .from('ai_nudges')
          .select('fingerprint')
          .eq('user_id', member.user_id)
          .eq('status', 'dismissed')
          .gte('dismissed_at', suppressionCutoff)
          .not('fingerprint', 'is', null)
        const suppressedFingerprints = new Set(
          (dismissedRows ?? []).map((r) => r.fingerprint),
        )

        const candidates = (result.nudges ?? []).map((n) => {
          const fingerprint = fingerprintFor(n.kind, n.task_ids)
          return {
            row: {
              workspace_id: ws.id,
              user_id: member.user_id,
              kind: n.kind || 'fyi',
              severity: n.severity || 'medium',
              title: String(n.title || '').slice(0, 200),
              body: n.body ? String(n.body).slice(0, 400) : null,
              payload: n.task_ids?.length ? { task_ids: n.task_ids } : null,
              slot: slotKey,
              fingerprint,
            },
            fingerprint,
          }
        })

        const rows = candidates
          .filter((c) => {
            if (!isSuppressable(c.fingerprint)) return true
            const blocked = suppressedFingerprints.has(c.fingerprint)
            if (blocked) suppressed++
            return !blocked
          })
          .map((c) => c.row)

        if (rows.length > 0) {
          const { error: insErr } = await admin.from('ai_nudges').insert(rows)
          if (insErr) {
            console.warn('[nudges] insert failed', insErr)
          } else {
            inserted += rows.length
          }
        }

        // Push delivery. Urgent nudges always fire; daily digest is
        // opt-in via push_subscriptions.preferences.daily_digest.
        const urgent = (result.nudges ?? []).find((n) => n.severity === 'urgent')
        if (urgent) {
          await firePush({
            userId: member.user_id,
            trigger: 'watched_changed', // urgent uses an always-on channel
            payload: {
              title: urgent.title,
              body: urgent.body || result.digest_summary || '',
              tag: `nudge:urgent:${slotKey}`,
              urgent: true,
            },
          })
          pushed++
        }
        if (result.digest_summary) {
          await firePush({
            userId: member.user_id,
            trigger: 'daily_digest',
            payload: {
              title:
                slot === 'morning' ? 'Morning brief'
                  : slot === 'afternoon' ? 'Afternoon check-in'
                    : 'End-of-day recap',
              body: result.digest_summary,
              tag: `digest:${slotKey}`,
            },
          })
          pushed++
        }

        processed++
      } catch (err) {
        console.warn('[nudges] generation failed for user', member.user_id, err)
      }
    }
  }

  return { slot, totalUsers, processed, skipped, inserted, suppressed, pushed }
}

// ---------- Helpers ----------

function pickActionable(tasks, me) {
  if (!me) return []
  const todayIso = new Date().toISOString().slice(0, 10)
  return tasks.filter((t) => {
    if (t.status === 'Done') return false
    const isOwner = t.pic_id === me.id
    const isWatcher = (t.task_watchers ?? []).some(
      (tw) => tw.person?.id === me.id,
    )
    if (!isOwner && !isWatcher) return false

    const overdue = t.due_date && t.due_date < todayIso
    const dueToday = t.due_date === todayIso
    const inProg = t.status === 'In progress'
    return overdue || dueToday || inProg
  })
}

async function generateForUser(
  anthropic,
  { slot, user, workspace, tasks, today },
) {
  // Build a compact JSON snapshot the model can reason over.
  const summarised = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
    days_since_update: daysSince(t.updated_at),
    is_overdue: t.due_date ? t.due_date < today : false,
    is_due_today: t.due_date === today,
  }))

  const userBlurb = user.name ? `${user.name}` : '(unnamed user)'

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: 'submit_nudges',
        description:
          'Submit the ranked nudges plus a one-paragraph digest summary.',
        input_schema: {
          type: 'object',
          properties: {
            nudges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  kind: {
                    type: 'string',
                    description:
                      'One of: stale, blocker, overload, drift, win, fyi, summary.',
                  },
                  severity: {
                    type: 'string',
                    enum: ['low', 'medium', 'high', 'urgent'],
                  },
                  title: { type: 'string' },
                  body: { type: 'string' },
                  task_ids: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
                required: ['kind', 'severity', 'title'],
              },
            },
            digest_summary: { type: 'string' },
          },
          required: ['nudges', 'digest_summary'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_nudges' },
    messages: [
      {
        role: 'user',
        content: `Slot: ${slot}
Today's date: ${today}
Workspace: ${workspace.name}
User: ${userBlurb}
Their actionable tasks (overdue, due today, or in progress) — JSON:

${JSON.stringify(summarised, null, 2)}`,
      },
    ],
  })

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  return toolUse?.input ?? { nudges: [], digest_summary: '' }
}

function daysSince(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  const days = (Date.now() - then) / (1000 * 60 * 60 * 24)
  return Math.round(days)
}

async function firePush({ userId, trigger, payload }) {
  if (!PUSH_SERVICE_KEY) return
  const url = SITE_URL
    ? `${SITE_URL}/.netlify/functions/send-push`
    : '/.netlify/functions/send-push'
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-service-key': PUSH_SERVICE_KEY,
      },
      body: JSON.stringify({
        user_ids: [userId],
        trigger,
        payload,
      }),
    })
  } catch (err) {
    console.warn('[nudges] push failed', err)
  }
}
