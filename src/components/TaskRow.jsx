import { useUpdateTask } from '../lib/queries'
import {
  addDays,
  formatRelative,
  formatShortDate,
  isOverdue,
  startOfToday,
} from '../lib/dates'
import { statusPill } from '../lib/colors'
import Avatar from './Avatar'

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

  function snoozeBy(days, e) {
    e.stopPropagation()
    const next = addDays(startOfToday(), days)
    updateTask.mutate({ id: task.id, due_date: formatIso(next) })
  }

  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-2.5 sm:gap-3 py-2 sm:py-3 border-b border-border last:border-b-0 cursor-pointer transition-colors ${
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
        <i
          className={`ti ${done ? 'ti-circle-check-filled text-success' : 'ti-circle'} text-base sm:text-lg`}
        />
      </button>

      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-medium line-clamp-2 ${done ? 'line-through text-text-3' : ''}`}
        >
          {task.title}
        </div>
        <div className="text-[11px] sm:text-xs text-text-2 flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-0.5 flex-wrap">
          {/* PIC avatar — initials in a coloured circle, first name
              beside (the modern ClickUp/Linear/Monday pattern). */}
          {task.pic ? (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <Avatar person={task.pic} size="sm" />
              <span className="text-[11px] sm:text-xs truncate max-w-[140px]">
                <span className="sm:hidden">{task.pic.name.split(' ')[0]}</span>
                <span className="hidden sm:inline">{task.pic.name}</span>
              </span>
            </span>
          ) : (
            <Avatar person={null} size="sm" showName />
          )}
          {task.due_date && (
            <span className={overdue ? 'text-danger-text font-medium' : 'text-text-3 sm:text-text-2'}>
              {/* Long form on tablet+ ("3 days ago"), compact form on phone
                  ("Mon 12") — keeps mobile rows scannable without the noise
                  of "112 days ago"-style strings. */}
              <span className="hidden sm:inline">
                {formatRelative(task.due_date)}
              </span>
              <span className="sm:hidden">
                {formatShortDate(task.due_date)}
              </span>
            </span>
          )}
          {(task.watchers?.length ?? 0) > 0 && (
            <span
              className="text-text-3 text-[10px] hidden sm:inline-flex items-center gap-0.5"
              title={
                task.watchers
                  .map((w) => w.name?.split(' ')[0])
                  .filter(Boolean)
                  .join(', ')
              }
            >
              +{task.watchers.length} watching
            </span>
          )}
          {(task.note_count ?? 0) > 0 && (
            <span
              className="text-text-3 text-[10px] hidden sm:inline-flex items-center gap-0.5"
              title={`${task.note_count} journal ${task.note_count === 1 ? 'note' : 'notes'}`}
            >
              <i className="ti ti-notebook text-[11px]" />
              {task.note_count}
            </span>
          )}
          {(task.subtasks?.length ?? 0) > 0 && (
            <span
              className="text-text-3 text-[10px] hidden sm:inline-flex items-center gap-0.5"
              title={`${task.subtasks.filter((s) => s.done).length} of ${task.subtasks.length} subtasks done`}
            >
              <i className="ti ti-list-check text-[11px]" />
              {task.subtasks.filter((s) => s.done).length}/
              {task.subtasks.length}
            </span>
          )}
          {/* Compact mobile-only "+N" pill that collapses watcher + note counts. */}
          <CompactExtras task={task} />
        </div>
      </div>

      {/* Inline hover actions: snooze +1d, +7d. Visible on hover/focus
          on tablet+ to avoid clutter on small screens. Each stops
          propagation so it doesn't open the modal. */}
      <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0">
        <HoverAction
          icon="ti-clock-plus"
          title="Snooze 1 day"
          onClick={(e) => snoozeBy(1, e)}
        />
        <HoverAction
          icon="ti-calendar-plus"
          title="Snooze 7 days"
          onClick={(e) => snoozeBy(7, e)}
        />
      </div>

      <span
        className={`text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusPill(displayStatus)}`}
      >
        {displayStatus}
      </span>
    </div>
  )
}

// Mobile-only count summary. Hides watcher and note counts behind one
// compact "+N" pill so narrow phones don't wrap the row's metadata.
function CompactExtras({ task }) {
  const watcher = task.watchers?.length ?? 0
  const notes = task.note_count ?? 0
  const total = watcher + notes
  if (total === 0) return null
  const titleParts = []
  if (watcher > 0) titleParts.push(`${watcher} watching`)
  if (notes > 0) titleParts.push(`${notes} note${notes === 1 ? '' : 's'}`)
  return (
    <span
      className="sm:hidden text-[10px] text-text-3 px-1 py-px rounded-full bg-surface-2"
      title={titleParts.join(' · ')}
    >
      +{total}
    </span>
  )
}

function HoverAction({ icon, title, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="text-text-3 hover:text-text p-1 rounded hover:bg-surface-3"
    >
      <i className={`ti ${icon} text-sm`} />
    </button>
  )
}

function formatIso(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
