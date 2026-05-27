import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useAddDependency,
  useRemoveDependency,
  useTaskDependencies,
  useTasks,
} from '../lib/queries'
import { statusPill } from '../lib/colors'

// "Blocked by" + "Blocks" sections for a task. Edges live in the
// task_dependencies table; this component reads + mutates both
// directions and uses task chips for the related tasks.
//
// onOpenRelated lets a chip click open the related task in place
// of the current one.
//
// The picker is a searchable combobox (was a plain <select>). With
// workspaces of 100+ tasks the dropdown was unusable — you couldn't
// type to find a specific task. The combobox shows up to 8 matching
// task cards (title + status + PIC) as you type.
export default function DependenciesField({ taskId, disabled, onOpenRelated }) {
  const { data: tasks = [] } = useTasks()
  const { data: deps = { blockedBy: [], blocks: [] }, isLoading } =
    useTaskDependencies(taskId)
  const addDep = useAddDependency()
  const removeDep = useRemoveDependency()

  // Tasks eligible to be picked as a relationship endpoint:
  // exclude self, exclude already-related (in either direction).
  const relatedIds = useMemo(() => {
    const s = new Set()
    s.add(taskId)
    for (const d of deps.blockedBy) s.add(d.id)
    for (const d of deps.blocks) s.add(d.id)
    return s
  }, [taskId, deps])

  const candidates = useMemo(
    () =>
      tasks
        .filter((t) => !relatedIds.has(t.id))
        .filter((t) => !String(t.id).startsWith('temp-'))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [tasks, relatedIds],
  )

  if (isLoading) {
    return <div className="text-[11px] text-text-3">Loading…</div>
  }

  return (
    <div className="flex-1 min-w-0 space-y-3">
      <DepGroup
        label="Blocked by"
        items={deps.blockedBy}
        emptyMsg="Not blocked by anything."
        onOpen={onOpenRelated}
        onRemove={(otherId) =>
          removeDep.mutate({ blockerId: otherId, blockedId: taskId })
        }
        onPick={(otherId) =>
          addDep.mutate({ blockerId: otherId, blockedId: taskId })
        }
        candidates={candidates}
        disabled={disabled}
        pickPlaceholder="Search blockers…"
      />
      <DepGroup
        label="Blocks"
        items={deps.blocks}
        emptyMsg="Not blocking anything."
        onOpen={onOpenRelated}
        onRemove={(otherId) =>
          removeDep.mutate({ blockerId: taskId, blockedId: otherId })
        }
        onPick={(otherId) =>
          addDep.mutate({ blockerId: taskId, blockedId: otherId })
        }
        candidates={candidates}
        disabled={disabled}
        pickPlaceholder="Search blocked tasks…"
      />
    </div>
  )
}

function DepGroup({
  label,
  items,
  emptyMsg,
  onOpen,
  onRemove,
  onPick,
  candidates,
  disabled,
  pickPlaceholder,
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-3 font-medium mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        {items.length === 0 ? (
          <span className="text-[11px] text-text-3">{emptyMsg}</span>
        ) : (
          items.map((t) => (
            <DepChip
              key={t.id}
              task={t}
              onOpen={() => onOpen?.(t.id)}
              onRemove={() => onRemove(t.id)}
              disabled={disabled}
            />
          ))
        )}
      </div>
      {candidates.length > 0 && (
        <DepSearchCombobox
          candidates={candidates}
          placeholder={pickPlaceholder}
          disabled={disabled}
          onPick={onPick}
        />
      )}
    </div>
  )
}

// Searchable picker for adding a dependency. Filter is on title +
// PIC name; results show as compact rows so users can spot the right
// task by status / PIC, not just title. Closes on outside click or Esc.
function DepSearchCombobox({ candidates, placeholder, disabled, onPick }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  // Filter is plain substring on title + pic.name. Sorted by status
  // (open before done) then title to keep the most actionable choices
  // at the top.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = candidates
    if (q) {
      list = list.filter((t) => {
        if (t.title.toLowerCase().includes(q)) return true
        const picName = t.pic?.name?.toLowerCase() ?? ''
        if (picName.includes(q)) return true
        return false
      })
    }
    return list
      .slice()
      .sort((a, b) => {
        const aDone = a.status === 'Done' ? 1 : 0
        const bDone = b.status === 'Done' ? 1 : 0
        if (aDone !== bDone) return aDone - bDone
        return a.title.localeCompare(b.title)
      })
      .slice(0, 8)
  }, [candidates, query])

  // Keep the highlight in range when results change.
  useEffect(() => {
    setHighlight(0)
  }, [query])

  // Outside-click close. Only matters when open — we cheap-out on the
  // listener registration so it's not always on.
  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  function commit(task) {
    if (!task) return
    onPick(task.id)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlight]) commit(filtered[highlight])
    }
  }

  return (
    <div ref={rootRef} className="relative max-w-[320px]">
      <div className="flex items-center gap-1.5 border border-border rounded px-2 py-1 bg-surface focus-within:border-info">
        <i className="ti ti-search text-sm text-text-3 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 min-w-0 text-[11px] bg-transparent outline-none disabled:opacity-50 placeholder:text-text-3"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            className="text-text-3 hover:text-text flex-shrink-0"
            aria-label="Clear search"
          >
            <i className="ti ti-x text-[11px]" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-md shadow-lg z-20 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-text-3 text-center">
              {query
                ? 'No matching tasks.'
                : `${candidates.length} task${candidates.length === 1 ? '' : 's'} available — type to search.`}
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {filtered.map((t, i) => (
                <li
                  key={t.id}
                  onMouseDown={(e) => {
                    // mousedown (not click) so we commit before the
                    // outside-click handler closes us.
                    e.preventDefault()
                    commit(t)
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`px-2.5 py-1.5 cursor-pointer flex items-center gap-2 border-b border-border last:border-b-0 ${
                    i === highlight ? 'bg-info-bg/50' : 'hover:bg-surface-2'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] truncate">{t.title}</div>
                    {t.pic?.name && (
                      <div className="text-[10px] text-text-3 truncate">
                        {t.pic.name}
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${statusPill(t.status)}`}
                  >
                    {t.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function DepChip({ task, onOpen, onRemove, disabled }) {
  const done = task.status === 'Done'
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border ${
        done
          ? 'border-success-bg bg-success-bg/30 text-success-text'
          : 'border-border bg-surface-2 text-text-2'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="hover:underline truncate max-w-[160px] text-left"
        title={task.title}
      >
        {task.title}
      </button>
      <span
        className={`text-[10px] px-1 py-px rounded-full font-medium ${statusPill(task.status)}`}
      >
        {task.status}
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="text-text-3 hover:text-danger-text disabled:opacity-50"
        aria-label="Remove dependency"
      >
        <i className="ti ti-x text-[10px]" />
      </button>
    </span>
  )
}
