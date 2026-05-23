// Pure filter helper used by Grid / PIC / Calendar views. Accepts
// a "filters" object read from URL search params and returns the
// filtered task list.
//
// All filter fields are optional. Empty / 'all' / null means "no
// filter on this field". OR semantics within a field (e.g. status
// 'all' means all statuses), AND semantics across fields.

export function applyTaskFilters(tasks, filters) {
  if (!filters) return tasks
  const { picId, deptId, status, priority, tag } = filters
  return tasks.filter((t) => {
    if (picId && picId !== 'all' && t.pic_id !== picId) return false
    if (deptId && deptId !== 'all' && t.department_id !== deptId) return false
    if (status && status !== 'all' && t.status !== status) return false
    if (priority && priority !== 'all' && t.priority !== priority) return false
    if (tag && tag !== 'all') {
      const tags = t.tags ?? []
      if (!tags.includes(tag)) return false
    }
    return true
  })
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
    (filters.tag && filters.tag !== 'all')
  )
}
