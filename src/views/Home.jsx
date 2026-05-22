import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useTasks } from '../lib/queries'
import QuickEntry from '../components/QuickEntry'
import TaskModal from '../components/TaskModal'
import Greeting from '../components/Greeting'
import ViewTabs from '../components/ViewTabs'
import ListView from './ListView'
import GridView from './GridView'
import PicView from './PicView'
import CalendarView from './CalendarView'

export default function Home() {
  const { user, workspace, workspaceLoading, signOut } = useAuth()
  const { data: tasks = [] } = useTasks()
  const [openTaskId, setOpenTaskId] = useState(null)
  const [view, setView] = useState('list')

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

  const openTask = tasks.find((t) => t.id === openTaskId)

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-info text-white flex items-center justify-center flex-shrink-0">
              <i className="ti ti-checkbox text-base" />
            </div>
            <span className="text-lg font-medium tracking-tight">Loop</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-sm min-w-0">
            <span className="text-text-2 hidden sm:inline truncate max-w-[180px]">
              {user.email}
            </span>
            <button
              onClick={signOut}
              className="text-text-3 hover:text-text underline text-xs whitespace-nowrap"
            >
              Sign out
            </button>
          </div>
        </div>

        <Greeting tasks={tasks} />
        <QuickEntry />

        <div className="mt-4 mb-4">
          <ViewTabs active={view} onChange={setView} />
        </div>

        {view === 'list'     && <ListView     onOpenTask={setOpenTaskId} />}
        {view === 'grid'     && <GridView     onOpenTask={setOpenTaskId} />}
        {view === 'pic'      && <PicView      onOpenTask={setOpenTaskId} />}
        {view === 'calendar' && <CalendarView onOpenTask={setOpenTaskId} />}

        <TaskModal task={openTask} onClose={() => setOpenTaskId(null)} />
      </div>
    </div>
  )
}
