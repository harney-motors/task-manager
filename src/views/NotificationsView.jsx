import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  useAllNudges,
  useDismissNudge,
  useMyMentions,
  usePeople,
  useRestoreNudge,
  useTasks,
} from '../lib/queries'
import {
  formatShortDate,
  formatTimeAgo,
  isOverdue,
  isToday,
  parseDate,
  startOfToday,
} from '../lib/dates'
import { statusPill } from '../lib/colors'

// localStorage key for the "last time the user opened the mentions
// tab" timestamp. Used to compute the unseen-mention count badge.
const MENTIONS_LAST_SEEN_KEY = 'tickd:mentions-last-seen'

// Unified Inbox — three lenses on "what needs my attention":
//   1. Assigned — tasks where I'm the PIC (the day-to-day workload)
//   2. Mentions — journal entries / comments that tagged me
//   3. Nudges   — AI-generated suggestions ("X is overdue", etc.)
//
// Same sticky-header pattern as Settings/SuperAdmin/Pulse. `onBack`
// returns to wherever the user came from (Home's view state).
export default function NotificationsView({ onBack, onOpenTask }) {
  const { user } = useAuth()
  const { data: people = [] } = usePeople()
  const me = useMemo(
    () => people.find((p) => p.user_id === user?.id) ?? null,
    [people, user?.id],
  )
  const { data: tasks = [], isLoading: tasksLoading } = useTasks()
  const { data: nudges = [], isLoading } = useAllNudges()
  const { data: mentions = [], isLoading: mentionsLoading } = useMyMentions(me?.id)

  // ===== Assigned tab data =====
  // Tasks where the current user is the PIC. We expose three sub-views:
  // 'attention' (default, overdue + due today/soon), 'all' (every
  // active assignment), and 'watching' (PIC isn't me, but I'm a
  // watcher — useful for tracking things I asked someone else to do).
  const assignedAll = useMemo(() => {
    if (!me) return []
    return tasks.filter((t) => t.pic_id === me.id && t.status !== 'Done')
  }, [tasks, me])
  const watching = useMemo(() => {
    if (!me) return []
    return tasks.filter(
      (t) =>
        t.pic_id !== me.id &&
        t.status !== 'Done' &&
        (t.watchers ?? []).some((w) => w.id === me.id),
    )
  }, [tasks, me])
  const today = startOfToday()
  const assignedAttention = useMemo(() => {
    return assignedAll
      .filter((t) => {
        if (t.status === 'Ongoing') return false
        // Overdue or due today.
        if (t.due_date && (isOverdue(t.due_date) || isToday(t.due_date))) {
          return true
        }
        // Or recently assigned/created (last 7 days).
        const updated = new Date(t.updated_at).getTime()
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
        return updated > sevenDaysAgo
      })
      .sort(compareUrgency)
  }, [assignedAll])
  const dismiss = useDismissNudge()
  const restore = useRestoreNudge()
  // Primary tab. Defaults to 'assigned' — the day-to-day "what's on my
  // plate" lens. Effect below auto-jumps to 'mentions' if there are
  // unseen mentions newer than the user's last visit.
  const [tab, setTab] = useState('assigned')
  // Assigned sub-filter — needs-attention is the default for workloads
  // with dozens of open tasks. The user can flip to 'all' or 'watching'.
  const [assignedView, setAssignedView] = useState('attention')
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
  const [search, setSearch] = useState('')

  // Unseen-mentions count for the tab badge. Read on mount + when
  // mentions change. We snapshot last-seen BEFORE updating it so the
  // count survives the immediate "mark as seen" effect below.
  const unseenMentions = useMemo(() => {
    if (!mentions.length) return 0
    let lastSeenAt = 0
    try {
      const raw = localStorage.getItem(MENTIONS_LAST_SEEN_KEY)
      if (raw) lastSeenAt = new Date(raw).getTime() || 0
    } catch {
      /* ignore */
    }
    return mentions.filter(
      (m) => new Date(m.created_at).getTime() > lastSeenAt,
    ).length
  }, [mentions])

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
            <i className="ti ti-inbox text-info text-lg flex-shrink-0" />
            <h1 className="text-base sm:text-xl font-medium tracking-tight flex-1 min-w-0">
              Inbox
            </h1>
          </div>

          {/* Primary tabs: Assigned (PIC=me) / Mentions (human) / Nudges (AI). */}
          <div className="inline-flex items-center gap-0.5 p-0.5 bg-surface-2 rounded-md mb-2 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <PrimaryTab
              active={tab === 'assigned'}
              icon="ti-user-check"
              onClick={() => setTab('assigned')}
            >
              Assigned
              {assignedAttention.length > 0 && tab !== 'assigned' ? (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold">
                  {assignedAttention.length > 9 ? '9+' : assignedAttention.length}
                </span>
              ) : (
                <span className="text-[10px] text-text-3 ml-1">
                  {assignedAll.length}
                </span>
              )}
            </PrimaryTab>
            <PrimaryTab
              active={tab === 'mentions'}
              icon="ti-at"
              onClick={() => setTab('mentions')}
            >
              Mentions
              {unseenMentions > 0 ? (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold">
                  {unseenMentions > 9 ? '9+' : unseenMentions}
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
          {tab === 'assigned' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="inline-flex items-center gap-0.5 p-0.5 bg-surface-2 rounded-md">
                  <FilterTab
                    active={assignedView === 'attention'}
                    count={assignedAttention.length}
                    onClick={() => setAssignedView('attention')}
                  >
                    Needs attention
                  </FilterTab>
                  <FilterTab
                    active={assignedView === 'all'}
                    count={assignedAll.length}
                    onClick={() => setAssignedView('all')}
                  >
                    All active
                  </FilterTab>
                  <FilterTab
                    active={assignedView === 'watching'}
                    count={watching.length}
                    onClick={() => setAssignedView('watching')}
                  >
                    Watching
                  </FilterTab>
                </div>
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks…"
                className="flex-1 min-w-[140px] text-xs px-3 py-1.5 rounded-md border border-border bg-surface outline-none focus:border-info"
              />
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
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search comments…"
              className="w-full text-xs px-3 py-1.5 rounded-md border border-border bg-surface outline-none focus:border-info"
            />
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-3 sm:px-6 py-4 sm:py-6">
        {tab === 'assigned' ? (
          <AssignedList
            tasks={
              assignedView === 'attention'
                ? assignedAttention
                : assignedView === 'watching'
                  ? watching
                  : assignedAll
            }
            view={assignedView}
            search={search}
            loading={tasksLoading}
            hasLinkedPerson={!!me}
            onOpenTask={onOpenTask}
          />
        ) : tab === 'mentions' ? (
          <MentionsList
            mentions={mentions}
            search={search}
            loading={mentionsLoading}
            hasLinkedPerson={!!me}
            onOpenTask={onOpenTask}
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
// across the workspace. Each row is a link into the source task.
function MentionsList({ mentions, search, loading, hasLinkedPerson, onOpenTask }) {
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
    return (
      <div className="bg-surface border border-border rounded-xl p-10 text-center text-xs text-text-3">
        {search
          ? 'No mentions match your search.'
          : 'No one has @mentioned you yet. When a teammate tags you in a comment, it lands here.'}
      </div>
    )
  }
  return (
    <ul className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border">
      {filtered.map((m) => (
        <MentionRow key={m.id} mention={m} onOpenTask={onOpenTask} />
      ))}
    </ul>
  )
}

function MentionRow({ mention, onOpenTask }) {
  const taskTitle = mention.task?.title ?? '(deleted task)'
  const author = mention.author_name ?? 'Someone'
  const taskId = mention.task?.id
  function handleClick() {
    if (taskId && onOpenTask) onOpenTask(taskId)
  }
  return (
    <li>
      <div
        onClick={handleClick}
        className={`flex items-start gap-3 px-3 sm:px-4 py-3 transition-colors ${
          taskId ? 'cursor-pointer hover:bg-surface-2 active:bg-surface-3' : ''
        }`}
      >
        <span className="flex-shrink-0 w-7 h-7 rounded-lg inline-flex items-center justify-center bg-info-bg text-info-text">
          <i className="ti ti-at text-sm" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm leading-snug">
            <span className="font-medium">{author}</span>
            <span className="text-text-2"> mentioned you in </span>
            <span className="font-medium">{taskTitle}</span>
          </div>
          <div className="text-[11px] sm:text-xs text-text-2 mt-1 leading-snug line-clamp-2">
            {mention.body}
          </div>
          <div className="text-[10px] text-text-3 mt-1 flex items-center gap-2 flex-wrap">
            <span>{formatTimeAgo(mention.created_at)}</span>
            {taskId && (
              <span className="text-info inline-flex items-center gap-0.5">
                <i className="ti ti-arrow-right text-[10px]" />
                Open task
              </span>
            )}
          </div>
        </div>
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
// Assigned (tab #1) — tasks where PIC = me
// ============================================================

function AssignedList({
  tasks,
  view,
  search,
  loading,
  hasLinkedPerson,
  onOpenTask,
}) {
  const filtered = useMemo(() => {
    if (!search) return tasks
    const q = search.trim().toLowerCase()
    return tasks.filter(
      (t) =>
        t.title?.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q) ||
        (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
    )
  }, [tasks, search])

  if (!hasLinkedPerson) {
    return (
      <div className="bg-surface border border-border rounded-xl p-10 text-center text-xs text-text-3">
        Your account isn&rsquo;t linked to a workspace member yet, so no tasks
        are assigned to you. Ask an admin to link you under Settings →
        People.
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
    const copy =
      search
        ? 'No tasks match your search.'
        : view === 'attention'
          ? 'Inbox zero — nothing overdue or due today on your plate.'
          : view === 'watching'
            ? 'You aren’t watching any active tasks right now.'
            : 'You have no active assignments. Enjoy the quiet.'
    return (
      <div className="bg-surface border border-border rounded-xl p-10 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-surface-2 text-text-2 mb-3">
          <i className="ti ti-checks text-2xl" />
        </div>
        <div className="text-sm font-medium">All clear</div>
        <div className="text-xs text-text-2 mt-1">{copy}</div>
      </div>
    )
  }
  return (
    <ul className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border">
      {filtered.map((t) => (
        <AssignedRow key={t.id} task={t} onOpenTask={onOpenTask} />
      ))}
    </ul>
  )
}

function AssignedRow({ task, onOpenTask }) {
  const overdue = isOverdue(task.due_date) && task.status !== 'Done'
  const dueToday = isToday(task.due_date)
  const displayStatus = overdue ? 'Overdue' : task.status

  function handleClick() {
    if (onOpenTask) onOpenTask(task.id)
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className="w-full text-left flex items-start gap-3 px-3 sm:px-4 py-3 transition-colors hover:bg-surface-2 active:bg-surface-3"
      >
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-lg inline-flex items-center justify-center ${
            overdue
              ? 'bg-danger-bg text-danger-text'
              : dueToday
                ? 'bg-warning-bg text-warning-text'
                : 'bg-info-bg text-info-text'
          }`}
        >
          <i
            className={`ti ${
              overdue
                ? 'ti-alert-triangle'
                : dueToday
                  ? 'ti-clock'
                  : 'ti-circle-dot'
            } text-sm`}
          />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-snug line-clamp-2">
            {task.title}
          </div>
          <div className="text-[11px] text-text-3 mt-1 flex items-center gap-2 flex-wrap">
            <span
              className={`px-1.5 py-px rounded-full font-medium ${statusPill(displayStatus)}`}
            >
              {displayStatus}
            </span>
            {task.due_date && (
              <span className={overdue ? 'text-danger-text font-medium' : ''}>
                <i className="ti ti-calendar text-[10px] mr-0.5" />
                {formatShortDate(task.due_date)}
              </span>
            )}
            {task.priority && task.priority !== 'Medium' && (
              <span className="text-text-2">{task.priority}</span>
            )}
            {(task.subtasks?.length ?? 0) > 0 && (
              <span className="text-text-3 inline-flex items-center gap-0.5">
                <i className="ti ti-list-check text-[10px]" />
                {task.subtasks.filter((s) => s.done).length}/
                {task.subtasks.length}
              </span>
            )}
          </div>
        </div>
        <i className="ti ti-chevron-right text-text-3 text-base flex-shrink-0 mt-2" />
      </button>
    </li>
  )
}

// Sort comparator for the Assigned tab. Overdue first, then due-soon,
// then by priority. Tasks with no due date drift to the bottom.
function compareUrgency(a, b) {
  const ao = isOverdue(a.due_date) && a.status !== 'Done'
  const bo = isOverdue(b.due_date) && b.status !== 'Done'
  if (ao !== bo) return ao ? -1 : 1
  const ad = a.due_date ? parseDate(a.due_date).getTime() : Infinity
  const bd = b.due_date ? parseDate(b.due_date).getTime() : Infinity
  if (ad !== bd) return ad - bd
  const PR = { High: 0, Medium: 1, Low: 2 }
  return (PR[a.priority] ?? 99) - (PR[b.priority] ?? 99)
}
