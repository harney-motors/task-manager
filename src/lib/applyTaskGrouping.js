// Generic group + sort over a task list.
//
// Inputs:
//   tasks          — task array (already filtered)
//   options.group  — 'none' | 'status' | 'pic' | 'dept' | 'priority' | 'due' | 'tag'
//   options.sort   — 'due' | 'priority' | 'status' | 'pic' | 'title' | 'created' | 'updated'
//   options.people — for name lookups when grouping/sorting by PIC
//   options.departments — for name lookups when grouping by department
//
// Output: `[{ key, label, tasks }]`
//   - One entry when group === 'none' with { key: '__all', label: null, tasks }
//   - Otherwise one entry per group, ordered by a sensible per-group sequence
//
// The tasks inside each group are always sorted by `sort`.

const STATUS_ORDER = ['Open', 'In progress', 'Ongoing', 'Done']
const PRIORITY_ORDER = ['High', 'Medium', 'Low']
const DUE_BUCKET_ORDER = ['overdue', 'today', 'next7', 'later', 'none']

export function applyTaskGrouping(tasks, options = {}) {
  const {
    group = 'none',
    sort = 'due',
    people = [],
    departments = [],
  } = options

  const sorted = [...(tasks ?? [])].sort(makeComparator(sort, { people }))

  if (group === 'none' || !group) {
    return [{ key: '__all', label: null, tasks: sorted }]
  }

  const buckets = new Map()
  for (const t of sorted) {
    const { key, label, rank } = bucketFor(t, group, { people, departments })
    if (!buckets.has(key)) buckets.set(key, { key, label, rank, tasks: [] })
    buckets.get(key).tasks.push(t)
  }
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    return (a.label || '').localeCompare(b.label || '')
  })
}

// ============================================================
// Bucketing
// ============================================================

function bucketFor(task, group, { people, departments }) {
  switch (group) {
    case 'status': {
      const v = task.status || 'Open'
      return {
        key: `status:${v}`,
        label: v,
        rank: STATUS_ORDER.indexOf(v) >= 0 ? STATUS_ORDER.indexOf(v) : 99,
      }
    }
    case 'priority': {
      const v = task.priority || 'Medium'
      return {
        key: `prio:${v}`,
        label: v,
        rank: PRIORITY_ORDER.indexOf(v) >= 0 ? PRIORITY_ORDER.indexOf(v) : 99,
      }
    }
    case 'pic': {
      const pic = people.find((p) => p.id === task.pic_id)
      if (!pic) {
        return { key: 'pic:__unassigned', label: 'Unassigned', rank: 99 }
      }
      // Rank by name so alphabetic order falls out naturally.
      return {
        key: `pic:${pic.id}`,
        label: pic.name,
        rank: 0, // identical rank → label sort kicks in
      }
    }
    case 'dept': {
      const dept = departments.find((d) => d.id === task.department_id)
      if (!dept) {
        return { key: 'dept:__none', label: 'No department', rank: 99 }
      }
      return { key: `dept:${dept.id}`, label: dept.name, rank: 0 }
    }
    case 'tag': {
      const t = (task.tags ?? [])[0]
      if (!t) return { key: 'tag:__none', label: 'No tag', rank: 99 }
      return { key: `tag:${t}`, label: t, rank: 0 }
    }
    case 'due': {
      const bucket = dueBucket(task)
      const label = {
        overdue: 'Overdue',
        today: 'Today',
        next7: 'Next 7 days',
        later: 'Later',
        none: 'No due date',
      }[bucket]
      return {
        key: `due:${bucket}`,
        label,
        rank: DUE_BUCKET_ORDER.indexOf(bucket),
      }
    }
    default:
      return { key: '__all', label: null, rank: 0 }
  }
}

function dueBucket(task) {
  if (!task.due_date) return 'none'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(task.due_date + 'T00:00:00')
  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24))
  if (diffDays < 0 && task.status !== 'Done') return 'overdue'
  if (diffDays === 0) return 'today'
  if (diffDays > 0 && diffDays <= 7) return 'next7'
  return 'later'
}

// ============================================================
// Sorting
// ============================================================

function makeComparator(sort, { people }) {
  switch (sort) {
    case 'priority':
      return (a, b) => priorityRank(a) - priorityRank(b) || dueAsc(a, b)
    case 'status':
      return (a, b) => statusRank(a) - statusRank(b) || dueAsc(a, b)
    case 'pic':
      return (a, b) => picName(a, people).localeCompare(picName(b, people))
    case 'title':
      return (a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, {
          sensitivity: 'base',
        })
    case 'created':
      return (a, b) =>
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
    case 'updated':
      return (a, b) =>
        new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
    case 'start':
      return (a, b) => startAsc(a, b) || dueAsc(a, b)
    case 'due':
    default:
      return (a, b) => dueAsc(a, b) || priorityRank(a) - priorityRank(b)
  }
}

function startAsc(a, b) {
  if (!a.start_date && !b.start_date) return 0
  if (!a.start_date) return 1
  if (!b.start_date) return -1
  return a.start_date.localeCompare(b.start_date)
}

function priorityRank(t) {
  return { High: 0, Medium: 1, Low: 2 }[t.priority] ?? 99
}
function statusRank(t) {
  return STATUS_ORDER.indexOf(t.status) >= 0
    ? STATUS_ORDER.indexOf(t.status)
    : 99
}
function picName(t, people) {
  const p = people.find((x) => x.id === t.pic_id)
  return (p?.name ?? '').toLowerCase() || '￿' // unassigned sorts last
}
function dueAsc(a, b) {
  if (!a.due_date && !b.due_date) return 0
  if (!a.due_date) return 1
  if (!b.due_date) return -1
  return a.due_date.localeCompare(b.due_date)
}
