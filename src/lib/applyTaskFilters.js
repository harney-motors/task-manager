// Pure filter helper used by Grid / PIC / Calendar views. Accepts
// a "filters" object read from URL search params and returns the
// filtered task list.
//
// All filter fields are optional. Empty / 'all' / null means "no
// filter on this field". OR semantics within a field (e.g. status
// 'all' means all statuses), AND semantics across fields.

// Due-filter values: 'all' | 'overdue' | 'today' | 'next7' | 'next30' | 'none'
// 'overdue' = strictly before today AND status != Done
// 'none' = no due_date set
// 'today' = due_date === today (regardless of status)
// 'next7' = due in [today, today+7]
// 'next30' = due in [today, today+30]
export function applyTaskFilters(tasks, filters) {
  if (!filters) return tasks
  const { picId, deptId, status, priority, tag, due } = filters

  // Precompute today/limits once per call so we don't allocate dates
  // for every task.
  let todayIso = null
  let limit7Iso = null
  let limit30Iso = null
  if (due && due !== 'all') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    todayIso = formatIso(today)
    const plus7 = new Date(today)
    plus7.setDate(plus7.getDate() + 7)
    limit7Iso = formatIso(plus7)
    const plus30 = new Date(today)
    plus30.setDate(plus30.getDate() + 30)
    limit30Iso = formatIso(plus30)
  }

  return tasks.filter((t) => {
    if (picId && picId !== 'all' && t.pic_id !== picId) return false
    if (deptId && deptId !== 'all' && t.department_id !== deptId) return false
    if (status && status !== 'all' && t.status !== status) return false
    if (priority && priority !== 'all' && t.priority !== priority) return false
    if (tag && tag !== 'all') {
      const tags = t.tags ?? []
      if (!tags.includes(tag)) return false
    }
    if (due && due !== 'all') {
      const d = t.due_date // 'YYYY-MM-DD' string or null
      switch (due) {
        case 'overdue':
          if (!d || d >= todayIso || t.status === 'Done') return false
          break
        case 'today':
          if (d !== todayIso) return false
          break
        case 'next7':
          if (!d || d < todayIso || d > limit7Iso) return false
          break
        case 'next30':
          if (!d || d < todayIso || d > limit30Iso) return false
          break
        case 'none':
          if (d) return false
          break
        default:
          break
      }
    }
    return true
  })
}

function formatIso(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Read the standardised filter shape from a URLSearchParams instance.
// `picFilter` is the param name (not just `pic`) so it doesn't clash
// with the PIC view's selected-pic param.
export function readFiltersFromParams(searchParams) {
  return {
    picId: searchParams.get('picFilter') || 'all',
    deptId: searchParams.get('dept') || 'all',
    status: searchParams.get('status') || 'all',
    priority: searchParams.get('priority') || 'all',
    tag: searchParams.get('tag') || 'all',
    due: searchParams.get('due') || 'all',
  }
}

// Group + sort are URL-backed too. Defaults come from the view
// because each view has different ideas of "useful" (PIC + Grid
// default to status grouping; Calendar suppresses both).
export function readGroupingFromParams(
  searchParams,
  { defaultGroup = 'none', defaultSort = 'due' } = {},
) {
  return {
    group: searchParams.get('group') || defaultGroup,
    sort: searchParams.get('sort') || defaultSort,
  }
}

// Apply a partial update to the URL params (preserves other keys).
// Pass null / 'all' to clear a single filter.
export function writeFiltersToParams(setSearchParams, patch) {
  setSearchParams(
    (prev) => {
      const map = {
        picId: 'picFilter',
        deptId: 'dept',
        status: 'status',
        priority: 'priority',
        tag: 'tag',
        due: 'due',
        group: 'group',
        sort: 'sort',
      }
      for (const [k, urlKey] of Object.entries(map)) {
        if (k in patch) {
          const value = patch[k]
          if (!value || value === 'all') prev.delete(urlKey)
          else prev.set(urlKey, value)
        }
      }
      return prev
    },
    { replace: false },
  )
}

// True if any filter is set to something other than the default.
export function isAnyFilterActive(filters) {
  return (
    (filters.picId && filters.picId !== 'all') ||
    (filters.deptId && filters.deptId !== 'all') ||
    (filters.status && filters.status !== 'all') ||
    (filters.priority && filters.priority !== 'all') ||
    (filters.tag && filters.tag !== 'all') ||
    (filters.due && filters.due !== 'all')
  )
}
