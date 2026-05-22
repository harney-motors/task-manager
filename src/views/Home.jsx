import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useTasks } from '../lib/queries'
import { parseDate, startOfToday, addDays } from '../lib/dates'
import QuickEntry from '../components/QuickEntry'
import TaskRow from '../components/TaskRow'
import TaskModal from '../components/TaskModal'
import Greeting from '../components/Greeting'

export default function Home() {
  const { user, workspace, workspaceLoading, signOut } = useAuth()
  const { data: tasks = [], isLoading } = useTasks()
  const [openTaskId, setOpenTaskId] = useState(null)

  const today = startOfToday()
  const sevenOut = addDays(today, 7)

  // "Today & overdue" also acts as the inbox for unscheduled tasks
  // (no due_date) — otherwise quick-entry tasks would vanish into neither panel.
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

  const openTask = tasks.find((t) => t.id === openTaskId)

  if (workspaceLoading && !workspace) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-text-3 text-sm">
        Loading workspace…
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-text-2 text-sm">
            No workspace found for{' '}
            <span className="font-medium text-text">{user.email}</span>.
          </p>
          <p className="text-xs text-text-3 mt-2">
            Either this account isn't in <code>workspace_members</code>, or the
            seed used a different email. Run <code>supabase/seed.sql</code> with{' '}
            <code>{user.email}</code> as the value of <code>YOUR_EMAIL</code>,
            or sign out and sign in with the seeded account.
          </p>
          <button
            onClick={signOut}
            className="mt-4 text-xs underline text-text-3 hover:text-text"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-info text-white flex items-center justify-center">
              <i className="ti ti-checkbox text-base" />
            </div>
            <span className="text-lg font-medium tracking-tight">Loop</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-text-2">{user.email}</span>
            <button
              onClick={signOut}
              className="text-text-3 hover:text-text underline text-xs"
            >
              Sign out
            </button>
          </div>
        </div>

        <Greeting tasks={tasks} />
        <QuickEntry />

        <div className="grid md:grid-cols-[1.5fr_1fr] gap-4 mt-4">
          <Panel title="Today & overdue">
            {isLoading ? (
              <Skeleton />
            ) : todayAndOverdue.length === 0 ? (
              <Empty msg="Nothing due today or overdue" />
            ) : (
              todayAndOverdue.map((t) => (
                <TaskRow key={t.id} task={t} onClick={() => setOpenTaskId(t.id)} />
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
                <TaskRow key={t.id} task={t} onClick={() => setOpenTaskId(t.id)} />
              ))
            )}
          </Panel>
        </div>

        <TaskModal task={openTask} onClose={() => setOpenTaskId(null)} />
      </div>
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
