import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useTasks } from '../lib/queries'
import QuickEntry from '../components/QuickEntry'
import TaskModal from '../components/TaskModal'
import Greeting from '../components/Greeting'
import ViewTabs from '../components/ViewTabs'
import TodayView from './TodayView'
import ListView from './ListView'
import GridView from './GridView'
import PicView from './PicView'
import CalendarView from './CalendarView'
import SettingsView from './SettingsView'
import SearchPalette from '../components/SearchPalette'
import ExtractFromMeetingModal from '../components/ExtractFromMeetingModal'
import { TickdMark, TickdWordmark } from '../components/TickdMark'

export default function Home() {
  const { user, workspace, workspaceLoading, signOut } = useAuth()
  const { data: tasks = [] } = useTasks()
  const [openTaskId, setOpenTaskId] = useState(null)
  const [view, setView] = useState('today')
  const [showSettings, setShowSettings] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showExtract, setShowExtract] = useState(false)
  const [picViewSelectedId, setPicViewSelectedId] = useState(null)

  // "/" keybind focuses the quick entry input from anywhere on the home page
  // (unless already typing in a form field).
  useEffect(() => {
    function onKey(e) {
      // Cmd+K (Mac) / Ctrl+K (Win) opens search from anywhere
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(true)
        return
      }
      if (e.key !== '/') return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.target?.isContentEditable) return
      const input = document.getElementById('quick-entry-input')
      if (input) {
        e.preventDefault()
        input.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  if (showSettings) {
    return <SettingsView onBack={() => setShowSettings(false)} />
  }

  const openTask = tasks.find((t) => t.id === openTaskId)

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <TickdMark size={32} className="flex-shrink-0" />
            <TickdWordmark className="text-lg" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-sm min-w-0">
            <span className="text-text-2 hidden sm:inline truncate max-w-[180px]">
              {user.email}
            </span>
            <button
              onClick={() => setShowExtract(true)}
              className="px-2 py-1 rounded hover:bg-surface-2 text-text-2 hover:text-text inline-flex items-center gap-1.5 text-xs border border-border"
              aria-label="Import from meeting"
              title="Import tasks from meeting notes"
            >
              <i className="ti ti-sparkles text-sm text-info" />
              <span className="hidden sm:inline">Meeting</span>
            </button>
            <button
              onClick={() => setShowSearch(true)}
              className="px-2 py-1 rounded hover:bg-surface-2 text-text-2 hover:text-text inline-flex items-center gap-1.5 text-xs border border-border"
              aria-label="Search"
              title="Search (Cmd+K)"
            >
              <i className="ti ti-search text-sm" />
              <kbd className="hidden sm:inline text-[10px] text-text-3">⌘K</kbd>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded hover:bg-surface-2 text-text-2 hover:text-text"
              aria-label="Settings"
            >
              <i className="ti ti-settings text-base" />
            </button>
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

        {view === 'today'    && <TodayView    onOpenTask={setOpenTaskId} />}
        {view === 'list'     && <ListView     onOpenTask={setOpenTaskId} />}
        {view === 'grid'     && <GridView     onOpenTask={setOpenTaskId} />}
        {view === 'pic'      && (
          <PicView
            onOpenTask={setOpenTaskId}
            selectedPicId={picViewSelectedId ?? undefined}
            onSelectPic={setPicViewSelectedId}
          />
        )}
        {view === 'calendar' && <CalendarView onOpenTask={setOpenTaskId} />}

        <TaskModal task={openTask} onClose={() => setOpenTaskId(null)} />
        <SearchPalette
          open={showSearch}
          onClose={() => setShowSearch(false)}
          onOpenTask={(id) => setOpenTaskId(id)}
          onSelectPic={(id) => {
            setView('pic')
            setPicViewSelectedId(id)
          }}
        />
        <ExtractFromMeetingModal
          open={showExtract}
          onClose={() => setShowExtract(false)}
        />
      </div>
    </div>
  )
}
