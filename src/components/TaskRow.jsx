import { useMyPersonId, useUpdateTask } from '../lib/queries'
import { useAuth } from '../auth/AuthProvider'
import { useToast } from './Toast'
import {
  addDays,
  formatRelative,
  formatShortDate,
  formatTimeAgo,
  isOverdue,
  isRecentlyUpdated,
  startOfToday,
} from '../lib/dates'
import { describeRecurrence, isRecurring } from '../lib/recurrence'
import { statusPill } from '../lib/colors'
import Avatar, { AvatarStack } from './Avatar'
import SubtaskProgress from './SubtaskProgress'

// `inWrapper` — true when this row is rendered inside a SelectableTaskRow
// (or anything that owns its own hover/edge layout). In that case we
// drop the row's negative margin so it doesn't fight the wrapper.
export default function TaskRow({ task, onClick, inWrapper = false }) {
  const { workspace } = useAuth()
  const updateTask = useUpdateTask()
  const showToast = useToast()
  // "You're watching" subtle indicator — only shown when the current
  // user is in the watchers list AND isn't the PIC (so it doesn't
  // double up next to the assignee avatar). Reinforces *why* a task
  // is showing up in the user's scoped views.
  const meId = useMyPersonId()
  const iAmWatcher =
    meId != null &&
    task.pic_id !== meId &&
    (task.watchers ?? []).some((w) => w.id === meId)
  const overdue = isOverdue(task.due_date) && task.status !== 'Done'
  const done = task.status === 'Done'
  const displayStatus = overdue ? 'Overdue' : task.status
  // Phase-27: PICs cannot change task status. The checkbox stays
  // visually present (so the row layout doesn't shift across roles)
  // but becomes non-interactive — hover tooltip explains why.
  const canEditStatus = workspace?.role !== 'pic'
  // Subtle "this changed recently" cue — a small pulsing dot before
  // the status pill. Helps users notice what shifted without making
  // them remember timestamps. Threshold is 4h: catches a typical work
  // morning of activity without lighting up everything from yesterday.
  const recent = isRecentlyUpdated(task.updated_at)

  function toggleDone(e) {
    e.stopPropagation()
    if (!canEditStatus) {
      showToast('PICs can’t change task status', { type: 'error' })
      return
    }
    const previousStatus = task.status
    const nextStatus = done ? 'Open' : 'Done'
    // Recurring + going-to-Done: the mutation hook will reset the
    // task to Open + bump the due date and show its own
    // "Recurring — next due …" toast. Suppress this row's toast +
    // Undo so the user doesn't see two competing toasts AND so we
    // don't show an Undo button that can't actually undo (the due
    // date already moved). Recurring + going-to-Open (manual reopen)
    // is the normal flow — no interception, normal Undo applies.
    const willRecur =
      nextStatus === 'Done' && isRecurring(task.recurrence_config)
    updateTask.mutate(
      { id: task.id, status: nextStatus },
      willRecur
        ? undefined
        : {
            onSuccess: () => {
              // Misclick guard — completion checkbox is sometimes hit
              // when aiming for the row. One-tap undo restores the
              // prior status.
              showToast(
                nextStatus === 'Done' ? 'Marked done' : 'Reopened',
                {
                  action: {
                    label: 'Undo',
                    onClick: () => {
                      updateTask.mutate({ id: task.id, status: previousStatus })
                    },
                  },
                },
              )
            },
          },
    )
  }

  function snoozeBy(days, e) {
    e.stopPropagation()
    const next = addDays(startOfToday(), days)
    updateTask.mutate({ id: task.id, due_date: formatIso(next) })
  }

  function snoozeToCustom(iso, e) {
    e.stopPropagation()
    if (!iso) return
    updateTask.mutate({ id: task.id, due_date: iso })
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
        disabled={!canEditStatus}
        className={`flex-shrink-0 text-text-3 ${
          canEditStatus
            ? 'hover:text-text'
            : 'opacity-50 cursor-not-allowed'
        }`}
        aria-label={
          canEditStatus
            ? done
              ? 'Mark as open'
              : 'Mark as done'
            : 'PICs cannot change task status'
        }
        title={
          canEditStatus
            ? done
              ? 'Mark as open'
              : 'Mark as done'
            : 'PICs can’t change task status. Ask an editor or owner.'
        }
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
          {/* "You're watching" tag — surfaces *why* this row is in the
              user's mine/watching-scoped view. Subtle so it doesn't
              compete with the PIC, but text-anchored on desktop so
              the meaning is unambiguous. Hidden when current user is
              the PIC (no need to double-up that signal). */}
          {iAmWatcher && (
            <span
              className="inline-flex items-center gap-0.5 text-info-text bg-info-bg/60 rounded px-1 py-px text-[10px] font-medium leading-none"
              title="You're watching this task"
            >
              <i className="ti ti-eye text-[10px]" />
              <span className="hidden sm:inline">Watching</span>
            </span>
          )}
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
          {isRecurring(task.recurrence_config) && (
            <span
              className="text-text-3 inline-flex items-center"
              title={`Repeats — ${describeRecurrence(task.recurrence_config)}`}
              aria-label="Recurring task"
            >
              <i className="ti ti-history text-[12px]" />
            </span>
          )}
          {(task.watchers?.length ?? 0) > 0 && (
            <span
              className="hidden sm:inline-flex items-center"
              title={
                task.watchers
                  .map((w) => w.name?.split(' ')[0])
                  .filter(Boolean)
                  .join(', ') + ' watching'
              }
            >
              <AvatarStack people={task.watchers} size="xs" max={3} />
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
            <span className="hidden sm:inline-flex items-center">
              <SubtaskProgress subtasks={task.subtasks} tone="auto" />
            </span>
          )}
          {/* Compact mobile-only "+N" pill that collapses watcher + note counts. */}
          <CompactExtras task={task} />
        </div>
      </div>

      {/* Inline hover actions: snooze +1d, +7d, custom date. Visible on
          hover/focus on tablet+ to avoid clutter on small screens. Each
          stops propagation so it doesn't open the modal. The custom-date
          control is a hidden <input type="date"> stretched over a calendar
          icon — clicking the icon opens the browser-native picker, which
          gives us a touch-friendly UI on iOS/Android for free. */}
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
        <CustomDateSnooze
          currentIso={task.due_date}
          onPick={(iso, e) => snoozeToCustom(iso, e)}
        />
      </div>

      {recent && (
        <span
          className="flex-shrink-0 inline-flex items-center"
          title={`Updated ${formatTimeAgo(task.updated_at)}`}
          aria-label="Recently updated"
        >
          <span className="relative inline-flex">
            {/* `motion-safe:` so users with prefers-reduced-motion get a
                solid dot, not a pulsing one. Accessibility win — the
                animation can be distracting for some users. */}
            <span className="absolute inset-0 rounded-full bg-info opacity-60 motion-safe:animate-ping" />
            <span className="relative w-1.5 h-1.5 rounded-full bg-info" />
          </span>
        </span>
      )}
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

// Calendar icon button that stretches a transparent <input type="date">
// over the icon so clicking it opens the browser-native date picker
// (great UX on touch + a real calendar grid on desktop). Once a date
// is picked, onPick fires with the ISO string. The native picker can't
// be triggered programmatically with showPicker() across all browsers,
// so the overlay-input trick is the most reliable cross-browser path.
function CustomDateSnooze({ currentIso, onPick }) {
  return (
    <span
      className="relative inline-flex"
      onClick={(e) => e.stopPropagation()}
      title="Snooze to a specific date"
    >
      <button
        type="button"
        aria-label="Snooze to a specific date"
        className="text-text-3 hover:text-text p-1 rounded hover:bg-surface-3 pointer-events-none"
      >
        <i className="ti ti-calendar-event text-sm" />
      </button>
      <input
        type="date"
        value={currentIso ?? ''}
        onChange={(e) => onPick(e.target.value, e)}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="Pick snooze date"
      />
    </span>
  )
}

function formatIso(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
