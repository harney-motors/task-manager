import { useEffect } from 'react'
import { statusPill } from '../lib/colors'
import { isOverdue } from '../lib/dates'

// Chunk 2 stub. Chunk 3 fleshes out every field.
export default function TaskModal({ task, onClose }) {
  // Close on Escape
  useEffect(() => {
    function handler(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!task) return null

  const overdue = isOverdue(task.due_date) && task.status !== 'Done'
  const displayStatus = overdue ? 'Overdue' : task.status
  const taskNumber =
    task.task_number != null
      ? `T-${String(task.task_number).padStart(4, '0')}`
      : 'T-…'

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-10 overflow-y-auto"
    >
      <div className="bg-surface rounded-2xl w-full max-w-xl border border-border shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusPill(displayStatus)}`}
            >
              {displayStatus}
            </span>
            <span className="text-xs font-mono text-text-3">{taskNumber}</span>
          </div>
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text p-1 rounded hover:bg-surface-2"
            aria-label="Close"
          >
            <i className="ti ti-x text-base" />
          </button>
        </div>
        <div className="p-5">
          <h2 className="text-lg font-medium leading-snug">{task.title}</h2>
          {task.source && (
            <div className="text-xs text-text-2 mt-1">Captured · {task.source}</div>
          )}
          <p className="text-xs text-text-3 mt-6">
            Full editing — PIC, due date, priority, status, tags, journal — comes in Chunk 3.
          </p>
        </div>
      </div>
    </div>
  )
}
