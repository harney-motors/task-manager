import { useAuth } from '../auth/AuthProvider'
import { TickdMark, TickdWordmark } from './TickdMark'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import NudgeBadge from './NudgeBadge'
import { useIsSuperadmin } from '../lib/queries'

// Desktop-only left sidebar — replaces the top ViewTabs at sm+. The
// "established SaaS app" pattern shared by ClickUp, Linear, Notion,
// Slack, etc. Mobile keeps the BottomNav.
//
// Structure (top → bottom):
//   1. Brand: TickdMark + wordmark, clickable → home (Today)
//   2. Workspace switcher pill
//   3. Primary nav: Today / List / Grid / PIC / Calendar
//   4. Secondary chrome: Meeting / Standup / Pulse / Notifications
//   5. Pinned at the bottom: Settings, Super admin (if applicable),
//      Sign out
//
// Hidden on phone (`hidden sm:flex`) — BottomNav owns that surface.
// `picOk: true` — view is available to PIC-role users. The PIC role
// is RLS-scoped to their own tasks, so views that show "all PICs"
// (Grid columns, By-PIC chip selector) aren't useful for them. We
// keep the focused subset (Today/List/Kanban/Calendar) so PICs can
// still re-shape their workload across the formats that make sense.
const VIEWS = [
  { id: 'today',    label: 'Today',    icon: 'ti-sun',           picOk: true },
  { id: 'list',     label: 'List',     icon: 'ti-list',          picOk: true },
  { id: 'grid',     label: 'Grid',     icon: 'ti-table',         picOk: false },
  { id: 'kanban',   label: 'Kanban',   icon: 'ti-layout-kanban', picOk: true },
  { id: 'pic',      label: 'By PIC',   icon: 'ti-users',         picOk: false },
  { id: 'calendar', label: 'Calendar', icon: 'ti-calendar',      picOk: true },
  { id: 'docs',     label: 'Docs',     icon: 'ti-book-2',        picOk: true },
]

export default function Sidebar({
  view,
  onChange,
  onGoHome,
  onOpenSettings,
  onOpenSuperAdmin,
  onOpenSearch,
  onOpenMeeting,
  onOpenStandup,
  onOpenPulse,
  onOpenQuickAdd,
  isPicRole,
}) {
  const { user, signOut } = useAuth()
  const { data: isSuperadmin = false } = useIsSuperadmin()

  return (
    <aside
      className="hidden sm:flex sticky top-0 h-screen w-60 flex-col bg-surface border-r border-border flex-shrink-0"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Brand */}
      <div className="px-4 pt-4 pb-3">
        <button
          onClick={onGoHome}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          aria-label="Home"
        >
          <TickdMark size={28} />
          <TickdWordmark className="text-lg" />
        </button>
      </div>

      {/* Workspace */}
      <div className="px-3 pb-3">
        <WorkspaceSwitcher />
      </div>

      {/* Primary CTA: New task — the ClickUp/Linear top-of-sidebar
          pattern. One click from anywhere to capture a task. */}
      <div className="px-3 pb-2">
        <button
          onClick={onOpenQuickAdd}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-info text-white shadow-sm hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <i className="ti ti-plus text-base" />
          New task
        </button>
      </div>

      {/* Search button + notifications bell. Pair sits in the "header
          utility row" — same vocabulary every established SaaS app
          uses (Linear, ClickUp, Notion). The bell was previously only
          mounted in the mobile topbar; without it here, desktop users
          had no way to see nudges from any of the main views.
          h-10 on the search side matches the bell's intrinsic w-10/h-10
          so the two render at the same baseline. */}
      <div className="px-3 pb-2 flex items-center gap-1.5">
        <button
          onClick={onOpenSearch}
          className="flex-1 h-10 flex items-center gap-2.5 px-2.5 rounded-lg text-sm text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors border border-border/60"
        >
          <i className="ti ti-search text-base" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[10px] text-text-3 border border-border bg-surface rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        </button>
        <NudgeBadge />
      </div>

      {/* Primary view nav. PIC role gets a focused subset (Today,
          List, Kanban, Calendar) — Grid + By-PIC don't add value
          when RLS already pins data to their own tasks. */}
      <nav className="px-2 pb-3">
        <ul className="space-y-0.5">
          {VIEWS.filter((v) => (isPicRole ? v.picOk : true)).map((v) => (
            <li key={v.id}>
              <NavItem
                icon={v.icon}
                label={v.label}
                active={view === v.id}
                onClick={() => onChange(v.id)}
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* Secondary actions */}
      <div className="px-2 pb-3 border-t border-border/60 pt-3">
        <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold px-2.5 mb-1.5">
          Workspace
        </div>
        <ul className="space-y-0.5">
          {!isPicRole && (
            <li>
              <NavItem
                icon="ti-sparkles"
                label="Import from meeting"
                onClick={onOpenMeeting}
              />
            </li>
          )}
          <li>
            <NavItem
              icon="ti-clipboard-text"
              label="Today's standup"
              onClick={onOpenStandup}
            />
          </li>
          {!isPicRole && (
            <li>
              <NavItem
                icon="ti-chart-bar"
                label="Workspace pulse"
                onClick={onOpenPulse}
              />
            </li>
          )}
        </ul>
      </div>

      {/* Pinned bottom group */}
      <div className="mt-auto px-2 pb-3 border-t border-border/60 pt-3">
        <ul className="space-y-0.5">
          {isSuperadmin && (
            <li>
              <NavItem
                icon="ti-shield-lock"
                label="Super admin"
                onClick={onOpenSuperAdmin}
                accent="info"
              />
            </li>
          )}
          <li>
            <NavItem
              icon="ti-settings"
              label="Settings"
              onClick={onOpenSettings}
            />
          </li>
        </ul>

        {/* Account footer */}
        <div className="mt-3 px-2.5 pt-3 border-t border-border/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-surface-2 text-text-2 inline-flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
              {initials(user?.email)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-text truncate" title={user?.email}>
                {user?.email}
              </div>
              <button
                onClick={signOut}
                className="text-[10px] text-text-3 hover:text-text underline"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function NavItem({ icon, label, active = false, onClick, accent }) {
  const accentText =
    accent === 'info' ? 'text-info' : active ? 'text-text' : 'text-text-2'
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors active:scale-[0.98] ${
        active
          ? 'bg-info-bg text-info-text font-semibold'
          : `${accentText} hover:text-text hover:bg-surface-2`
      }`}
    >
      <i
        className={`ti ${icon} text-base ${active ? 'text-info' : ''}`}
      />
      <span className="flex-1 text-left">{label}</span>
    </button>
  )
}

function initials(email) {
  if (!email) return '?'
  const local = email.split('@')[0]
  return local.slice(0, 2).toUpperCase()
}
