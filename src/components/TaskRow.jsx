import { useUpdateTask } from '../lib/queries'
import { isOverdue, formatRelative } from '../lib/dates'
import { picPill, statusPill } from '../lib/colors'

export default function TaskRow({ task, onClick }) {
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
      className="flex items-center gap-3 py-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-surface-2 -mx-4 px-4 transition-colors"
    >
      <button
        onClick={toggleDone}
        className="flex-shrink-0 text-text-3 hover:text-text"
        aria-label={done ? 'Mark as open' : 'Mark as done'}
      >
        <i
          className={`ti ${done ? 'ti-square-check-filled text-success' : 'ti-square'} text-lg`}
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
