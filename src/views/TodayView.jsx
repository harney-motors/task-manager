import { useMemo } from 'react'
import { useTasks } from '../lib/queries'
import { isOverdue, isToday, parseDate, startOfToday } from '../lib/dates'
import TaskRow from '../components/TaskRow'

// Stripped-down landing for "first thing in the morning". One column,
// sectioned by urgency. Click into the modal for full edit.
export default function TodayView({ onOpenTask }) {
  const { data: tasks = [], isLoading } = useTasks()
  const today = startOfToday()

  const { overdue, dueToday, unscheduled } = useMemo(() => {
    const active = tasks.filter((t) => t.status !== 'Done')
    return {
      overdue: active
        .filter((t) => t.due_date && isOverdue(t.due_date))
        .sort((a, b) => parseDate(a.due_date) - parseDate(b.due_date)),
      dueToday: active
        .filter((t) => isToday(t.due_date))
        .sort((a, b) => a.title.localeCompare(b.title)),
      unscheduled: active.filter((t) => !t.due_date),
    }
  }, [tasks, today])

  const total = overdue.length + dueToday.length + unscheduled.length

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {isLoading ? (
        <div className="py-14 text-center text-xs text-text-3">Loading…</div>
      ) : total === 0 ? (
        <div className="py-14 text-center">
          <div className="text-3xl mb-2">☕</div>
          <div className="text-sm text-text-2">
            Nothing for today. Enjoy the morning.
          </div>
        </div>
      ) : (
        <div className="px-4">
          <Section title="Overdue" count={overdue.length} tone="danger" tasks={overdue} onOpenTask={onOpenTask} />
          <Section title="Today" count={dueToday.length} tasks={dueToday} onOpenTask={onOpenTask} />
          <Section title="Unscheduled" count={unscheduled.length} tasks={unscheduled} onOpenTask={onOpenTask} />
        </div>
      )}
    </div>
  )
}

function Section({ title, count, tone, tasks, onOpenTask }) {
  if (tasks.length === 0) return null
  return (
    <div className="border-b border-border last:border-b-0 -mx-4 px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={`text-[11px] font-semibold uppercase tracking-wider ${
            tone === 'danger' ? 'text-danger-text' : 'text-text-2'
          }`}
        >
          {title}
        </span>
        <span className="text-[11px] text-text-3">{count}</span>
      </div>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
      ))}
    </div>
  )
}
