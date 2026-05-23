import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDepartments, usePeople, useTasks } from '../lib/queries'
import {
  isAnyFilterActive,
  readFiltersFromParams,
  readGroupingFromParams,
  writeFiltersToParams,
} from '../lib/applyTaskFilters'

// Shared filter bar for Grid / PIC / Calendar.
//
// `hide` — array of field names to omit (e.g. ['picId'] in PicView,
// where the PIC is already implied by the chip selector; ['group',
// 'sort'] in Calendar which is date-laid-out).
//
// `defaultGroup` / `defaultSort` — fallbacks when the URL doesn't
// specify; lets each view set a sensible default (PIC + Grid default
// to status grouping).
export default function TaskFilterBar({
  hide = [],
  defaultGroup = 'none',
  defaultSort = 'due',
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: people = [] } = usePeople()
  const { data: departments = [] } = useDepartments()
  const { data: tasks = [] } = useTasks()

  const filters = readFiltersFromParams(searchParams)
  const { group, sort } = readGroupingFromParams(searchParams, {
    defaultGroup,
    defaultSort,
  })
  const tagOptions = useMemo(() => {
    const s = new Set()
    for (const t of tasks) for (const tag of t.tags ?? []) s.add(tag)
    return Array.from(s).sort()
  }, [tasks])

  function update(patch) {
    writeFiltersToParams(setSearchParams, patch)
  }
  function clearAll() {
    update({
      picId: null,
      deptId: null,
      status: null,
      priority: null,
      tag: null,
    })
  }

  const showPic = !hide.includes('picId')
  const showDept = !hide.includes('deptId')
  const showStatus = !hide.includes('status')
  const showPriority = !hide.includes('priority')
  const showTag = !hide.includes('tag')
  const showDue = !hide.includes('due')
  const showGroup = !hide.includes('group')
  const showSort = !hide.includes('sort')
  const anyActive = isAnyFilterActive(filters)

  return (
    // On mobile this becomes a single horizontal-scrolling row of compact
    // chip-style selects — saves ~4 rows of vertical real estate vs the
    // previous wrap-grid. On sm+ it falls back to the original wrap layout
    // so desktop users still get one-glance access to every filter.
    <div className="border-b border-border">
      <div className="flex items-center gap-1.5 p-2 sm:p-3 sm:gap-2 sm:flex-wrap overflow-x-auto sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {showPic && (
          <FilterSelect
            value={filters.picId}
            onChange={(v) => update({ picId: v })}
            active={filters.picId !== 'all'}
          >
            <option value="all">All PICs</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </FilterSelect>
        )}
        {showDept && (
          <FilterSelect
            value={filters.deptId}
            onChange={(v) => update({ deptId: v })}
            active={filters.deptId !== 'all'}
          >
            <option value="all">All depts</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </FilterSelect>
        )}
        {showStatus && (
          <FilterSelect
            value={filters.status}
            onChange={(v) => update({ status: v })}
            active={filters.status !== 'all'}
          >
            <option value="all">All statuses</option>
            <option value="Open">Open</option>
            <option value="In progress">In progress</option>
            <option value="Ongoing">Ongoing</option>
            <option value="Done">Done</option>
          </FilterSelect>
        )}
        {showPriority && (
          <FilterSelect
            value={filters.priority}
            onChange={(v) => update({ priority: v })}
            active={filters.priority !== 'all'}
          >
            <option value="all">Any priority</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </FilterSelect>
        )}
        {showTag && tagOptions.length > 0 && (
          <FilterSelect
            value={filters.tag}
            onChange={(v) => update({ tag: v })}
            active={filters.tag !== 'all'}
          >
            <option value="all">All tags</option>
            {tagOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </FilterSelect>
        )}
        {showDue && (
          <FilterSelect
            value={filters.due}
            onChange={(v) => update({ due: v })}
            active={filters.due !== 'all'}
          >
            <option value="all">Any due date</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="next7">Due next 7 days</option>
            <option value="next30">Due next 30 days</option>
            <option value="none">No due date</option>
          </FilterSelect>
        )}
        {anyActive && (
          <button
            onClick={clearAll}
            className="text-[11px] text-text-3 hover:text-text px-1.5 py-0.5 underline flex-shrink-0"
          >
            Clear
          </button>
        )}

        {/* Push group/sort to the right so they read as "shape of view"
            rather than filters. (Wrap layout only — on the mobile scroll
            row they just continue inline.) */}
        {(showGroup || showSort) && (
          <div className="hidden sm:block sm:flex-1" />
        )}

        {showGroup && (
          <label className="text-[10px] sm:text-[11px] text-text-3 inline-flex items-center gap-1 flex-shrink-0">
            <span className="hidden sm:inline">Group</span>
            <span className="sm:hidden">G</span>
            <FilterSelect
              value={group}
              onChange={(v) => update({ group: v === defaultGroup ? null : v })}
              active={group !== defaultGroup}
            >
              <option value="none">None</option>
              <option value="status">Status</option>
              <option value="pic">PIC</option>
              <option value="dept">Department</option>
              <option value="priority">Priority</option>
              <option value="due">Due bucket</option>
              <option value="tag">Tag</option>
            </FilterSelect>
          </label>
        )}
        {showSort && (
          <label className="text-[10px] sm:text-[11px] text-text-3 inline-flex items-center gap-1 flex-shrink-0">
            <span className="hidden sm:inline">Sort</span>
            <span className="sm:hidden">S</span>
            <FilterSelect
              value={sort}
              onChange={(v) => update({ sort: v === defaultSort ? null : v })}
              active={sort !== defaultSort}
            >
              <option value="due">Due</option>
              <option value="priority">Priority</option>
              <option value="status">Status</option>
              <option value="pic">PIC name</option>
              <option value="title">Title</option>
              <option value="created">Newest</option>
              <option value="updated">Recently updated</option>
            </FilterSelect>
          </label>
        )}
      </div>
    </div>
  )
}

// Compact chip-style select. `active` adds an info-tinted background so
// non-default values pop visually — useful when the row scrolls and the
// user needs to see at a glance which filters are on.
function FilterSelect({ value, onChange, active = false, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`text-[11px] sm:text-xs border rounded px-1.5 py-0.5 sm:px-2 sm:py-1 cursor-pointer flex-shrink-0 max-w-[8.5rem] sm:max-w-none ${
        active
          ? 'border-info bg-info-bg text-info-text font-medium'
          : 'border-border bg-surface hover:bg-surface-2'
      }`}
    >
      {children}
    </select>
  )
}
