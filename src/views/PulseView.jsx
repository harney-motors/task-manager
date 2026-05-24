import { useMemo } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { usePeople, useTasks } from '../lib/queries'
import { addDays, parseDate, startOfToday, isOverdue } from '../lib/dates'
import { picPill } from '../lib/colors'

// Workspace pulse / health dashboard. Owner+editor-visible analytics
// over the active workspace: average time-to-done, oldest open task,
// busiest PIC (by active count), and completion rate over the last 8
// weeks. Heuristic — no LLM calls — so it's instant.
//
// PIC-mode users don't reach this view (Home gates it behind the
// non-PIC tree), but we still no-op gracefully if accessed.
export default function PulseView({ onBack, onOpenTask }) {
  const { workspace } = useAuth()
  const { data: tasks = [] } = useTasks()
  const { data: people = [] } = usePeople({ includeInactive: true })

  const today = startOfToday()

  // --- Compute metrics ---
  const metrics = useMemo(() => {
    const done = tasks.filter((t) => t.status === 'Done')
    const open = tasks.filter((t) => t.status !== 'Done')
    const overdue = open.filter((t) => t.due_date && isOverdue(t.due_date))

    // Avg time-to-done (created_at → updated_at on Done rows)
    const durations = done
      .map((t) => {
        const c = t.created_at ? new Date(t.created_at).getTime() : null
        const u = t.updated_at ? new Date(t.updated_at).getTime() : null
        if (!c || !u || u < c) return null
        return (u - c) / (1000 * 60 * 60 * 24)
      })
      .filter((d) => d != null)
    const avgDays =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null

    // Oldest open task by created_at
    const oldestOpen = [...open]
      .filter((t) => t.created_at)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )[0]

    // Active count per PIC + (separately) overdue count per PIC
    const byPic = new Map()
    for (const t of open) {
      if (!t.pic_id) continue
      const cur = byPic.get(t.pic_id) ?? { active: 0, overdue: 0 }
      cur.active += 1
      if (t.due_date && isOverdue(t.due_date)) cur.overdue += 1
      byPic.set(t.pic_id, cur)
    }
    const picLoad = people
      .map((p) => ({
        person: p,
        ...byPic.get(p.id),
      }))
      .filter((x) => (x.active ?? 0) > 0)
      .sort((a, b) => (b.active ?? 0) - (a.active ?? 0))

    // Completion rate per week for the last 8 weeks (sundays-bucketed)
    const weeks = []
    for (let i = 7; i >= 0; i--) {
      const weekStart = addDays(today, -((today.getDay() || 7) - 1) - i * 7)
      const weekEnd = addDays(weekStart, 7)
      weeks.push({
        label: shortWeekLabel(weekStart),
        weekStart,
        weekEnd,
        completed: 0,
      })
    }
    for (const t of done) {
      const u = t.updated_at ? new Date(t.updated_at) : null
      if (!u) continue
      for (const w of weeks) {
        if (u >= w.weekStart && u < w.weekEnd) {
          w.completed += 1
          break
        }
      }
    }
    const maxWeek = Math.max(1, ...weeks.map((w) => w.completed))

    return {
      open,
      done,
      overdue,
      avgDays,
      oldestOpen,
      picLoad,
      weeks,
      maxWeek,
    }
  }, [tasks, people, today])

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <header
        className="sticky top-0 z-30 bg-bg/85 backdrop-blur-xl border-b border-border/60"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto max-w-5xl px-3 sm:px-6 py-2 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-full inline-flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors flex-shrink-0"
              aria-label="Back"
            >
              <i className="ti ti-arrow-left text-base" />
            </button>
            <i className="ti ti-chart-bar text-info text-lg flex-shrink-0" />
            <h1 className="text-base sm:text-lg font-medium tracking-tight truncate">
              Workspace pulse
              <span className="hidden sm:inline"> · {workspace?.name}</span>
            </h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-3 sm:px-6 py-4 sm:py-6 pb-20 sm:pb-8">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <MetricCard
            icon="ti-bolt"
            label="Open tasks"
            value={metrics.open.length}
            sub={
              metrics.overdue.length > 0
                ? `${metrics.overdue.length} overdue`
                : 'On track'
            }
            tone={metrics.overdue.length > 0 ? 'danger' : 'info'}
          />
          <MetricCard
            icon="ti-hourglass"
            label="Avg time to done"
            value={
              metrics.avgDays != null
                ? `${metrics.avgDays.toFixed(1)}d`
                : '—'
            }
            sub={`Across ${metrics.done.length} completed`}
            tone="muted"
          />
          <MetricCard
            icon="ti-flame"
            label="Oldest open task"
            value={
              metrics.oldestOpen
                ? `${daysSince(metrics.oldestOpen.created_at)}d`
                : '—'
            }
            sub={metrics.oldestOpen?.title ?? '—'}
            tone="warning"
            onClick={
              metrics.oldestOpen
                ? () => onOpenTask?.(metrics.oldestOpen.id)
                : null
            }
            truncate
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Weekly completion bar chart */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <i className="ti ti-chart-bar text-info text-sm" />
              <h2 className="text-sm font-medium">Completed per week</h2>
            </div>
            <div className="flex items-end gap-2 h-32">
              {metrics.weeks.map((w, i) => {
                const h = (w.completed / metrics.maxWeek) * 100
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${w.label}: ${w.completed} completed`}
                  >
                    <div className="text-[10px] text-text-3">
                      {w.completed > 0 ? w.completed : ''}
                    </div>
                    <div
                      className="w-full bg-info rounded-t transition-all"
                      style={{ height: `${h}%`, minHeight: w.completed > 0 ? '4px' : 0 }}
                    />
                    <div className="text-[10px] text-text-3">{w.label}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* PIC load */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <i className="ti ti-users text-info text-sm" />
              <h2 className="text-sm font-medium">Busiest PICs</h2>
              <span className="text-[11px] text-text-3 ml-auto">
                by active count
              </span>
            </div>
            {metrics.picLoad.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-3">
                No PICs carrying active work.
              </div>
            ) : (
              <ul className="space-y-2">
                {metrics.picLoad.slice(0, 6).map(({ person, active, overdue }) => (
                  <li
                    key={person.id}
                    className="flex items-center gap-3 text-xs"
                  >
                    <span
                      className={`flex-shrink-0 px-1.5 py-px rounded text-[10px] font-medium ${picPill(person.color)}`}
                    >
                      {person.name.split(' ')[0]}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-text-2">
                      {person.name}
                      {person.is_active === false && (
                        <span className="text-warning-text ml-1 text-[10px]">
                          (inactive)
                        </span>
                      )}
                    </span>
                    <span className="flex-shrink-0 text-text-3">
                      {active}
                      {overdue > 0 && (
                        <span className="text-danger-text font-medium">
                          {' · '}
                          {overdue} overdue
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Atoms
// ============================================================

function MetricCard({
  icon,
  label,
  value,
  sub,
  tone = 'muted',
  onClick,
  truncate,
}) {
  const toneCls =
    tone === 'danger'
      ? 'text-danger-text'
      : tone === 'warning'
        ? 'text-warning-text'
        : tone === 'info'
          ? 'text-info'
          : 'text-text-3'
  return (
    <div
      onClick={onClick ?? undefined}
      className={`bg-surface border border-border rounded-xl p-4 ${
        onClick ? 'cursor-pointer hover:bg-surface-2' : ''
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-text-3 inline-flex items-center gap-1.5">
        <i className={`ti ${icon} ${toneCls} text-sm`} />
        {label}
      </div>
      <div className="text-2xl font-medium tracking-tight mt-1.5">{value}</div>
      {sub && (
        <div
          className={`text-xs text-text-2 mt-1 ${truncate ? 'truncate' : ''}`}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

function daysSince(iso) {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  const days = (Date.now() - then) / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.round(days))
}

function shortWeekLabel(weekStart) {
  // "May 5" form, week-of label
  return weekStart.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
