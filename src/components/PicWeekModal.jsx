import { useEffect, useMemo } from 'react'
import {
  addDays,
  isOverdue,
  parseDate,
  startOfToday,
} from '../lib/dates'
import { picDot, picPill, statusPill } from '../lib/colors'
import ModalHeader from './ModalHeader'

// Sheet-style modal opened from the "This week by PIC" chips on Today.
// Shows everything assigned to this PIC that's due within the next 7
// days (plus anything overdue), grouped by day. Click a row to jump
// into the task; click "See all" to drill into the PIC view with the
// PIC pre-selected.
export default function PicWeekModal({
  person,
  tasks,
  onOpenTask,
  onSeeAll,
  onClose,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Stable for the lifetime of the modal — a fresh Date() each render
  // changes the reference every time, churning useMemo recomputes on
  // every parent render (the modal is mounted inside TodayView which
  // re-renders constantly as task data changes). Stabilising here
  // collapses that into one calculation per open.
  const today = useMemo(() => startOfToday(), [])

  const grouped = useMemo(() => {
    if (!person) return []
    const weekEnd = addDays(today, 7)
    const mine = tasks.filter((t) => {
      if (t.status === 'Done' || t.status === 'Ongoing') return false
      if (t.pic_id !== person.id) return false
      if (!t.due_date) return false
      const d = parseDate(t.due_date)
      if (!d) return false
      return d <= weekEnd
    })

    // Group: overdue → today → +1 → +2 … +7
    const byDay = new Map()
    for (const t of mine) {
      const d = parseDate(t.due_date)
      const key = d < today ? 'overdue' : t.due_date
      const arr = byDay.get(key) ?? []
      arr.push(t)
      byDay.set(key, arr)
    }

    const order = ['overdue']
    for (let i = 0; i < 8; i++) {
      const d = addDays(today, i)
      const iso = formatIso(d)
      if (!order.includes(iso)) order.push(iso)
    }

    return order
      .filter((key) => byDay.has(key))
      .map((key) => ({
        key,
        label: keyLabel(key, today),
        isOverdue: key === 'overdue',
        tasks: byDay
          .get(key)
          .sort(
            (a, b) =>
              priorityRank(a) - priorityRank(b) ||
              (a.title ?? '').localeCompare(b.title ?? ''),
          ),
      }))
  }, [person, tasks, today])

  const totalCount = useMemo(
    () => grouped.reduce((sum, g) => sum + g.tasks.length, 0),
    [grouped],
  )

  if (!person) return null

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto tickd-modal-backdrop"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] tickd-modal-content">
        <ModalHeader
          title={`${person.name} · this week`}
          onClose={onClose}
          rightSlot={
            <span className="text-[11px] text-text-3 flex-shrink-0">
              {totalCount} task{totalCount === 1 ? '' : 's'}
            </span>
          }
        />

        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${picDot(person.color)}`} />
          <span className="text-xs text-text-2">
            Due today + next 7 days, plus anything overdue.
          </span>
        </div>

        {/* `min-h-0` is the magic — flex children default to
            min-height: auto which prevents `overflow-y: auto` from
            ever clipping. Without it the inner content forces the
            flex parent past its max-h cap, pushing the footer below
            the modal. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {grouped.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-text-3">
              Nothing in {person.name.split(' ')[0]}'s week.
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.key}>
                <div
                  className={`px-5 pt-3 pb-1 text-[10px] uppercase tracking-wider font-medium ${
                    group.isOverdue ? 'text-danger-text' : 'text-text-3'
                  }`}
                >
                  {group.label} · {group.tasks.length}
                </div>
                <ul className="px-2">
                  {group.tasks.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => onOpenTask(t.id)}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-2 transition-colors flex items-start gap-2.5"
                      >
                        <PriorityDot priority={t.priority} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm line-clamp-2">{t.title}</div>
                          <div className="text-[11px] text-text-2 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-[10px] px-1.5 py-px rounded-full font-medium ${statusPill(
                                rowStatus(t),
                              )}`}
                            >
                              {rowStatus(t)}
                            </span>
                            {t.priority && (
                              <span className="text-text-3">{t.priority}</span>
                            )}
                            {t.pic && (
                              <span
                                className={`px-1.5 py-px rounded text-[10px] font-medium ${picPill(
                                  t.pic.color,
                                )}`}
                              >
                                {t.pic.name.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-3 bg-surface-2 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface"
          >
            Close
          </button>
          <button
            onClick={onSeeAll}
            className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium inline-flex items-center gap-1.5"
          >
            <i className="ti ti-arrow-right text-sm" />
            See all in PIC view
          </button>
        </div>
      </div>
    </div>
  )
}

function PriorityDot({ priority }) {
  const cls =
    priority === 'High'
      ? 'bg-[#FF3B30]'
      : priority === 'Medium'
        ? 'bg-[#FF9500]'
        : priority === 'Low'
          ? 'bg-[#8E8E93]'
          : 'bg-border'
  return (
    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${cls}`} />
  )
}

function priorityRank(t) {
  return { High: 0, Medium: 1, Low: 2 }[t.priority] ?? 99
}

function rowStatus(t) {
  if (t.status === 'Done') return 'Done'
  if (isOverdue(t.due_date)) return 'Overdue'
  return t.status
}

function formatIso(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function keyLabel(key, today) {
  if (key === 'overdue') return 'Overdue'
  const d = parseDate(key)
  if (!d) return key
  const diff = Math.round((d - today) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}
