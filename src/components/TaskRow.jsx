import { useUpdateTask } from '../lib/queries'
import { isOverdue, formatRelative } from '../lib/dates'
import { picPill, statusPill } from '../lib/colors'

// `inWrapper` — true when this row is rendered inside a SelectableTaskRow
// (or anything that owns its own hover/edge layout). In that case we
// drop the row's negative margin so it doesn't fight the wrapper.
export default function TaskRow({ task, onClick, inWrapper = false }) {
  const updateTask = useUpdateTask()
  const overdue = isOverdue(task.due_date) && task.status !== 'Done'
  const done = task.status === 'Done'
  const displayStatus = overdue ? 'Overdue' : task.status

  function toggleDone(e) {
    e.stopPropagation()
    updateTask.mutate({
      id: task.id,
      status: done ? 'Open' : 'Done',
    })
  }

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 py-3 border-b border-border last:border-b-0 cursor-pointer transition-colors ${
        inWrapper
          ? 'min-w-0' // wrapper owns padding + hover background
          : 'hover:bg-surface-2 -mx-4 px-4'
      }`}
    >
      <button
        onClick={toggleDone}
        className="flex-shrink-0 text-text-3 hover:text-text"
        aria-label={done ? 'Mark as open' : 'Mark as done'}
        title={done ? 'Mark as open' : 'Mark as done'}
      >
        {/* Circle icon, not a square — keeps "mark done" visually
            distinct from the multi-select checkbox in views that
            surface bulk selection. */}
        <i
          className={`ti ${done ? 'ti-circle-check-filled text-success' : 'ti-circle'} text-lg`}
        />
      </button>

      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-medium truncate ${done ? 'line-through text-text-3' : ''}`}
        >
          {task.title}
        </div>
        <div className="text-xs text-text-2 flex items-center gap-2 mt-0.5">
          {task.pic ? (
            <span
              className={`inline-flex items-center px-1.5 py-px rounded text-[11px] font-medium ${picPill(task.pic.color)}`}
            >
              {task.pic.name}
            </span>
          ) : (
            <span className="text-text-3">Unassigned</span>
          )}
          {task.due_date && (
            <span className={overdue ? 'text-danger-text font-medium' : ''}>
              {formatRelative(task.due_date)}
            </span>
          )}
          {(task.watchers?.length ?? 0) > 0 && (
            <span className="text-text-3 text-[10px]">
              +{task.watchers.length} watching
            </span>
          )}
          {(task.note_count ?? 0) > 0 && (
            <span
              className="text-text-3 text-[10px] inline-flex items-center gap-0.5"
              title={`${task.note_count} journal ${task.note_count === 1 ? 'note' : 'notes'}`}
            >
              <i className="ti ti-notebook text-[11px]" />
              {task.note_count}
            </span>
          )}
        </div>
      </div>

      <span
        className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusPill(displayStatus)}`}
      >
        {displayStatus}
      </span>
    </div>
  )
}
