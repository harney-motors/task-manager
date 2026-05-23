import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useDepartments, usePeople, useTasks } from '../lib/queries'
import { useToast } from '../components/Toast'
import { applyAiFilter } from '../lib/applyAiFilter'
import QuickEntry from '../components/QuickEntry'
import TaskModal from '../components/TaskModal'
import Greeting from '../components/Greeting'
import ViewTabs from '../components/ViewTabs'
import TodayView from './TodayView'
import ListView from './ListView'
import PicHomeView from './PicHomeView'
import SearchPalette from '../components/SearchPalette'
import CommandPreviewModal from '../components/CommandPreviewModal'
import { onServiceWorkerMessage } from '../lib/registerSw'
import ActivityFeed from '../components/ActivityFeed'
import WorkspaceSwitcher from '../components/WorkspaceSwitcher'
import NudgeBadge from '../components/NudgeBadge'
import BottomNav from '../components/BottomNav'
import ShortcutsHelpModal from '../components/ShortcutsHelpModal'
import StandupModal from '../components/StandupModal'
import { TickdMark, TickdWordmark } from '../components/TickdMark'
import { useIsSuperadmin } from '../lib/queries'

// Lazy-load views and modals that aren't needed at first paint. Cuts
// the initial bundle so signed-in cold-start feels snappier — the
// most common landing (Today on the PWA) doesn't need Grid, PIC,
// Calendar, Settings, SuperAdmin, or the meeting extractor.
const GridView = lazy(() => import('./GridView'))
const PicView = lazy(() => import('./PicView'))
const CalendarView = lazy(() => import('./CalendarView'))
const SettingsView = lazy(() => import('./SettingsView'))
const SuperAdminView = lazy(() => import('./SuperAdminView'))
const PulseView = lazy(() => import('./PulseView'))
const ExtractFromMeetingModal = lazy(() =>
  import('../components/ExtractFromMeetingModal'),
)

// Tiny fallback for lazy views — keeps the perceived shift small.
function ViewFallback() {
  return (
    <div className="bg-surface border border-border rounded-xl p-10 text-center text-xs text-text-3">
      Loading…
    </div>
  )
}

export default function Home() {
  const { user, workspace, workspaceLoading, signOut } = useAuth()
  const { data: tasks = [] } = useTasks()
  const { data: people = [] } = usePeople()
  const { data: departments = [] } = useDepartments()
  const { data: isSuperadmin = false } = useIsSuperadmin()
  const showToast = useToast()
  const [openTaskId, setOpenTaskId] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showSuperAdmin, setShowSuperAdmin] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showExtract, setShowExtract] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showStandup, setShowStandup] = useState(false)
  const [showPulse, setShowPulse] = useState(false)
  const [aiCommandPlan, setAiCommandPlan] = useState(null)

  // ---- URL-backed navigation state ----
  // view, selected PIC, and the Grid pre-filter (pic/dept/status) all
  // live in the query string so links are bookmarkable, shareable,
  // and survive refreshes. Browser back/forward also works.
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') || 'today'
  const picViewSelectedId = searchParams.get('pic') || null
  const gridFilterSignal = (() => {
    const picF = searchParams.get('picFilter')
    const deptF = searchParams.get('dept')
    const statusF = searchParams.get('status')
    // Only construct a signal when at least one filter is set, so we
    // don't blow away GridView's local clear-state on every nav.
    if (!picF && !deptF && !statusF) return null
    return {
      picId: picF || 'all',
      deptId: deptF || 'all',
      status: statusF || 'all',
      key: `${picF}|${deptF}|${statusF}`,
    }
  })()

  // Helpers — these accept partial updates and preserve the rest of
  // the query string (notably ?task=<id> if a modal is open).
  const setView = useCallback(
    (next) => {
      setSearchParams(
        (prev) => {
          if (next === 'today') prev.delete('view')
          else prev.set('view', next)
          return prev
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const setPicViewSelectedId = useCallback(
    (next) => {
      setSearchParams(
        (prev) => {
          if (next) prev.set('pic', next)
          else prev.delete('pic')
          return prev
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setGridFilterSignal = useCallback(
    (signal) => {
      setSearchParams(
        (prev) => {
          if (!signal) {
            prev.delete('picFilter')
            prev.delete('dept')
            prev.delete('status')
            prev.delete('priority')
            prev.delete('due')
            prev.delete('sort')
            return prev
          }
          // 'all' is the default — represent as missing param.
          const apply = (key, value) => {
            if (!value || value === 'all') prev.delete(key)
            else prev.set(key, value)
          }
          apply('picFilter', signal.picId)
          apply('dept', signal.deptId)
          apply('status', signal.status)
          apply('priority', signal.priority)
          apply('due', signal.due)
          apply('sort', signal.sort)
          return prev
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  // Service-worker → app bridge. When the user clicks a push
  // notification on a WARM app (Tickd already open in a tab), the SW
  // posts a message back here and we open the task modal in place.
  useEffect(() => {
    const off = onServiceWorkerMessage((msg) => {
      if (msg.type === 'tickd:open-notification' && msg.taskId) {
        setOpenTaskId(msg.taskId)
      }
    })
    return off
  }, [])

  // Cold-start deep link: if the URL has ?task=<id> (set by the SW
  // when there was no open tab to focus), open that task and strip
  // the param so a reload doesn't keep re-opening it.
  useEffect(() => {
    const id = searchParams.get('task')
    if (!id) return
    setOpenTaskId(id)
    setSearchParams(
      (prev) => {
        prev.delete('task')
        return prev
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Global keyboard shortcuts. Includes the `/` focus-quick-entry,
  // Cmd+K open-search, `?` help modal, and a gmail-style `g <letter>`
  // chord for view jumping. Skips when the user is typing in a field.
  //
  // chordRef tracks the in-flight `g` prefix so we can detect the
  // next keystroke as the chord follow-up. 1.5s window before reset.
  const chordRef = useRef({ prefix: null, timer: null })
  function resetChord() {
    if (chordRef.current.timer) clearTimeout(chordRef.current.timer)
    chordRef.current.prefix = null
    chordRef.current.timer = null
  }
  function armChord(prefix) {
    resetChord()
    chordRef.current.prefix = prefix
    chordRef.current.timer = setTimeout(resetChord, 1500)
  }
  function goView(target) {
    setShowSettings(false)
    setShowSuperAdmin(false)
    setShowSearch(false)
    setShowExtract(false)
    setShowHelp(false)
    setOpenTaskId(null)
    if (target === 'settings') setShowSettings(true)
    else setView(target)
  }

  useEffect(() => {
    function onKey(e) {
      // Cmd+K (Mac) / Ctrl+K (Win) always works — even inside fields,
      // so you can pop search from the quick-entry input.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowSearch(true)
        return
      }

      const tag = e.target?.tagName
      const inField =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        e.target?.isContentEditable
      if (inField) return

      // Chord follow-up: previous key was `g`.
      if (chordRef.current.prefix === 'g') {
        const map = {
          t: 'today',
          l: 'list',
          g: 'grid',
          p: 'pic',
          c: 'calendar',
          s: 'settings',
        }
        const target = map[e.key]
        if (target) {
          e.preventDefault()
          goView(target)
        }
        resetChord()
        return
      }

      // ? opens the cheat sheet (Shift+/ on US layouts).
      if (e.key === '?') {
        e.preventDefault()
        setShowHelp(true)
        return
      }

      // Focus quick entry from `/` or `c`.
      if (e.key === '/' || e.key === 'c') {
        const input = document.getElementById('quick-entry-input')
        if (input) {
          e.preventDefault()
          input.focus()
          return
        }
      }

      // Start a g-chord.
      if (e.key === 'g') {
        armChord('g')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return (
      <Suspense fallback={<ViewFallback />}>
        <SettingsView onBack={() => setShowSettings(false)} />
      </Suspense>
    )
  }
  if (showSuperAdmin && isSuperadmin) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <SuperAdminView onBack={() => setShowSuperAdmin(false)} />
      </Suspense>
    )
  }
  if (showPulse) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <PulseView
          onBack={() => setShowPulse(false)}
          onOpenTask={(id) => {
            setShowPulse(false)
            setOpenTaskId(id)
          }}
        />
      </Suspense>
    )
  }

  const openTask = tasks.find((t) => t.id === openTaskId)
  const isPicRole = workspace?.role === 'pic'

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-16 sm:pb-0">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => {
                setView('today')
                setOpenTaskId(null)
                setShowSettings(false)
                setShowSuperAdmin(false)
                setShowSearch(false)
                setShowExtract(false)
              }}
              aria-label="Home"
              className="flex items-center gap-2 sm:gap-3 min-w-0 hover:opacity-80 transition-opacity"
            >
              <TickdMark size={32} className="flex-shrink-0" />
              {/* Wordmark eats horizontal room next to the workspace
                  switcher on phones; the icon alone covers branding. */}
              <TickdWordmark className="text-lg hidden sm:inline" />
            </button>
            <WorkspaceSwitcher />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-sm min-w-0">
            <span className="text-text-2 hidden sm:inline truncate max-w-[180px]">
              {user.email}
            </span>
            <NudgeBadge />
            {!isPicRole && (
              <button
                onClick={() => setShowExtract(true)}
                className="px-2 py-1 rounded hover:bg-surface-2 text-text-2 hover:text-text inline-flex items-center gap-1.5 text-xs border border-border"
                aria-label="Import from meeting"
                title="Import tasks from meeting notes"
              >
                <i className="ti ti-sparkles text-sm text-info" />
                <span className="hidden sm:inline">Meeting</span>
              </button>
            )}
            <button
              onClick={() => setShowStandup(true)}
              className="p-2 rounded hover:bg-surface-2 text-text-2 hover:text-text"
              aria-label="Generate today's standup"
              title="Generate today's standup"
            >
              <i className="ti ti-clipboard-text text-base" />
            </button>
            {!isPicRole && (
              <button
                onClick={() => setShowPulse(true)}
                className="p-2 rounded hover:bg-surface-2 text-text-2 hover:text-text"
                aria-label="Workspace pulse"
                title="Workspace pulse"
              >
                <i className="ti ti-chart-bar text-base" />
              </button>
            )}
            <button
              onClick={() => setShowSearch(true)}
              className="px-2 py-1 rounded hover:bg-surface-2 text-text-2 hover:text-text inline-flex items-center gap-1.5 text-xs border border-border"
              aria-label="Search"
              title="Search (Cmd+K)"
            >
              <i className="ti ti-search text-sm" />
              <kbd className="hidden sm:inline text-[10px] text-text-3">⌘K</kbd>
            </button>
            {isSuperadmin && (
              <button
                onClick={() => setShowSuperAdmin(true)}
                className="p-2 rounded hover:bg-surface-2 text-text-2 hover:text-text"
                aria-label="Super admin"
                title="Super admin panel"
              >
                <i className="ti ti-shield-lock text-base text-info" />
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded hover:bg-surface-2 text-text-2 hover:text-text"
              aria-label="Settings"
            >
              <i className="ti ti-settings text-base" />
            </button>
            {/* Sign out lives in Settings → Profile too; hide on
                phones so the topbar stops overflowing. */}
            <button
              onClick={signOut}
              className="hidden sm:inline text-text-3 hover:text-text underline text-xs whitespace-nowrap"
            >
              Sign out
            </button>
          </div>
        </div>

        {isPicRole ? (
          <>
            {/* PIC mode — simplified focused experience. Quick-entry stays
                so PICs can log their own follow-ups; everything else is
                hidden. */}
            <Greeting tasks={tasks} />
            <QuickEntry />
            <div className="mt-4">
              <PicHomeView onOpenTask={setOpenTaskId} />
            </div>
          </>
        ) : (
          <>
            <Greeting tasks={tasks} />
            <QuickEntry />

            {/* In-page tabs only on tablet+; mobile uses BottomNav.
                Always keep top spacing so the gap between QuickEntry
                and the view body stays consistent on both sizes. */}
            <div className="mt-4 mb-4">
              <div className="hidden sm:block">
                <ViewTabs active={view} onChange={setView} />
              </div>
            </div>

            {/* Wrapping the active view in a keyed container makes React
                discard + remount on tab change, which replays the
                tickd-view-in CSS animation each time. */}
            <div key={view} className="tickd-view-in">
              {view === 'today'    && (
                <TodayView
                  onOpenTask={setOpenTaskId}
                  onOpenSettings={() => setShowSettings(true)}
                  onSwitchView={(target, hint) => {
                    if (target === 'pic') {
                      setView('pic')
                      if (hint?.picId) setPicViewSelectedId(hint.picId)
                    } else if (target === 'grid') {
                      // Apply a status hint to Grid via the existing aiFilter
                      // signal (same channel Cmd+K uses). bumping a counter on
                      // `key` ensures the effect re-fires even for identical hints.
                      setGridFilterSignal({
                        status: hint?.status ?? 'all',
                        picId: hint?.picId ?? 'all',
                        deptId: hint?.deptId ?? 'all',
                        priority: hint?.priority ?? 'all',
                        due: hint?.due ?? 'all',
                        sort: hint?.sort ?? 'all',
                        key: Date.now(),
                      })
                      setView('grid')
                    } else {
                      setView(target)
                    }
                  }}
                />
              )}
              {view === 'list'     && <ListView     onOpenTask={setOpenTaskId} />}
              {view === 'grid'     && (
                <Suspense fallback={<ViewFallback />}>
                <GridView
                  onOpenTask={setOpenTaskId}
                  aiFilter={gridFilterSignal}
                  onFiltersChange={(next) => {
                    // Strip default-all values; setGridFilterSignal handles the null case.
                    const allDefault =
                      next.picId === 'all' &&
                      next.deptId === 'all' &&
                      next.status === 'all'
                    setGridFilterSignal(allDefault ? null : next)
                  }}
                />
                </Suspense>
              )}
              {view === 'pic'      && (
                <Suspense fallback={<ViewFallback />}>
                  <PicView
                    onOpenTask={setOpenTaskId}
                    selectedPicId={picViewSelectedId ?? undefined}
                    onSelectPic={setPicViewSelectedId}
                  />
                </Suspense>
              )}
              {view === 'calendar' && (
                <Suspense fallback={<ViewFallback />}>
                  <CalendarView onOpenTask={setOpenTaskId} />
                </Suspense>
              )}
            </div>

            {/* Activity feed sits below the view content so it isn't the first
                thing you see on sign-in. */}
            <div className="mt-6">
              <ActivityFeed onOpenTask={setOpenTaskId} compactLimit={5} />
            </div>
          </>
        )}

        <TaskModal
          task={openTask}
          onClose={() => setOpenTaskId(null)}
          onOpenTask={(id) => setOpenTaskId(id)}
        />
        <SearchPalette
          open={showSearch}
          onClose={() => setShowSearch(false)}
          onOpenTask={(id) => setOpenTaskId(id)}
          onSelectPic={(id) => {
            setView('pic')
            setPicViewSelectedId(id)
          }}
          onApplyFilter={(filter) => {
            applyAiFilter(filter, {
              people,
              departments,
              setView,
              setPicViewSelectedId,
              setGridFilterSignal,
              showToast,
            })
          }}
          onPreviewCommand={(plan) => setAiCommandPlan(plan)}
        />
        <CommandPreviewModal
          plan={aiCommandPlan}
          onClose={() => setAiCommandPlan(null)}
        />
        {showExtract && (
          <Suspense fallback={null}>
            <ExtractFromMeetingModal
              open={showExtract}
              onClose={() => setShowExtract(false)}
            />
          </Suspense>
        )}
        <ShortcutsHelpModal
          open={showHelp}
          onClose={() => setShowHelp(false)}
        />
        <StandupModal open={showStandup} onClose={() => setShowStandup(false)} />
      </div>
      {/* Mobile-only bottom nav. PIC-mode users see no tabs since
          PicHomeView is a single-page experience. */}
      {!isPicRole && <BottomNav active={view} onChange={setView} />}
    </div>
  )
}
