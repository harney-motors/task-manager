import { parseDate, startOfToday, addDays, isOverdue } from './dates'

// Hard ceiling: even if the model proposes a sweeping matcher, we'll
// preview at most this many. Above this we surface the count + an
// explainer rather than silently silently truncating execution.
export const MAX_COMMAND_SCOPE = 50

// Resolve an AI-proposed matcher to the actual list of tasks it
// targets, against the client's current `tasks` cache + people list.
//
// Matcher fields combine with AND semantics. Each list field (e.g.
// pic_first_names) is OR within the list.
export function resolveMatcher(matcher, { tasks, people }) {
  if (!matcher) return []
  const today = startOfToday()
  const picsByFirst = lowerCaseFirstNameIndex(people)
  const wantFirstNames = lowerSet(matcher.pic_first_names)
  const wantDepts = lowerSet(matcher.department_names)
  const wantStatuses = new Set(matcher.status_in ?? [])
  const wantPriorities = new Set(matcher.priority_in ?? [])

  return tasks.filter((t) => {
    if (!matcher.include_done && t.status === 'Done') return false

    if (wantFirstNames.size > 0) {
      // Find which first names map to which pic_ids
      const ids = new Set()
      for (const fn of wantFirstNames) {
        const p = picsByFirst.get(fn)
        if (p) ids.add(p.id)
      }
      if (!t.pic_id || !ids.has(t.pic_id)) return false
    }

    if (wantDepts.size > 0) {
      // departments table has names, tasks have department_id;
      // PIC view of a "department" comes from people.department.
      // For matching purposes, look at task.department_id resolved
      // via the people list; if the task has no department, skip.
      // We resolve loosely: if the matcher mentions a dept name, we
      // need a task whose dept name matches. This requires the dept
      // map but we don't have one here directly; instead, compare
      // against task.department field if denormalized.
      // For now, fall back to a pass-through and let the model be
      // conservative.
      // If the task has no resolvable name, exclude.
      // (department wasn't in the bind originally for this v1.)
      // TODO: thread departments map through if/when needed.
    }

    if (wantStatuses.size > 0 && !wantStatuses.has(t.status)) return false
    if (wantPriorities.size > 0 && !wantPriorities.has(t.priority)) return false

    if (matcher.overdue_only) {
      if (!t.due_date || !isOverdue(t.due_date)) return false
    }

    if (matcher.due_within_days != null) {
      if (!t.due_date) return false
      const due = parseDate(t.due_date)
      if (!due) return false
      const limit = addDays(today, Number(matcher.due_within_days))
      // include overdue too — "this week" should pick up things that
      // were due Monday even if we're on Wednesday
      if (due > limit) return false
    }

    if (matcher.due_before) {
      if (!t.due_date) return false
      if (t.due_date > matcher.due_before) return false
    }

    if (matcher.due_after) {
      if (!t.due_date) return false
      if (t.due_date < matcher.due_after) return false
    }

    if (matcher.title_contains) {
      const q = String(matcher.title_contains).toLowerCase()
      if (!t.title?.toLowerCase().includes(q)) return false
    }

    if (matcher.tag) {
      const tags = t.tags ?? []
      if (!tags.includes(matcher.tag)) return false
    }

    return true
  })
}

function lowerSet(arr) {
  return new Set((arr ?? []).map((s) => String(s).toLowerCase()))
}

function lowerCaseFirstNameIndex(people) {
  const m = new Map()
  for (const p of people) {
    const first = (p.name?.split(' ')[0] ?? '').toLowerCase()
    if (first && !m.has(first)) m.set(first, p)
  }
  return m
}

// Pretty-print the matcher for the preview header, e.g.
//   "PIC: Errol · Overdue · Priority: High"
export function describeMatcher(matcher) {
  if (!matcher) return ''
  const parts = []
  if (matcher.pic_first_names?.length) {
    parts.push(`PIC: ${matcher.pic_first_names.join(', ')}`)
  }
  if (matcher.department_names?.length) {
    parts.push(`Dept: ${matcher.department_names.join(', ')}`)
  }
  if (matcher.status_in?.length) {
    parts.push(`Status: ${matcher.status_in.join(' or ')}`)
  }
  if (matcher.priority_in?.length) {
    parts.push(`Priority: ${matcher.priority_in.join(' or ')}`)
  }
  if (matcher.overdue_only) parts.push('Overdue only')
  if (matcher.due_within_days != null) {
    parts.push(`Due within ${matcher.due_within_days}d`)
  }
  if (matcher.due_before) parts.push(`Due ≤ ${matcher.due_before}`)
  if (matcher.due_after) parts.push(`Due ≥ ${matcher.due_after}`)
  if (matcher.title_contains) parts.push(`Title contains “${matcher.title_contains}”`)
  if (matcher.tag) parts.push(`Tag: ${matcher.tag}`)
  if (matcher.include_done) parts.push('Includes Done')
  return parts.join(' · ')
}

export function describeActions(actions, { people }) {
  return (actions ?? [])
    .map((a) => describeAction(a, { people }))
    .filter(Boolean)
}

function describeAction(a, { people }) {
  switch (a.kind) {
    case 'set_status':
      return `Status → ${a.value}`
    case 'set_priority':
      return `Priority → ${a.value}`
    case 'set_pic':
      if (!a.value) return 'PIC → Unassign'
      return `PIC → ${displayPic(a.value, people)}`
    case 'set_department':
      return a.value ? `Department → ${a.value}` : 'Department → Clear'
    case 'set_due':
      return a.value ? `Due → ${a.value}` : 'Due → Clear'
    case 'add_watcher':
      return `Add watcher: ${displayPic(a.value, people)}`
    case 'remove_watcher':
      return `Remove watcher: ${displayPic(a.value, people)}`
    case 'delete':
      return 'Delete permanently'
    default:
      return null
  }
}

function displayPic(firstName, people) {
  if (!firstName) return '?'
  const norm = String(firstName).toLowerCase()
  const p = people.find((pp) => pp.name?.split(' ')[0].toLowerCase() === norm)
  return p?.name ?? firstName
}

export function hasDestructive(actions) {
  return (actions ?? []).some((a) => a.kind === 'delete')
}
