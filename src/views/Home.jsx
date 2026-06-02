import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useDepartments, usePeople, useTasks } from '../lib/queries'
import { useToast } from '../components/Toast'
import { applyAiFilter } from '../lib/applyAiFilter'
import QuickEntry from '../components/QuickEntry'
import QuickEntryModal from '../components/QuickEntryModal'
import FAB from '../components/FAB'
import TaskModal from '../components/TaskModal'
import Greeting from '../components/Greeting'
import TodayView from './TodayView'
import ListView from './ListView'
import PicHomeView from './PicHomeView'
import SearchPalette from '../components/SearchPalette'
import CommandPreviewModal from '../components/CommandPreviewModal'
import { onServiceWorkerMessage } from '../lib/registerSw'
import ActivityFeed from '../components/ActivityFeed'
import WorkspaceSwitcher from '../components/WorkspaceSwitcher'
import BottomNav from '../components/BottomNav'
import Sidebar from '../components/Sidebar'
import ShortcutsHelpModal from '../components/ShortcutsHelpModal'
import StandupModal from '../components/StandupModal'
import MobileMoreMenu from '../components/MobileMoreMenu'
import { TickdMark, TickdWordmark } from '../components/TickdMark'
import { useIsSuperadmin } from '../lib/queries'

// Lazy-load views and modals that aren't needed at first paint. Cuts
// the initial bundle so signed-in cold-start feels snappier — the
// most common landing (Today on the PWA) doesn't need Grid, PIC,
// Calendar, Settings, SuperAdmin, or the meeting extractor.
const GridView = lazy(() => import('./GridView'))
const PicView = lazy(() => import('./PicView'))
const CalendarView = lazy(() => import('./CalendarView'))
// KanbanView intentionally not lazy-loaded — removed from nav for
// now (Sidebar / BottomNav). File kept in src/views/ for the future.
const DocsView = lazy(() => import('./DocsView'))
const SettingsView = lazy(() => import('./SettingsView'))
const SuperAdminView = lazy(() => import('./SuperAdminView'))
const PulseView = lazy(() => import('./PulseView'))
const NotificationsView = lazy(() => import('./NotificationsView'))
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
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  // Inbox is no longer a full-screen overlay — it's a regular view
  // (`?view=inbox`) so the sidebar + topbar chrome stay mounted.
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

  // Quick-add toast "Open" + Notifications "Open task" both dispatch
  // `tickd:open-task`. We pop the TaskModal in place AND drop out of
  // any open sub-view so the modal is actually visible — when the user
  // is on Settings/SuperAdmin/Pulse, Home returns early and the modal
  // wouldn't render otherwise.
  useEffect(() => {
    function onOpen(e) {
      if (e?.detail?.taskId) {
        setShowSettings(false)
        setShowSuperAdmin(false)
        setShowPulse(false)
        setOpenTaskId(e.detail.taskId)
      }
    }
    window.addEventListener('tickd:open-task', onOpen)
    return () => window.removeEventListener('tickd:open-task', onOpen)
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
  // Inbox is now a regular view branch (view === 'inbox') below — it
  // renders inside the main layout so the sidebar + chrome stay
  // visible. Settings / SuperAdmin / Pulse remain full-screen for now.

  const openTask = tasks.find((t) => t.id === openTaskId)
  const isPicRole = workspace?.role === 'pic'
  // Inbox + Docs are full-page surfaces — skip Greeting / QuickEntry
  // / ActivityFeed so the surface fills the available space.
  const isFullPageView = view === 'inbox' || view === 'docs'

  const goHome = () => {
    setView('today')
    setOpenTaskId(null)
    setShowSettings(false)
    setShowSuperAdmin(false)
    setShowSearch(false)
    setShowExtract(false)
  }

  // Secondary actions surfaced in the mobile overflow menu (and as
  // standalone topbar buttons on desktop). Centralised so the two
  // chrome variants can't drift out of sync.
  const overflowActions = [
    {
      id: 'inbox',
      label: 'Inbox',
      icon: 'ti-inbox',
      onClick: () => setView('inbox'),
    },
    // Docs moved to the BottomNav primary slot for mobile users — no
    // longer needed in the overflow menu.
    {
      id: 'grid',
      label: 'Grid view',
      icon: 'ti-table',
      onClick: () => setView('grid'),
      visible: !isPicRole,
    },
    {
      id: 'meeting',
      label: 'Import from meeting',
      icon: 'ti-sparkles',
      onClick: () => setShowExtract(true),
      visible: !isPicRole,
    },
    {
      id: 'standup',
      label: "Today's standup",
      icon: 'ti-clipboard-text',
      onClick: () => setShowStandup(true),
    },
    {
      id: 'pulse',
      label: 'Workspace pulse',
      icon: 'ti-chart-bar',
      onClick: () => setShowPulse(true),
      visible: !isPicRole,
    },
    {
      id: 'superadmin',
      label: 'Super admin',
      icon: 'ti-shield-lock',
      onClick: () => setShowSuperAdmin(true),
      visible: isSuperadmin,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'ti-settings',
      onClick: () => setShowSettings(true),
    },
    {
      id: 'signout',
      label: 'Sign out',
      icon: 'ti-logout',
      onClick: signOut,
      destructive: true,
    },
  ]

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-16 sm:pb-0 flex">
      {/* ===== DESKTOP SIDEBAR =====
          Left rail with brand, workspace, view nav, secondary actions,
          and sign-out. Replaces the desktop topbar's role. The
          ClickUp/Linear/Notion idiom. Hidden on phone — BottomNav
          owns that surface. */}
      <Sidebar
        view={view}
        onChange={setView}
        onGoHome={goHome}
        onOpenSettings={() => setShowSettings(true)}
        onOpenSuperAdmin={() => setShowSuperAdmin(true)}
        onOpenSearch={() => setShowSearch(true)}
        onOpenMeeting={() => setShowExtract(true)}
        onOpenStandup={() => setShowStandup(true)}
        onOpenPulse={() => setShowPulse(true)}
        onOpenInbox={() => setView('inbox')}
        onOpenQuickAdd={() => setShowQuickAdd(true)}
        isPicRole={isPicRole}
      />

      <div className="flex-1 min-w-0">
      {/* ===== MOBILE STICKY TOPBAR =====
          Phone only — the slim chrome (logo · workspace · nudges ·
          search · overflow). Desktop chrome lives in the sidebar. */}
      <header
        className="sm:hidden sticky top-0 z-30 bg-bg/85 backdrop-blur-xl border-b border-border/60"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-2 sm:py-3">
          {/* ===== MOBILE TOPBAR (phone only) =====
              Slim chrome: logo · workspace · nudges · search · overflow.
              Everything secondary lives in the kebab menu so the bar
              doesn't compete with the page title underneath. */}
          <div className="sm:hidden flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={goHome}
              aria-label="Home"
              className="flex-shrink-0 active:opacity-70 transition-opacity"
            >
              <TickdMark size={28} />
            </button>
            <WorkspaceSwitcher />
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* Bell removed — the Inbox (sidebar entry + mobile overflow
                menu) is the single notifications surface now. */}
            <button
              onClick={() => setShowSearch(true)}
              className="w-10 h-10 rounded-full inline-flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors"
              aria-label="Search"
            >
              <i className="ti ti-search text-lg" />
            </button>
            <MobileMoreMenu items={overflowActions} />
          </div>
        </div>

        {/* Desktop chrome lives in the Sidebar component now — no
            duplicate topbar here. */}
        </div>
      </header>

      {/* Content wrapper. Drops max-w-6xl: with a 240px sidebar,
          centering the content with a 1152px cap on 1920+ displays
          left huge empty strips on the right. Letting the inner
          column fill the flex-1 area uses the screen properly.
          Full-page views (Inbox, Docs) drop the side padding on
          phones so the surface goes edge-to-edge — Docs in
          particular needs the writing column to breathe. */}
      <div
        className={
          isFullPageView
            ? 'w-full px-0 sm:px-6 lg:px-8 py-3 sm:py-6'
            : 'w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6'
        }
      >

        <>
          {!isFullPageView && (
            <>
              <Greeting tasks={tasks} />
              {/* Phone gets the FAB instead — QuickEntry would eat
                  the top third of the screen on small viewports. */}
              <div className="hidden sm:block">
                <QuickEntry />
              </div>
              {/* ViewTabs removed at sm+ — the desktop Sidebar handles
                  view switching. BottomNav still owns it on phone. */}
              <div className="mt-4 mb-4 sm:mt-0 sm:mb-2" />
            </>
          )}

          {/* Wrapping the active view in a keyed container makes React
              discard + remount on tab change, which replays the
              tickd-view-in CSS animation each time.

              PIC role: same view switcher as everyone else, but the
              Today view becomes PicHomeView (the focused landing).
              Grid + PIC views aren't surfaced in the PIC sidebar nav,
              so they shouldn't normally land here — guard anyway in
              case a URL is pasted. */}
          <div key={view} className="tickd-view-in">
            {view === 'today'    && (
              isPicRole ? (
                <PicHomeView onOpenTask={setOpenTaskId} />
              ) : (
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
              )
            )}
            {view === 'list'     && <ListView     onOpenTask={setOpenTaskId} />}
            {view === 'grid'     && !isPicRole && (
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
            {view === 'pic'      && !isPicRole && (
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
            {view === 'docs' && (
              <Suspense fallback={<ViewFallback />}>
                <DocsView />
              </Suspense>
            )}
            {view === 'inbox' && (
              <Suspense fallback={<ViewFallback />}>
                <NotificationsView
                  embedded
                  onOpenTask={(id) => setOpenTaskId(id)}
                />
              </Suspense>
            )}
          </div>

          {/* Recent activity feed — at-a-glance "what changed" strip,
              shown to everyone (the full audit log with restoration etc
              lives in Settings → Activity for owners/admins). Skipped
              on full-page surfaces (Inbox, Docs) where the chrome would
              be noise. */}
          {!isPicRole && !isFullPageView && (
            <div className="mt-6">
              <ActivityFeed onOpenTask={setOpenTaskId} compactLimit={5} />
            </div>
          )}
        </>

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
        <QuickEntryModal
          open={showQuickAdd}
          onClose={() => setShowQuickAdd(false)}
        />
      </div>
      </div>{/* /flex-1 main column wrapper */}

      {/* Mobile-only FAB for quick-add. Sits above the bottom nav and
          opens a sheet with the existing QuickEntry form inside. */}
      <FAB onClick={() => setShowQuickAdd(true)} label="Add task" />

      {/* Mobile-only bottom nav. Same view set as the sidebar — PICs
          get the focused subset (Today/List/Kanban/Calendar) via the
          picRole prop. */}
      <BottomNav active={view} onChange={setView} picRole={isPicRole} />
    </div>
  )
}
