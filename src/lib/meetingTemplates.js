// Meeting agenda templates — reusable scaffolds for common meeting
// types. The user picks one before pasting / dictating notes, and the
// template's `body` prefills the textarea as a working skeleton.
//
// Built-in templates ship in code (so they're version-controlled and
// available immediately). User templates live in localStorage so they
// can be saved/edited per workspace without a DB migration.
//
// Storage shape per user-saved template:
//   { id: string, name: string, body: string, createdAt: ISO string }
//
// Workspace-isolation: templates are keyed by workspace id so each
// workspace gets its own library. (A given user can be in multiple
// workspaces; sharing templates across all of them would be confusing.)

const STORAGE_PREFIX = 'tickd:agenda-templates:'

// Built-in starter agendas. The body is plain text — the meeting
// extractor parses it the same way it parses any meeting transcript.
export const BUILTIN_TEMPLATES = [
  {
    id: 'builtin:weekly-ops',
    builtin: true,
    name: 'Weekly ops review',
    description:
      'Last week wins, blockers, this week commitments, risks. The Harney WEM-style cadence.',
    icon: 'ti-calendar-week',
    body: `WEM ${todayLabel()}

Last week — wins
-
-

Last week — blockers / misses
-
-

This week — commitments (use first names so PICs auto-resolve)
- Asbert to …
- Clem to …
- Richard to …

Risks / things to watch
-

Ongoing initiatives
-
`,
  },
  {
    id: 'builtin:kickoff',
    builtin: true,
    name: 'Project kickoff',
    description:
      'Goals, scope, stakeholders, timeline, risks. Use when starting something new.',
    icon: 'ti-rocket',
    body: `Project kickoff — ${todayLabel()}

Goals (what success looks like)
-

In scope
-

Out of scope
-

Stakeholders (with first names)
- Owner:
- PIC:
- Watchers:

Timeline / milestones
- Phase 1 by …
- Phase 2 by …

Known risks
-

Immediate next steps (each becomes a task)
-
`,
  },
  {
    id: 'builtin:1on1',
    builtin: true,
    name: '1:1 catch-up',
    description:
      'Wins, challenges, asks, action items. Manager↔report or peer↔peer.',
    icon: 'ti-message-circle',
    body: `1:1 — ${todayLabel()}

Their wins this week
-

Their challenges
-

Their asks
-

My feedback / asks
-

Action items (first names so PICs auto-resolve)
-
`,
  },
  {
    id: 'builtin:daily-standup',
    builtin: true,
    name: 'Daily standup',
    description: 'Yesterday / Today / Blockers per person.',
    icon: 'ti-clipboard-text',
    body: `Standup — ${todayLabel()}

Asbert
- Yesterday:
- Today:
- Blockers:

Clem
- Yesterday:
- Today:
- Blockers:

Richard
- Yesterday:
- Today:
- Blockers:

Cross-team action items
-
`,
  },
  {
    id: 'builtin:retro',
    builtin: true,
    name: 'Retrospective',
    description: 'Start / Stop / Continue + concrete follow-ups.',
    icon: 'ti-refresh-alert',
    body: `Retro — ${todayLabel()}

What we should START doing
-

What we should STOP doing
-

What we should KEEP doing
-

Action items (concrete, with owner first names)
-
`,
  },
]

function todayLabel() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function storageKey(workspaceId) {
  return `${STORAGE_PREFIX}${workspaceId || 'default'}`
}

export function loadUserTemplates(workspaceId) {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function persist(workspaceId, list) {
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(list))
  } catch {
    /* localStorage disabled — silent no-op */
  }
}

export function saveUserTemplate(workspaceId, { name, body }) {
  const list = loadUserTemplates(workspaceId)
  const tmpl = {
    id: `user:${Math.random().toString(36).slice(2, 10)}`,
    builtin: false,
    name: name.trim().slice(0, 60),
    body: body,
    createdAt: new Date().toISOString(),
  }
  const next = [tmpl, ...list]
  persist(workspaceId, next)
  return tmpl
}

export function deleteUserTemplate(workspaceId, id) {
  const list = loadUserTemplates(workspaceId)
  const next = list.filter((t) => t.id !== id)
  persist(workspaceId, next)
  return next
}

// Convenience: union of built-ins and user templates.
export function loadAllTemplates(workspaceId) {
  return [...BUILTIN_TEMPLATES, ...loadUserTemplates(workspaceId)]
}
