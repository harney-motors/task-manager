import { useTasks } from '../lib/queries'
import { parseDate, startOfToday, addDays } from '../lib/dates'
import TaskRow from '../components/TaskRow'

export default function ListView({ onOpenTask }) {
  const { data: tasks = [], isLoading } = useTasks()

  const today = startOfToday()
  const sevenOut = addDays(today, 7)

  const todayAndOverdue = tasks
    .filter((t) => {
      if (t.status === 'Done') return false
      if (!t.due_date) return true
      return parseDate(t.due_date) <= today
    })
    .sort((a, b) => {
      const ad = a.due_date ? parseDate(a.due_date).getTime() : Infinity
      const bd = b.due_date ? parseDate(b.due_date).getTime() : Infinity
      return ad - bd
    })

  const upcoming = tasks
    .filter((t) => {
      if (t.status === 'Done' || !t.due_date) return false
      const d = parseDate(t.due_date)
      return d > today && d <= sevenOut
    })
    .sort((a, b) => parseDate(a.due_date) - parseDate(b.due_date))
    .slice(0, 6)

  return (
    <div className="grid md:grid-cols-[1.5fr_1fr] gap-4">
      <Panel title="Today & overdue">
        {isLoading ? (
          <Skeleton />
        ) : todayAndOverdue.length === 0 ? (
          <Empty msg="Nothing due today or overdue" />
        ) : (
          todayAndOverdue.map((t) => (
            <TaskRow key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
          ))
        )}
      </Panel>
      <Panel title="Up next">
        {isLoading ? (
          <Skeleton />
        ) : upcoming.length === 0 ? (
          <Empty msg="Nothing in the next 7 days" />
        ) : (
          upcoming.map((t) => (
            <TaskRow key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
          ))
        )}
      </Panel>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <div className="px-4">{children}</div>
    </div>
  )
}

function Empty({ msg }) {
  return <div className="py-10 text-center text-xs text-text-3">{msg}</div>
}

function Skeleton() {
  return (
    <div className="py-4 space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 rounded-md bg-surface-2 animate-pulse" />
      ))}
    </div>
  )
}
