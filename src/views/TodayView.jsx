import { useMemo, useState } from 'react'
import { useTasks, usePeople } from '../lib/queries'
import {
  addDays,
  isOverdue,
  isToday,
  parseDate,
  startOfToday,
} from '../lib/dates'
import { statusPill } from '../lib/colors'
import TaskRow from '../components/TaskRow'
import Avatar from '../components/Avatar'
import NudgesBanner from '../components/NudgesBanner'
import EmptyWorkspaceGuide from '../components/EmptyWorkspaceGuide'
import PicWeekModal from '../components/PicWeekModal'
import Skeleton from '../components/Skeleton'

// Three-zone informational dashboard. Designed to feel less like an
// inbox and more like a control room: at-a-glance state, then drill-in
// where it matters.
//
// Layout:
//   1. Hero band: date + headline counts + 7-day load heatmap
//   2. Three cards: Needs attention / In progress / Ongoing initiatives
//   3. Smart insights banner (heuristic, not LLM — fast + cheap)
//   4. This week by PIC: chips showing each PIC's load for the week
//
// `onSwitchView` lets cards drill into other views (e.g. clicking an
// insight pre-filters the Grid).
export default function TodayView({ onOpenTask, onSwitchView, onOpenSettings }) {
  const { data: tasks = [], isLoading } = useTasks()
  const { data: people = [] } = usePeople()

  // PIC chip → quick peek modal (item #5 of iOS polish pass)
  const [pickedPic, setPickedPic] = useState(null)

  const today = startOfToday()
  const todayIso = formatIso(today)

  // ----- Categorisation -----
  const buckets = useMemo(() => {
    const active = tasks.filter((t) => t.status !== 'Done')
    return {
      needsAttention: active
        .filter(
          (t) =>
            t.status !== 'Ongoing' &&
            ((t.due_date && isOverdue(t.due_date)) || isToday(t.due_date)),
        )
        .sort((a, b) => priorityRank(a) - priorityRank(b) || dueRank(a, b)),
      inProgress: active
        .filter((t) => t.status === 'In progress')
        .sort((a, b) => dueRank(a, b)),
      ongoing: active
        .filter((t) => t.status === 'Ongoing')
        .sort((a, b) => priorityRank(a) - priorityRank(b)),
    }
  }, [tasks])

  // ----- Heatmap -----
  // Next 7 days starting today: count active (non-Done) tasks due each day
  const heatmap = useMemo(() => {
    const cells = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i)
      const iso = formatIso(d)
      const count = tasks.filter(
        (t) => t.status !== 'Done' && t.due_date === iso,
      ).length
      cells.push({ date: d, iso, count })
    }
    return cells
  }, [tasks, todayIso]) // eslint-disable-line react-hooks/exhaustive-deps

  const maxHeat = Math.max(1, ...heatmap.map((c) => c.count))

  // ----- Smart insights (heuristic) -----
  const insights = useMemo(() => {
    const active = tasks.filter((t) => t.status !== 'Done')
    const thirtyDaysAgo = addDays(today, -30)

    const stale = active.filter((t) => {
      const updated = parseDate(t.updated_at?.slice(0, 10) ?? t.created_at?.slice(0, 10))
      return updated && updated < thirtyDaysAgo
    })

    const highPriOverdue = active.filter(
      (t) => t.priority === 'High' && t.due_date && isOverdue(t.due_date),
    )

    const noDueDate = active.filter(
      (t) => !t.due_date && t.status !== 'Ongoing',
    )

    const unassigned = active.filter(
      (t) => !t.pic_id && t.status !== 'Ongoing',
    )

    const items = []
    if (highPriOverdue.length > 0) {
      items.push({
        key: 'high-overdue',
        icon: 'ti-flame',
        tone: 'danger',
        text: `${highPriOverdue.length} high-priority task${highPriOverdue.length === 1 ? '' : 's'} overdue`,
      })
    }
    if (stale.length > 0) {
      items.push({
        key: 'stale',
        icon: 'ti-clock-pause',
        tone: 'warning',
        text: `${stale.length} task${stale.length === 1 ? '' : 's'} unchanged for 30+ days`,
      })
    }
    if (unassigned.length > 0) {
      items.push({
        key: 'unassigned',
        icon: 'ti-user-question',
        tone: 'warning',
        text: `${unassigned.length} task${unassigned.length === 1 ? '' : 's'} without a PIC`,
      })
    }
    if (noDueDate.length > 0) {
      items.push({
        key: 'no-due',
        icon: 'ti-calendar-question',
        tone: 'muted',
        text: `${noDueDate.length} task${noDueDate.length === 1 ? '' : 's'} with no due date`,
      })
    }
    return items
  }, [tasks, today])

  // ----- This week by PIC -----
  const weekByPic = useMemo(() => {
    const weekEnd = addDays(today, 7)
    const counts = new Map()
    for (const t of tasks) {
      if (t.status === 'Done' || t.status === 'Ongoing') continue
      if (!t.pic_id) continue
      if (!t.due_date) continue
      const d = parseDate(t.due_date)
      if (!d) continue
      // include overdue + this week
      if (d > weekEnd) continue
      counts.set(t.pic_id, (counts.get(t.pic_id) ?? 0) + 1)
    }
    return people
      .map((p) => ({ person: p, count: counts.get(p.id) ?? 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [tasks, people, today])

  const totalActive = tasks.filter((t) => t.status !== 'Done').length

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-2">
          <Skeleton.Block className="h-6 w-32 rounded" />
          <Skeleton.Block className="h-3 w-48 rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-xl p-4"
            >
              <Skeleton.Block className="h-4 w-24 rounded mb-3" />
              <Skeleton.TaskRows rows={3} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Fresh-workspace empty state: zero people OR zero tasks → render
  // the setup guide instead of empty cards. Keeps the NudgesBanner
  // (it can suggest "Add a person" via a future nudge kind), but
  // hides the three-card grid which would just say "Nothing".
  if (people.length === 0 || tasks.length === 0) {
    return (
      <div className="space-y-3">
        <NudgesBanner onOpenTask={onOpenTask} />
        <EmptyWorkspaceGuide
          hasPeople={people.length > 0}
          hasTasks={tasks.length > 0}
          onOpenSettings={onOpenSettings}
          onFocusQuickEntry={() => {
            const el = document.getElementById('quick-entry-input')
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' })
              el.focus()
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* AI nudges — sits above the hero so anything urgent lands first */}
      <NudgesBanner onOpenTask={onOpenTask} />

      {/* Hero band */}
      <HeroBand
        today={today}
        counts={buckets}
        heatmap={heatmap}
        maxHeat={maxHeat}
        totalActive={totalActive}
      />

      {/* Three-zone main cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ZoneCard
          title="Needs attention"
          subtitle="Overdue + due today, by priority"
          icon="ti-alert-circle"
          tone="danger"
          tasks={buckets.needsAttention}
          onOpenTask={onOpenTask}
          emptyMsg="You're caught up. Nothing overdue, nothing due today."
        />
        <ZoneCard
          title="In progress"
          subtitle="Already moving"
          icon="ti-progress"
          tone="info"
          tasks={buckets.inProgress}
          onOpenTask={onOpenTask}
          emptyMsg="Nothing actively in progress."
          onMore={
            onSwitchView ? () => onSwitchView('grid', { status: 'In progress' }) : null
          }
        />
        <ZoneCard
          title="Ongoing initiatives"
          subtitle="Perpetual / recurring"
          icon="ti-infinity"
          tone="muted"
          tasks={buckets.ongoing}
          onOpenTask={onOpenTask}
          emptyMsg="No standing initiatives yet."
          onMore={
            onSwitchView ? () => onSwitchView('grid', { status: 'Ongoing' }) : null
          }
        />
      </div>

      {/* Smart insights — each chip drills into Grid with the right
          pre-filter applied via the existing onSwitchView signal. */}
      {insights.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-2.5 sm:p-3">
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-text-3 mb-1.5 sm:mb-2 px-1">
            Smart insights
          </div>
          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            {insights.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => {
                  const hint = insightToFilter(i.key)
                  if (hint && onSwitchView) onSwitchView('grid', hint)
                }}
                className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-md text-[11px] sm:text-xs border active:scale-95 transition-transform cursor-pointer ${insightTone(i.tone)}`}
              >
                <i className={`ti ${i.icon} text-sm flex-shrink-0`} />
                {i.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* This week by PIC — chip click opens a quick peek modal.
          On phone the chip strip is horizontal-scroll so 10+ people
          don't eat 4 rows of vertical space. */}
      {weekByPic.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-3 sm:p-4">
          <div className="flex items-baseline justify-between mb-2 sm:mb-3 gap-2">
            <h2 className="text-sm font-medium">This week by PIC</h2>
            <span className="text-[10px] sm:text-[11px] text-text-3 text-right">
              <span className="hidden sm:inline">
                {weekByPic.reduce((sum, r) => sum + r.count, 0)} tasks due in the next 7 days
              </span>
              <span className="sm:hidden">
                {weekByPic.reduce((sum, r) => sum + r.count, 0)} this week
              </span>
            </span>
          </div>
          <div className="flex sm:flex-wrap gap-1 sm:gap-1.5 -mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {weekByPic.map(({ person, count }) => (
              <button
                key={person.id}
                onClick={() => setPickedPic(person)}
                className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full text-[11px] sm:text-xs border border-border hover:border-border-strong hover:bg-surface-2 active:bg-surface-2 text-text-2 hover:text-text flex-shrink-0 whitespace-nowrap transition-colors"
              >
                <Avatar person={person} size="sm" />
                {person.name.split(' ')[0]}
                <span className="text-text-3 font-medium">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {pickedPic && (
        <PicWeekModal
          person={pickedPic}
          tasks={tasks}
          onOpenTask={(id) => {
            setPickedPic(null)
            onOpenTask(id)
          }}
          onSeeAll={() => {
            setPickedPic(null)
            onSwitchView?.('pic', { picId: pickedPic.id })
          }}
          onClose={() => setPickedPic(null)}
        />
      )}
    </div>
  )
}

// ============================================================
// Hero
// ============================================================

function HeroBand({ today, counts, heatmap, maxHeat, totalActive }) {
  const dayName = today.toLocaleDateString(undefined, { weekday: 'long' })
  const dateLine = today.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })

  const attentionCount = counts.needsAttention.length
  const inProgressCount = counts.inProgress.length

  return (
    <div className="bg-surface border border-border rounded-xl p-3 sm:p-5">
      <div className="flex items-start justify-between gap-3 sm:gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-text-3 font-medium">
            {dayName}
          </div>
          <div className="text-xl sm:text-2xl font-medium tracking-tight mt-0.5">
            {dateLine}
          </div>
          <div className="text-[11px] sm:text-xs text-text-2 mt-1 sm:mt-1.5 flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 gap-y-0.5">
            <span>{totalActive} active</span>
            {attentionCount > 0 && (
              <>
                <span className="text-text-3">·</span>
                <span className="text-danger-text font-medium">
                  {attentionCount} need{attentionCount === 1 ? 's' : ''} attention
                </span>
              </>
            )}
            {inProgressCount > 0 && (
              <>
                <span className="text-text-3">·</span>
                <span>{inProgressCount} in progress</span>
              </>
            )}
          </div>
        </div>

        {/* Heatmap — narrower cells on phone (24×32) so all 7 days fit
            next to the date on a 360px viewport without wrapping. */}
        <div className="flex-shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-text-3 mb-1 sm:mb-1.5 text-right">
            Next 7 days
          </div>
          <div className="flex items-end gap-0.5 sm:gap-1">
            {heatmap.map((cell, idx) => (
              <HeatCell
                key={cell.iso}
                cell={cell}
                maxHeat={maxHeat}
                isToday={idx === 0}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function HeatCell({ cell, maxHeat, isToday }) {
  const ratio = cell.count === 0 ? 0 : Math.min(1, cell.count / maxHeat)
  // Tailwind doesn't do dynamic opacity classes — inline style is fine
  // here. Tint colour comes from --heatmap-tint-rgb which swaps to a
  // lighter shade in dark mode so density stays readable on dark bg.
  const bgOpacity = ratio === 0 ? 0 : 0.15 + ratio * 0.65
  const dow = cell.date.toLocaleDateString(undefined, { weekday: 'narrow' })
  return (
    <div
      title={`${cell.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} — ${cell.count} task${cell.count === 1 ? '' : 's'}`}
      className={`w-6 h-9 sm:w-7 sm:h-10 rounded text-[10px] flex flex-col items-center justify-end p-0.5 border ${
        isToday ? 'border-info' : 'border-border'
      }`}
      style={{
        backgroundColor:
          bgOpacity === 0
            ? 'transparent'
            : `rgba(var(--heatmap-tint-rgb), ${bgOpacity})`,
      }}
    >
      <div className="text-text-3 leading-none">{dow}</div>
      <div className={`leading-none mt-1 ${cell.count > 0 ? 'font-medium' : 'text-text-3'}`}>
        {cell.count > 0 ? cell.count : '·'}
      </div>
    </div>
  )
}

// ============================================================
// Zone card (one of the three)
// ============================================================

function ZoneCard({
  title,
  subtitle,
  icon,
  tone,
  tasks,
  onOpenTask,
  emptyMsg,
  onMore,
}) {
  const MAX = 5
  const visible = tasks.slice(0, MAX)
  const remaining = tasks.length - visible.length

  return (
    <div className="relative bg-surface border border-border rounded-xl overflow-hidden flex flex-col tickd-card-hover">
      {/* Tone accent stripe — colour-codes the card so the three
          zones are scannable at a glance, like the colour-bar pattern
          Trello/Linear use on board columns. */}
      <span
        aria-hidden="true"
        className={`absolute top-0 left-0 right-0 h-1 ${accentBg(tone)}`}
      />
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <IconSquare icon={icon} tone={tone} />
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {tasks.length > 0 && (
            <span className="text-[11px] text-text-3 font-medium">· {tasks.length}</span>
          )}
        </div>
        <div className="text-[11px] text-text-3 mt-0.5 sm:mt-1 ml-9">{subtitle}</div>
      </div>
      {tasks.length === 0 ? (
        <div className="flex-1 px-3 sm:px-4 py-6 sm:py-8 text-center text-xs text-text-3">
          {emptyMsg}
        </div>
      ) : (
        <>
          <div className="px-3 sm:px-4 flex-1">
            {visible.map((t) => (
              <ZoneRow key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
            ))}
          </div>
          {(remaining > 0 || onMore) && (
            <button
              onClick={onMore ?? undefined}
              disabled={!onMore}
              className="border-t border-border px-3 sm:px-4 py-2 text-[11px] text-text-3 hover:text-text hover:bg-surface-2 active:bg-surface-2 transition-colors disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-text-3"
            >
              {remaining > 0
                ? `+${remaining} more${onMore ? ' →' : ''}`
                : 'See all →'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// Compact row used inside ZoneCards. Smaller than the default TaskRow
// so each card stays glanceable.
function ZoneRow({ task, onClick }) {
  const overdue = isOverdue(task.due_date) && task.status !== 'Done'
  const displayStatus = overdue ? 'Overdue' : task.status
  return (
    <div
      onClick={onClick}
      className="py-2 sm:py-2.5 border-b border-border last:border-b-0 cursor-pointer hover:bg-surface-2 active:bg-surface-2 -mx-3 sm:-mx-4 px-3 sm:px-4 transition-colors"
    >
      <div className="text-sm line-clamp-2">{task.title}</div>
      <div className="text-[11px] text-text-2 flex items-center gap-1.5 mt-1 flex-wrap">
        {task.pic ? (
          <Avatar person={task.pic} size="sm" showName />
        ) : (
          <Avatar person={null} size="sm" showName />
        )}
        {task.due_date && (
          <span className={overdue ? 'text-danger-text font-medium' : 'text-text-3'}>
            {formatShortDate(task.due_date)}
          </span>
        )}
        <span className={`text-[10px] px-1.5 py-px rounded-full font-medium ${statusPill(displayStatus)}`}>
          {displayStatus}
        </span>
      </div>
    </div>
  )
}

// ============================================================
// Helpers
// ============================================================

function priorityRank(t) {
  return { High: 0, Medium: 1, Low: 2 }[t.priority] ?? 99
}

function dueRank(a, b) {
  const ad = a.due_date ? parseDate(a.due_date).getTime() : Infinity
  const bd = b.due_date ? parseDate(b.due_date).getTime() : Infinity
  return ad - bd
}

function formatIso(d) {
  // local YYYY-MM-DD (matches how tasks.due_date is stored)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatShortDate(iso) {
  const d = parseDate(iso)
  if (!d) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function insightTone(tone) {
  if (tone === 'danger') return 'border-danger-bg bg-danger-bg/30 text-danger-text'
  if (tone === 'warning') return 'border-warning-bg bg-warning-bg/40 text-warning-text'
  return 'border-border text-text-2 bg-surface-2/40'
}

// Map a smart-insight chip key → a filter hint understood by Home's
// `setGridFilterSignal` (which writes the URL params Grid reads from).
// We keep this to fields the URL filter contract already supports:
// picId / deptId / status / priority / due / sort.
//
// `unassigned` has no first-class filter today, so we fall back to
// sorting so unassigned rows clump together at the top.
function insightToFilter(key) {
  switch (key) {
    case 'high-overdue':
      return { priority: 'High', due: 'overdue' }
    case 'stale':
      return { sort: 'updated' }
    case 'unassigned':
      return { sort: 'pic' }
    case 'no-due':
      return { due: 'none' }
    default:
      return null
  }
}

// iOS-Reminders-style colored square: 28px tile, white icon on a
// brand-toned solid background. Picks a sensible color per tone.
function IconSquare({ icon, tone }) {
  const bg = iconSquareBg(tone)
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${bg} flex-shrink-0`}
    >
      <i className={`ti ${icon} text-white text-base`} />
    </span>
  )
}

function iconSquareBg(tone) {
  switch (tone) {
    case 'danger':
      return 'bg-[#FF3B30]' // iOS systemRed
    case 'info':
      return 'bg-info'
    case 'success':
      return 'bg-[#34C759]' // iOS systemGreen
    case 'warning':
      return 'bg-[#FF9500]' // iOS systemOrange
    case 'muted':
    default:
      return 'bg-[#8E8E93]' // iOS systemGray
  }
}

// Accent stripe colour for the top-of-card bar. Slightly more muted
// than the IconSquare so it reads as a tint, not a banner.
function accentBg(tone) {
  switch (tone) {
    case 'danger':
      return 'bg-red-500/80'
    case 'info':
      return 'bg-blue-500/80'
    case 'success':
      return 'bg-emerald-500/80'
    case 'warning':
      return 'bg-orange-500/80'
    case 'muted':
    default:
      return 'bg-text-3/40'
  }
}
