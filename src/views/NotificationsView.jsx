import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  useAllNudges,
  useDismissInboxEvent,
  useDismissInboxEventsBulk,
  useDismissMention,
  useDismissMentionsBulk,
  useDismissNudge,
  useInboxEvents,
  useMyMentions,
  usePeople,
  useRestoreInboxEvent,
  useRestoreMention,
  useRestoreNudge,
} from '../lib/queries'
import { formatTimeAgo } from '../lib/dates'

// localStorage key for the "last time the user opened the mentions
// tab" timestamp. Used to compute the unseen-mention count badge.
const MENTIONS_LAST_SEEN_KEY = 'tickd:mentions-last-seen'

// Unified Inbox — three lenses on "what needs my attention":
//   1. Assigned — tasks where I'm the PIC (the day-to-day workload)
//   2. Mentions — journal entries / comments that tagged me
//   3. Nudges   — AI-generated suggestions ("X is overdue", etc.)
//
// `embedded` mode: when the inbox is rendered as a regular view
// inside Home's main content area (rather than a full-screen
// overlay), we drop the back button + the page-tall min-height +
// the sticky bg backdrop. Sidebar still owns navigation in that case.
export default function NotificationsView({ onBack, onOpenTask, embedded = false }) {
  const { user } = useAuth()
  const { data: people = [] } = usePeople()
  const me = useMemo(
    () => people.find((p) => p.user_id === user?.id) ?? null,
    [people, user?.id],
  )
  const { data: nudges = [], isLoading } = useAllNudges()
  const { data: mentions = [], isLoading: mentionsLoading } = useMyMentions(me?.id)
  const { data: inboxEvents = [], isLoading: eventsLoading } = useInboxEvents()

  // Mutations — nudges, mentions, and the new inbox-events stream.
  const dismiss = useDismissNudge()
  const restore = useRestoreNudge()
  const dismissMentionMut = useDismissMention(me?.id)
  const restoreMentionMut = useRestoreMention(me?.id)
  const dismissMentionsBulk = useDismissMentionsBulk(me?.id)
  const dismissEventMut = useDismissInboxEvent()
  const restoreEventMut = useRestoreInboxEvent()
  const dismissEventsBulk = useDismissInboxEventsBulk()
  // Primary tab. Defaults to 'updates' — the event-stream view of
  // what just happened to you (assignments, status changes, overdue,
  // etc.). Effect below auto-jumps to 'mentions' if there are unseen
  // mentions newer than the user's last visit.
  const [tab, setTab] = useState('updates')
  // Updates sub-filter — same Active/All/Dismissed pattern used on
  // the Mentions and Nudges tabs for consistency.
  const [updatesFilter, setUpdatesFilter] = useState('active')
  // After the mentions query loads, switch tab to 'mentions' if there
  // are unseen ones. Only on initial mount so we don't fight the
  // user's manual tab choice.
  const autoSwitchedRef = useRef(false)
  useEffect(() => {
    if (autoSwitchedRef.current) return
    if (mentionsLoading) return
    if (mentions.length === 0) {
      autoSwitchedRef.current = true
      return
    }
    let lastSeenAt = 0
    try {
      const raw = localStorage.getItem(MENTIONS_LAST_SEEN_KEY)
      if (raw) lastSeenAt = new Date(raw).getTime() || 0
    } catch {
      /* ignore */
    }
    const hasUnseen = mentions.some(
      (m) => new Date(m.created_at).getTime() > lastSeenAt,
    )
    if (hasUnseen) setTab('mentions')
    autoSwitchedRef.current = true
  }, [mentions, mentionsLoading])
  const [filter, setFilter] = useState('all') // all | active | dismissed (nudges sub-filter)
  // Mentions tab uses its own filter dim — 'active' is the default
  // (matches what users almost always want), 'dismissed' surfaces
  // their cleared history, 'all' shows everything in one list.
  const [mentionFilter, setMentionFilter] = useState('active')
  const [search, setSearch] = useState('')

  // Active (undismissed) mention count — drives the tab badge so the
  // number reflects the real backlog instead of a session-scoped
  // "newer than your last visit" heuristic. Users explicitly dismiss
  // mentions when they're done with them, so this stays accurate.
  const activeMentionCount = useMemo(
    () => mentions.filter((m) => !m.dismissed).length,
    [mentions],
  )
  const dismissedMentionCount = mentions.length - activeMentionCount

  // Visible mentions per the user's filter selection. Active is the
  // default — "what still needs me" — but we keep All / Dismissed so
  // history is browsable.
  const visibleMentions = useMemo(() => {
    if (mentionFilter === 'active') return mentions.filter((m) => !m.dismissed)
    if (mentionFilter === 'dismissed') return mentions.filter((m) => m.dismissed)
    return mentions
  }, [mentions, mentionFilter])

  // Event-stream counts + visible slice. Same shape as the mentions
  // derived state so the UI patterns stay symmetric.
  const activeEventCount = useMemo(
    () => inboxEvents.filter((e) => !e.dismissed).length,
    [inboxEvents],
  )
  const dismissedEventCount = inboxEvents.length - activeEventCount
  const visibleEvents = useMemo(() => {
    if (updatesFilter === 'active')
      return inboxEvents.filter((e) => !e.dismissed)
    if (updatesFilter === 'dismissed')
      return inboxEvents.filter((e) => e.dismissed)
    return inboxEvents
  }, [inboxEvents, updatesFilter])

  // Mark mentions as seen the moment the user clicks into the tab.
  useEffect(() => {
    if (tab !== 'mentions') return
    try {
      localStorage.setItem(MENTIONS_LAST_SEEN_KEY, new Date().toISOString())
    } catch {
      /* ignore — localStorage disabled */
    }
  }, [tab])

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
    <div className={embedded ? 'text-text font-sans' : 'min-h-screen bg-bg text-text font-sans'}>
      <header
        className={
          embedded
            ? 'mb-3'
            : 'sticky top-0 z-30 bg-bg/85 backdrop-blur-xl border-b border-border/60'
        }
        style={embedded ? undefined : { paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div
          className={
            embedded
              ? ''
              : 'mx-auto max-w-3xl px-3 sm:px-6 py-2 sm:py-3'
          }
        >
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            {!embedded && (
              <button
                onClick={onBack}
                className="w-9 h-9 rounded-full inline-flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors flex-shrink-0"
                aria-label="Back"
              >
                <i className="ti ti-arrow-left text-base" />
              </button>
            )}
            <i className="ti ti-inbox text-info text-lg flex-shrink-0" />
            <h1 className="text-base sm:text-xl font-medium tracking-tight flex-1 min-w-0">
              Inbox
            </h1>
          </div>

          {/* Primary tabs: Assigned (PIC=me) / Mentions (human) / Nudges (AI). */}
          <div className="inline-flex items-center gap-0.5 p-0.5 bg-surface-2 rounded-md mb-2 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <PrimaryTab
              active={tab === 'updates'}
              icon="ti-bell"
              onClick={() => setTab('updates')}
            >
              Updates
              {activeEventCount > 0 && tab !== 'updates' ? (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold">
                  {activeEventCount > 9 ? '9+' : activeEventCount}
                </span>
              ) : (
                <span className="text-[10px] text-text-3 ml-1">
                  {inboxEvents.length}
                </span>
              )}
            </PrimaryTab>
            <PrimaryTab
              active={tab === 'mentions'}
              icon="ti-at"
              onClick={() => setTab('mentions')}
            >
              Mentions
              {activeMentionCount > 0 ? (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold">
                  {activeMentionCount > 9 ? '9+' : activeMentionCount}
                </span>
              ) : (
                <span className="text-[10px] text-text-3 ml-1">
                  {mentions.length}
                </span>
              )}
            </PrimaryTab>
            <PrimaryTab
              active={tab === 'nudges'}
              icon="ti-bulb"
              onClick={() => setTab('nudges')}
            >
              Nudges
              <span className="text-[10px] text-text-3 ml-1">{nudges.length}</span>
            </PrimaryTab>
          </div>

          {/* Sub-controls — different content per primary tab. */}
          {tab === 'updates' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="inline-flex items-center gap-0.5 p-0.5 bg-surface-2 rounded-md">
                  <FilterTab
                    active={updatesFilter === 'active'}
                    count={activeEventCount}
                    onClick={() => setUpdatesFilter('active')}
                  >
                    Active
                  </FilterTab>
                  <FilterTab
                    active={updatesFilter === 'all'}
                    count={inboxEvents.length}
                    onClick={() => setUpdatesFilter('all')}
                  >
                    All
                  </FilterTab>
                  <FilterTab
                    active={updatesFilter === 'dismissed'}
                    count={dismissedEventCount}
                    onClick={() => setUpdatesFilter('dismissed')}
                  >
                    Dismissed
                  </FilterTab>
                </div>
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search updates…"
                className="flex-1 min-w-[140px] text-xs px-3 py-1.5 rounded-md border border-border bg-surface outline-none focus:border-info"
              />
              {activeEventCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const ids = inboxEvents
                      .filter((e) => !e.dismissed)
                      .map((e) => e.id)
                    dismissEventsBulk.mutate(ids)
                  }}
                  disabled={dismissEventsBulk.isPending}
                  className="text-[11px] px-2.5 py-1.5 rounded-md border border-border bg-surface text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                  title="Mark every active update as read"
                >
                  <i className="ti ti-checks text-xs" />
                  Mark all read
                </button>
              )}
            </div>
          ) : tab === 'nudges' ? (
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
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="inline-flex items-center gap-0.5 p-0.5 bg-surface-2 rounded-md">
                  <FilterTab
                    active={mentionFilter === 'active'}
                    count={activeMentionCount}
                    onClick={() => setMentionFilter('active')}
                  >
                    Active
                  </FilterTab>
                  <FilterTab
                    active={mentionFilter === 'all'}
                    count={mentions.length}
                    onClick={() => setMentionFilter('all')}
                  >
                    All
                  </FilterTab>
                  <FilterTab
                    active={mentionFilter === 'dismissed'}
                    count={dismissedMentionCount}
                    onClick={() => setMentionFilter('dismissed')}
                  >
                    Dismissed
                  </FilterTab>
                </div>
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search comments…"
                className="flex-1 min-w-[140px] text-xs px-3 py-1.5 rounded-md border border-border bg-surface outline-none focus:border-info"
              />
              {/* Mark-all-read clears every currently-active mention in
                  one upsert. Hidden when there's nothing to clear so the
                  bar stays calm at inbox-zero. */}
              {activeMentionCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const ids = mentions
                      .filter((m) => !m.dismissed)
                      .map((m) => m.id)
                    dismissMentionsBulk.mutate(ids)
                  }}
                  disabled={dismissMentionsBulk.isPending}
                  className="text-[11px] px-2.5 py-1.5 rounded-md border border-border bg-surface text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                  title="Mark every active mention as read"
                >
                  <i className="ti ti-checks text-xs" />
                  Mark all read
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className={embedded ? '' : 'mx-auto max-w-3xl px-3 sm:px-6 py-4 sm:py-6'}>
        {tab === 'updates' ? (
          <UpdatesList
            events={visibleEvents}
            filter={updatesFilter}
            search={search}
            loading={eventsLoading}
            hasLinkedPerson={!!me}
            onOpenTask={onOpenTask}
            onDismiss={(id) => dismissEventMut.mutate(id)}
            onRestore={(id) => restoreEventMut.mutate(id)}
          />
        ) : tab === 'mentions' ? (
          <MentionsList
            mentions={visibleMentions}
            filter={mentionFilter}
            search={search}
            loading={mentionsLoading}
            hasLinkedPerson={!!me}
            onOpenTask={onOpenTask}
            onDismiss={(id) => dismissMentionMut.mutate(id)}
            onRestore={(id) => restoreMentionMut.mutate(id)}
          />
        ) : isLoading ? (
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

// Primary tab control — pair sits at the top of the header.
function PrimaryTab({ active, icon, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded inline-flex items-center gap-1.5 active:scale-95 transition-transform ${
        active
          ? 'bg-surface text-text font-semibold shadow-sm'
          : 'text-text-2 hover:text-text'
      }`}
    >
      <i className={`ti ${icon} text-sm`} />
      {children}
    </button>
  )
}

// Mentions inbox body. Renders entries that tagged the current user
// across the workspace. Each row deep-links into the source task; a
// per-row X / restore button toggles the user-scoped dismissal state
// so the row drops out of the Active filter without affecting the
// underlying comment or any other recipient.
function MentionsList({
  mentions,
  filter,
  search,
  loading,
  hasLinkedPerson,
  onOpenTask,
  onDismiss,
  onRestore,
}) {
  const filtered = useMemo(() => {
    if (!search) return mentions
    const q = search.trim().toLowerCase()
    return mentions.filter(
      (m) =>
        m.body?.toLowerCase().includes(q) ||
        m.task?.title?.toLowerCase().includes(q) ||
        m.author_name?.toLowerCase().includes(q),
    )
  }, [mentions, search])

  if (!hasLinkedPerson) {
    return (
      <div className="bg-surface border border-border rounded-xl p-10 text-center text-xs text-text-3">
        Your account isn&rsquo;t linked to a workspace member yet — no one can
        @mention you. Ask an admin to link you under Settings → People.
      </div>
    )
  }
  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-10 text-center text-xs text-text-3">
        Loading mentions…
      </div>
    )
  }
  if (filtered.length === 0) {
    // Empty-state copy follows the filter: "all caught up" reads
    // differently than "nothing has been dismissed".
    let copy
    if (search) {
      copy = 'No mentions match your search.'
    } else if (filter === 'dismissed') {
      copy = "You haven't dismissed any mentions yet."
    } else if (filter === 'active') {
      copy = 'All caught up — no active mentions waiting on you.'
    } else {
      copy =
        'No one has @mentioned you yet. When a teammate tags you in a comment, it lands here.'
    }
    return (
      <div className="bg-surface border border-border rounded-xl p-10 text-center text-xs text-text-3">
        {copy}
      </div>
    )
  }
  return (
    <ul className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border">
      {filtered.map((m) => (
        <MentionRow
          key={m.id}
          mention={m}
          onOpenTask={onOpenTask}
          onDismiss={() => onDismiss(m.id)}
          onRestore={() => onRestore(m.id)}
        />
      ))}
    </ul>
  )
}

function MentionRow({ mention, onOpenTask, onDismiss, onRestore }) {
  const taskTitle = mention.task?.title ?? '(deleted task)'
  const author = mention.author_name ?? 'Someone'
  const taskId = mention.task?.id
  const isDismissed = !!mention.dismissed
  function handleClick() {
    if (taskId && onOpenTask) onOpenTask(taskId)
  }
  return (
    <li>
      <div
        onClick={handleClick}
        className={`group flex items-start gap-3 px-3 sm:px-4 py-3 transition-colors ${
          taskId ? 'cursor-pointer hover:bg-surface-2 active:bg-surface-3' : ''
        } ${isDismissed ? 'opacity-70' : ''}`}
      >
        <span className="flex-shrink-0 w-7 h-7 rounded-lg inline-flex items-center justify-center bg-info-bg text-info-text">
          <i className="ti ti-at text-sm" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm leading-snug flex items-center gap-2 flex-wrap">
            <span>
              <span className="font-medium">{author}</span>
              <span className="text-text-2"> mentioned you in </span>
              <span className="font-medium">{taskTitle}</span>
            </span>
            {isDismissed && (
              <span className="text-[10px] px-1.5 py-px rounded bg-surface-3 text-text-3 uppercase tracking-wider">
                Dismissed
              </span>
            )}
          </div>
          <div className="text-[11px] sm:text-xs text-text-2 mt-1 leading-snug line-clamp-2">
            {mention.body}
          </div>
          <div className="text-[10px] text-text-3 mt-1 flex items-center gap-2 flex-wrap">
            <span>{formatTimeAgo(mention.created_at)}</span>
            {taskId && !isDismissed && (
              <span className="text-info inline-flex items-center gap-0.5">
                <i className="ti ti-arrow-right text-[10px]" />
                Open task
              </span>
            )}
          </div>
        </div>
        {/* Per-row dismiss/restore — mirrors the HistoryRow controls on
            the Nudges tab so the affordance feels familiar. */}
        {isDismissed ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRestore()
            }}
            aria-label="Restore mention"
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
            aria-label="Dismiss mention"
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

// ============================================================
// Updates (tab #1) — event-stream of dismissable inbox notifications
// ============================================================
// Each row is a discrete *event* — "Lara assigned you X", "Status
// changed on Y", "Task Z became overdue". Tap to open the task; X to
// dismiss (cross-device persisted in inbox_dismissals).

const EVENT_TONE = {
  high: 'bg-danger-bg text-danger-text',
  medium: 'bg-info-bg text-info-text',
  low: 'bg-surface-3 text-text-2',
}

function UpdatesList({
  events,
  filter,
  search,
  loading,
  hasLinkedPerson,
  onOpenTask,
  onDismiss,
  onRestore,
}) {
  const filtered = useMemo(() => {
    if (!search) return events
    const q = search.trim().toLowerCase()
    return events.filter(
      (e) =>
        e.taskTitle?.toLowerCase().includes(q) ||
        e.body?.toLowerCase().includes(q) ||
        e.actorName?.toLowerCase().includes(q),
    )
  }, [events, search])

  if (!hasLinkedPerson) {
    return (
      <div className="bg-surface border border-border rounded-xl p-10 text-center text-xs text-text-3">
        Your account isn&rsquo;t linked to a workspace member yet, so we
        can&rsquo;t track what&rsquo;s happening to your tasks. Ask an admin to
        link you under Settings → People.
      </div>
    )
  }
  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-10 text-center text-xs text-text-3">
        Loading…
      </div>
    )
  }
  if (filtered.length === 0) {
    // Filter-aware empty state — matches the Mentions tab pattern.
    let title
    let sub
    if (search) {
      title = 'No matches'
      sub = 'Try a different search term.'
    } else if (filter === 'dismissed') {
      title = 'Nothing dismissed'
      sub = "Things you've dismissed will land here."
    } else if (filter === 'active') {
      title = 'All caught up'
      sub =
        'No updates need your attention right now. New activity on your tasks shows up here.'
    } else {
      title = 'No updates yet'
      sub =
        'When teammates assign, comment on, or change status of your tasks, it shows here.'
    }
    return (
      <div className="bg-surface border border-border rounded-xl p-10 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-surface-2 text-text-2 mb-3">
          <i className="ti ti-checks text-2xl" />
        </div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-text-2 mt-1">{sub}</div>
      </div>
    )
  }
  return (
    <ul className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border">
      {filtered.map((e) => (
        <EventRow
          key={e.id}
          event={e}
          onOpenTask={onOpenTask}
          onDismiss={() => onDismiss(e.id)}
          onRestore={() => onRestore(e.id)}
        />
      ))}
    </ul>
  )
}

function EventRow({ event, onOpenTask, onDismiss, onRestore }) {
  const tone = EVENT_TONE[event.severity] || EVENT_TONE.medium
  const isDismissed = !!event.dismissed

  function handleClick() {
    if (event.taskId && onOpenTask) onOpenTask(event.taskId)
  }

  return (
    <li>
      <div
        onClick={handleClick}
        className={`group flex items-start gap-3 px-3 sm:px-4 py-3 transition-colors ${
          event.taskId
            ? 'cursor-pointer hover:bg-surface-2 active:bg-surface-3'
            : ''
        } ${isDismissed ? 'opacity-70' : ''}`}
      >
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-lg inline-flex items-center justify-center ${tone}`}
        >
          <i className={`ti ${event.icon || 'ti-bell'} text-sm`} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-snug flex items-center gap-2 flex-wrap">
            <span className={isDismissed ? 'text-text-2' : ''}>
              {event.taskTitle}
            </span>
            {isDismissed && (
              <span className="text-[10px] px-1.5 py-px rounded bg-surface-3 text-text-3 uppercase tracking-wider">
                Dismissed
              </span>
            )}
          </div>
          {event.body && (
            <div className="text-[11px] sm:text-xs text-text-2 mt-0.5 leading-snug">
              {event.body}
            </div>
          )}
          <div className="text-[10px] text-text-3 mt-1 flex items-center gap-2 flex-wrap">
            <span>{formatTimeAgo(event.occurredAt)}</span>
            {event.taskId && !isDismissed && (
              <span className="text-info inline-flex items-center gap-0.5">
                <i className="ti ti-arrow-right text-[10px]" />
                Open task
              </span>
            )}
          </div>
        </div>
        {/* Per-row dismiss/restore — same affordance as the Nudges and
            Mentions tabs so the inbox feels unified. */}
        {isDismissed ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRestore()
            }}
            aria-label="Restore update"
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
            aria-label="Dismiss update"
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
