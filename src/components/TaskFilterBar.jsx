import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDepartments, usePeople, useTasks } from '../lib/queries'
import {
  isAnyFilterActive,
  readFiltersFromParams,
  writeFiltersToParams,
} from '../lib/applyTaskFilters'

// Shared filter bar for Grid / PIC / Calendar.
//
// `hide` — array of field names to omit (e.g. ['picId'] in PicView,
// where the PIC is already implied by the chip selector).
//
// State lives in URL search params so filters are bookmarkable +
// survive view switches. Tag options are derived from the live task
// set so we don't show stale tags.
export default function TaskFilterBar({ hide = [] }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: people = [] } = usePeople()
  const { data: departments = [] } = useDepartments()
  const { data: tasks = [] } = useTasks()

  const filters = readFiltersFromParams(searchParams)
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
  const anyActive = isAnyFilterActive(filters)

  return (
    <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
      {showPic && (
        <FilterSelect
          value={filters.picId}
          onChange={(v) => update({ picId: v })}
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
        >
          <option value="all">All departments</option>
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
        >
          <option value="all">All priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </FilterSelect>
      )}
      {showTag && tagOptions.length > 0 && (
        <FilterSelect
          value={filters.tag}
          onChange={(v) => update({ tag: v })}
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
          className="text-xs text-text-3 hover:text-text px-2 py-1 underline"
        >
          Clear
        </button>
      )}
    </div>
  )
}

function FilterSelect({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs border border-border rounded px-2 py-1 bg-surface hover:bg-surface-2 cursor-pointer"
    >
      {children}
    </select>
  )
}
