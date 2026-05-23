import { useMemo, useState } from 'react'
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
        pickPlaceholder="+ Add a blocker…"
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
        pickPlaceholder="+ Add a blocked task…"
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
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return
            onPick(e.target.value)
            e.target.value = ''
          }}
          disabled={disabled}
          className="text-[11px] bg-transparent border border-border rounded px-1.5 py-0.5 cursor-pointer disabled:opacity-50 max-w-[260px]"
        >
          <option value="">{pickPlaceholder}</option>
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title.length > 60 ? t.title.slice(0, 57) + '…' : t.title}
            </option>
          ))}
        </select>
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
