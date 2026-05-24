import { useMemo, useState } from 'react'
import {
  useAllNudges,
  useDismissNudge,
  useRestoreNudge,
} from '../lib/queries'

// Full-page notifications inbox — accessible via the "See history" link
// in the NotificationsModal, or directly from the sub-view chrome where
// the Settings/SuperAdmin pattern lives. Shows active + dismissed
// nudges so the user can scan recent AI activity and restore anything
// they cleared by mistake.
//
// Same sticky-header pattern as Settings/SuperAdmin/Pulse. Onback
// returns to wherever the user came from (Home's view state).
export default function NotificationsView({ onBack, onOpenTask }) {
  const { data: nudges = [], isLoading } = useAllNudges()
  const dismiss = useDismissNudge()
  const restore = useRestoreNudge()
  const [filter, setFilter] = useState('all') // all | active | dismissed
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let rows = nudges
    if (filter === 'active') rows = rows.filter((n) => n.status === 'active')
    if (filter === 'dismissed') rows = rows.filter((n) => n.status === 'dismissed')
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          n.body?.toLowerCase().includes(q),
      )
    }
    return rows
  }, [nudges, filter, search])

  const counts = useMemo(() => {
    let active = 0
    let dismissed = 0
    for (const n of nudges) {
      if (n.status === 'active') active++
      else if (n.status === 'dismissed') dismissed++
    }
    return { all: nudges.length, active, dismissed }
  }, [nudges])

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <header
        className="sticky top-0 z-30 bg-bg/85 backdrop-blur-xl border-b border-border/60"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto max-w-3xl px-3 sm:px-6 py-2 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-full inline-flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors flex-shrink-0"
              aria-label="Back"
            >
              <i className="ti ti-arrow-left text-base" />
            </button>
            <i className="ti ti-bell text-info text-lg flex-shrink-0" />
            <h1 className="text-base sm:text-xl font-medium tracking-tight flex-1 min-w-0">
              Notifications
            </h1>
          </div>

          {/* Filter tabs + search row */}
          <div className="flex items-center gap-2">
            <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="inline-flex items-center gap-0.5 p-0.5 bg-surface-2 rounded-md">
                <FilterTab
                  active={filter === 'all'}
                  count={counts.all}
                  onClick={() => setFilter('all')}
                >
                  All
                </FilterTab>
                <FilterTab
                  active={filter === 'active'}
                  count={counts.active}
                  onClick={() => setFilter('active')}
                >
                  Active
                </FilterTab>
                <FilterTab
                  active={filter === 'dismissed'}
                  count={counts.dismissed}
                  onClick={() => setFilter('dismissed')}
                >
                  Dismissed
                </FilterTab>
              </div>
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 min-w-0 text-xs px-3 py-1.5 rounded-md border border-border bg-surface outline-none focus:border-info"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-3 sm:px-6 py-4 sm:py-6">
        {isLoading ? (
          <div className="bg-surface border border-border rounded-xl p-10 text-center text-xs text-text-3">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            kind={
              search
                ? 'no-match'
                : filter === 'dismissed'
                  ? 'no-dismissed'
                  : filter === 'active'
                    ? 'no-active'
                    : 'no-history'
            }
          />
        ) : (
          <ul className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border">
            {filtered.map((n) => (
              <HistoryRow
                key={n.id}
                nudge={n}
                onOpenTask={onOpenTask}
                onDismiss={() => dismiss.mutate(n.id)}
                onRestore={() => restore.mutate(n.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function FilterTab({ active, count, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] sm:text-xs px-2.5 py-1.5 rounded inline-flex items-center gap-1 whitespace-nowrap active:scale-95 transition-transform ${
        active
          ? 'bg-surface text-text font-semibold shadow-sm'
          : 'text-text-2 hover:text-text'
      }`}
    >
      {children}
      <span className="text-[10px] text-text-3">{count}</span>
    </button>
  )
}

const SEVERITY_STYLE = {
  urgent: 'bg-red-600 text-white',
  high:   'bg-orange-500 text-white',
  medium: 'bg-info text-white',
  low:    'bg-text-3/30 text-text-2',
}

const SEVERITY_ICON = {
  urgent: 'ti-flame',
  high:   'ti-alert-triangle',
  medium: 'ti-bulb',
  low:    'ti-info-circle',
}

function HistoryRow({ nudge, onOpenTask, onDismiss, onRestore }) {
  const tone = SEVERITY_STYLE[nudge.severity] || SEVERITY_STYLE.medium
  const icon = SEVERITY_ICON[nudge.severity] || SEVERITY_ICON.medium
  const isDismissed = nudge.status === 'dismissed'
  const taskIds = nudge.payload?.task_ids ?? []
  const primaryTaskId = taskIds[0]

  function handleRowClick() {
    if (primaryTaskId && onOpenTask) onOpenTask(primaryTaskId)
  }

  return (
    <li>
      <div
        onClick={handleRowClick}
        className={`group flex items-start gap-3 px-3 sm:px-4 py-3 transition-colors ${
          primaryTaskId ? 'cursor-pointer hover:bg-surface-2 active:bg-surface-3' : ''
        } ${isDismissed ? 'opacity-70' : ''}`}
      >
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-lg inline-flex items-center justify-center ${tone}`}
        >
          <i className={`ti ${icon} text-sm`} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-snug flex items-center gap-2 flex-wrap">
            <span className={isDismissed ? 'text-text-2' : ''}>{nudge.title}</span>
            {isDismissed && (
              <span className="text-[10px] px-1.5 py-px rounded bg-surface-3 text-text-3 uppercase tracking-wider">
                Dismissed
              </span>
            )}
          </div>
          {nudge.body && (
            <div className="text-[11px] sm:text-xs text-text-2 mt-0.5 leading-snug">
              {nudge.body}
            </div>
          )}
          <div className="text-[10px] text-text-3 mt-1 flex items-center gap-2 flex-wrap">
            <span>{formatAbsolute(nudge.created_at)}</span>
            {isDismissed && nudge.dismissed_at && (
              <span>· dismissed {formatAbsolute(nudge.dismissed_at)}</span>
            )}
            {primaryTaskId && !isDismissed && (
              <span className="text-info inline-flex items-center gap-0.5">
                <i className="ti ti-arrow-right text-[10px]" />
                Open task
              </span>
            )}
          </div>
        </div>
        {isDismissed ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRestore()
            }}
            aria-label="Restore"
            title="Restore to active"
            className="flex-shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center text-text-3 hover:text-info hover:bg-info-bg/40 active:bg-info-bg transition-colors"
          >
            <i className="ti ti-rotate-clockwise-2 text-sm" />
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDismiss()
            }}
            aria-label="Dismiss"
            title="Dismiss"
            className="flex-shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center text-text-3 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors"
          >
            <i className="ti ti-x text-sm" />
          </button>
        )}
      </div>
    </li>
  )
}

function EmptyState({ kind }) {
  const COPY = {
    'no-history': {
      icon: 'ti-bell-off',
      title: 'No notifications yet',
      sub: 'Tickd AI will surface anything worth your attention here.',
    },
    'no-active': {
      icon: 'ti-check',
      title: 'All caught up',
      sub: 'No active notifications. Switch tabs to see dismissed history.',
    },
    'no-dismissed': {
      icon: 'ti-archive',
      title: 'Nothing dismissed',
      sub: "Things you've dismissed will land here.",
    },
    'no-match': {
      icon: 'ti-search-off',
      title: 'No matches',
      sub: 'Try a different search term.',
    },
  }
  const c = COPY[kind] ?? COPY['no-history']
  return (
    <div className="bg-surface border border-border rounded-xl p-10 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-surface-2 text-text-2 mb-3">
        <i className={`ti ${c.icon} text-2xl`} />
      </div>
      <div className="text-sm font-medium">{c.title}</div>
      <div className="text-xs text-text-2 mt-1">{c.sub}</div>
    </div>
  )
}

function formatAbsolute(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
