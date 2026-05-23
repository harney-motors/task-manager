import { useMemo } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { usePeople, useTasks } from '../lib/queries'
import {
  addDays,
  isOverdue,
  isToday,
  parseDate,
  startOfToday,
} from '../lib/dates'
import { picPill, statusPill } from '../lib/colors'
import TaskRow from '../components/TaskRow'
import NudgesBanner from '../components/NudgesBanner'

// Simplified landing for users whose role in the active workspace is
// 'pic'. The PIC's task list is already restricted by RLS — this just
// shapes the UI around their daily needs and hides power-user controls.
//
// Layout:
//   1. Hero greeting + their counts + 7-day mini heatmap
//   2. Needs attention (overdue + due today, by priority)
//   3. Up next (next 7 days)
//   4. Watching (tasks where they're a watcher, not the PIC)
export default function PicHomeView({ onOpenTask }) {
  const { user } = useAuth()
  const { data: people = [] } = usePeople()
  const { data: tasks = [], isLoading } = useTasks()

  // Find the person record linked to this auth user. Used to
  // distinguish "my tasks" from "tasks I'm watching".
  const me = useMemo(
    () => people.find((p) => p.user_id === user?.id) ?? null,
    [people, user?.id],
  )

  const today = startOfToday()

  const buckets = useMemo(() => {
    const active = tasks.filter((t) => t.status !== 'Done')
    const mine = active.filter((t) => me && t.pic_id === me.id)
    const watching = active.filter(
      (t) =>
        me && t.pic_id !== me.id && (t.watchers ?? []).some((w) => w.id === me.id),
    )
    return {
      needsAttention: mine
        .filter(
          (t) =>
            t.status !== 'Ongoing' &&
            ((t.due_date && isOverdue(t.due_date)) || isToday(t.due_date)),
        )
        .sort((a, b) => priorityRank(a) - priorityRank(b) || dueRank(a, b)),
      upNext: mine
        .filter((t) => {
          if (!t.due_date) return false
          const d = parseDate(t.due_date)
          if (!d) return false
          if (d < today) return false // overdue lives in needs-attention
          if (isToday(t.due_date)) return false // due-today same
          return d <= addDays(today, 7)
        })
        .sort((a, b) => dueRank(a, b)),
      ongoing: mine.filter((t) => t.status === 'Ongoing'),
      noDate: mine.filter((t) => !t.due_date && t.status !== 'Ongoing'),
      watching,
    }
  }, [tasks, me, today])

  const todayIso = formatIso(today)
  const heatmap = useMemo(() => {
    const cells = []
    if (!me) return cells
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i)
      const iso = formatIso(d)
      const count = tasks.filter(
        (t) =>
          t.status !== 'Done' &&
          t.due_date === iso &&
          t.pic_id === me.id,
      ).length
      cells.push({ date: d, iso, count })
    }
    return cells
  }, [tasks, me, todayIso]) // eslint-disable-line react-hooks/exhaustive-deps
  const maxHeat = Math.max(1, ...heatmap.map((c) => c.count))

  const totalMine = useMemo(
    () => tasks.filter((t) => me && t.pic_id === me.id && t.status !== 'Done').length,
    [tasks, me],
  )

  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-12 text-center text-xs text-text-3">
        Loading…
      </div>
    )
  }

  if (!me) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 text-center text-sm text-text-2">
        <i className="ti ti-user-question text-2xl text-text-3 block mb-2" />
        Your account isn&rsquo;t linked to a person in this workspace yet.
        <div className="text-xs text-text-3 mt-2">
          Ask the workspace owner to link your email to your name in
          Settings → People.
        </div>
      </div>
    )
  }

  const firstName = me.name.split(' ')[0]

  return (
    <div className="space-y-3">
      {/* AI nudges */}
      <NudgesBanner onOpenTask={onOpenTask} />

      {/* Hero */}
      <div className="bg-surface border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-3 font-medium">
              {today.toLocaleDateString(undefined, { weekday: 'long' })}
            </div>
            <div className="text-2xl font-medium tracking-tight mt-0.5">
              Hi {firstName}
            </div>
            <div className="text-xs text-text-2 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                {totalMine} active task{totalMine === 1 ? '' : 's'}
              </span>
              {buckets.needsAttention.length > 0 && (
                <>
                  <span className="text-text-3">·</span>
                  <span className="text-danger-text font-medium">
                    {buckets.needsAttention.length} need
                    {buckets.needsAttention.length === 1 ? 's' : ''} attention
                  </span>
                </>
              )}
              {buckets.watching.length > 0 && (
                <>
                  <span className="text-text-3">·</span>
                  <span>{buckets.watching.length} watching</span>
                </>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-3 mb-1.5 text-right">
              Your next 7 days
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

      {/* Needs attention */}
      <PicSection
        title="Needs attention"
        subtitle="Overdue + due today"
        icon="ti-alert-circle"
        tone="danger"
        tasks={buckets.needsAttention}
        emptyMsg="You're caught up. Nothing overdue, nothing due today."
        onOpenTask={onOpenTask}
      />

      {/* Up next */}
      <PicSection
        title="Up next"
        subtitle="Next 7 days"
        icon="ti-calendar"
        tasks={buckets.upNext}
        emptyMsg="Nothing scheduled in the next 7 days."
        onOpenTask={onOpenTask}
      />

      {/* Ongoing (perpetual) */}
      {buckets.ongoing.length > 0 && (
        <PicSection
          title="Ongoing"
          subtitle="Perpetual / recurring"
          icon="ti-infinity"
          tone="muted"
          tasks={buckets.ongoing}
          emptyMsg=""
          onOpenTask={onOpenTask}
        />
      )}

      {/* Watching */}
      {buckets.watching.length > 0 && (
        <PicSection
          title={`Watching (${buckets.watching.length})`}
          subtitle="You're a watcher, not the PIC"
          icon="ti-eye"
          tone="muted"
          tasks={buckets.watching}
          emptyMsg=""
          onOpenTask={onOpenTask}
          showPic
        />
      )}

      {/* No due date catch-all */}
      {buckets.noDate.length > 0 && (
        <PicSection
          title="No due date"
          subtitle="Untimed work"
          icon="ti-calendar-question"
          tone="muted"
          tasks={buckets.noDate}
          emptyMsg=""
          onOpenTask={onOpenTask}
        />
      )}
    </div>
  )
}

// ============================================================
// Section card
// ============================================================

function PicSection({
  title,
  subtitle,
  icon,
  tone,
  tasks,
  emptyMsg,
  onOpenTask,
  showPic = false,
}) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <i
            className={`ti ${icon} text-base ${tone === 'danger' ? 'text-danger-text' : tone === 'muted' ? 'text-text-3' : 'text-info'}`}
          />
          <h2 className="text-sm font-medium">{title}</h2>
          {tasks.length > 0 && !title.includes('(') && (
            <span className="text-[11px] text-text-3">· {tasks.length}</span>
          )}
        </div>
        {subtitle && (
          <div className="text-[11px] text-text-3 mt-0.5">{subtitle}</div>
        )}
      </div>
      {tasks.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-text-3">
          {emptyMsg}
        </div>
      ) : (
        <div className="px-4">
          {tasks.map((t) =>
            showPic ? (
              <WatchedRow
                key={t.id}
                task={t}
                onClick={() => onOpenTask(t.id)}
              />
            ) : (
              <TaskRow
                key={t.id}
                task={t}
                onClick={() => onOpenTask(t.id)}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

// Variant of TaskRow that shows the PIC pill prominently — used in
// the "Watching" section where the PIC is someone other than the
// current user.
function WatchedRow({ task, onClick }) {
  const overdue = isOverdue(task.due_date) && task.status !== 'Done'
  const displayStatus = overdue ? 'Overdue' : task.status
  return (
    <div
      onClick={onClick}
      className="py-2.5 border-b border-border last:border-b-0 cursor-pointer hover:bg-surface-2 -mx-4 px-4 transition-colors"
    >
      <div className="text-sm line-clamp-2">{task.title}</div>
      <div className="text-[11px] text-text-2 flex items-center gap-1.5 mt-1 flex-wrap">
        {task.pic ? (
          <span
            className={`px-1.5 py-px rounded text-[10px] font-medium ${picPill(task.pic.color)}`}
          >
            {task.pic.name}
          </span>
        ) : (
          <span className="text-text-3 text-[10px]">Unassigned</span>
        )}
        {task.due_date && (
          <span className={overdue ? 'text-danger-text font-medium' : 'text-text-3'}>
            {formatShortDate(task.due_date)}
          </span>
        )}
        <span
          className={`text-[10px] px-1.5 py-px rounded-full font-medium ${statusPill(displayStatus)}`}
        >
          {displayStatus}
        </span>
      </div>
    </div>
  )
}

// ============================================================
// Heatmap cell (shared shape with TodayView's HeatCell — duplicated
// here so PIC mode is self-contained and we don't expose TodayView's
// internals.)
// ============================================================

function HeatCell({ cell, maxHeat, isToday }) {
  const ratio = cell.count === 0 ? 0 : Math.min(1, cell.count / maxHeat)
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
      <div
        className={`leading-none mt-1 ${cell.count > 0 ? 'font-medium' : 'text-text-3'}`}
      >
        {cell.count > 0 ? cell.count : '·'}
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
