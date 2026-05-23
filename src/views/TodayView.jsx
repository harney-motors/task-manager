import { useMemo } from 'react'
import { useTasks, usePeople } from '../lib/queries'
import {
  addDays,
  isOverdue,
  isToday,
  parseDate,
  startOfToday,
} from '../lib/dates'
import { picDot, picPill, statusPill } from '../lib/colors'
import TaskRow from '../components/TaskRow'
import NudgesBanner from '../components/NudgesBanner'

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
export default function TodayView({ onOpenTask, onSwitchView }) {
  const { data: tasks = [], isLoading } = useTasks()
  const { data: people = [] } = usePeople()

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
      <div className="bg-surface border border-border rounded-xl p-12 text-center text-xs text-text-3">
        Loading…
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

      {/* Smart insights */}
      {insights.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="text-[11px] uppercase tracking-wider text-text-3 mb-2 px-1">
            Smart insights
          </div>
          <div className="flex flex-wrap gap-1.5">
            {insights.map((i) => (
              <span
                key={i.key}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border ${insightTone(i.tone)}`}
              >
                <i className={`ti ${i.icon} text-sm`} />
                {i.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* This week by PIC */}
      {weekByPic.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium">This week by PIC</h2>
            <span className="text-[11px] text-text-3">
              {weekByPic.reduce((sum, r) => sum + r.count, 0)} tasks due in the
              next 7 days
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {weekByPic.map(({ person, count }) => (
              <button
                key={person.id}
                onClick={() => onSwitchView?.('pic', { picId: person.id })}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border border-border hover:border-border-strong hover:bg-surface-2 text-text-2 hover:text-text"
              >
                <span className={`w-2 h-2 rounded-full ${picDot(person.color)}`} />
                {person.name.split(' ')[0]}
                <span className="text-text-3">{count}</span>
              </button>
            ))}
          </div>
        </div>
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
    <div className="bg-surface border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-text-3 font-medium">
            {dayName}
          </div>
          <div className="text-2xl font-medium tracking-tight mt-0.5">
            {dateLine}
          </div>
          <div className="text-xs text-text-2 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
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

        {/* Heatmap */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-3 mb-1.5 text-right">
            Next 7 days
          </div>
          <div className="flex items-end gap-1">
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
      className={`w-7 h-10 rounded text-[10px] flex flex-col items-center justify-end p-0.5 border ${
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
    <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <i className={`ti ${icon} text-base ${zoneIconTone(tone)}`} />
          <h2 className="text-sm font-medium">{title}</h2>
          {tasks.length > 0 && (
            <span className="text-[11px] text-text-3">· {tasks.length}</span>
          )}
        </div>
        <div className="text-[11px] text-text-3 mt-0.5">{subtitle}</div>
      </div>
      {tasks.length === 0 ? (
        <div className="flex-1 px-4 py-8 text-center text-xs text-text-3">
          {emptyMsg}
        </div>
      ) : (
        <>
          <div className="px-4 flex-1">
            {visible.map((t) => (
              <ZoneRow key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
            ))}
          </div>
          {(remaining > 0 || onMore) && (
            <button
              onClick={onMore ?? undefined}
              disabled={!onMore}
              className="border-t border-border px-4 py-2 text-[11px] text-text-3 hover:text-text hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-text-3"
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
      className="py-2.5 border-b border-border last:border-b-0 cursor-pointer hover:bg-surface-2 -mx-4 px-4 transition-colors"
    >
      <div className="text-sm truncate">{task.title}</div>
      <div className="text-[11px] text-text-2 flex items-center gap-1.5 mt-1 flex-wrap">
        {task.pic ? (
          <span
            className={`px-1.5 py-px rounded text-[10px] font-medium ${picPill(task.pic.color)}`}
          >
            {task.pic.name.split(' ')[0]}
          </span>
        ) : (
          <span className="text-text-3 text-[10px]">Unassigned</span>
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

function zoneIconTone(tone) {
  if (tone === 'danger') return 'text-danger-text'
  if (tone === 'info') return 'text-info'
  return 'text-text-3'
}
