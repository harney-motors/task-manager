// Subtask progress chip — a compact "3/5" pill backed by a thin fill
// bar so users can scan completion at a glance. The numeric label
// stays so they can also see the absolute count.
//
// Inspired by ClickUp's task-list progress dots and Linear's project
// progress bars: small enough to fit on a task row, expressive enough
// to read at a glance.
//
// Sizes:
//   'sm' — fits inside TaskRow / KanbanCard meta strip
//   'md' — used inside TaskModal subtasks section header
//
// Tone:
//   'soft' (default) — neutral surface for "in flight"
//   'auto' — switches to green once 100% done

export default function SubtaskProgress({ subtasks = [], size = 'sm', tone = 'soft' }) {
  const total = subtasks.length
  if (total === 0) return null

  const done = subtasks.filter((s) => s.done).length
  const pct = Math.round((done / total) * 100)
  const complete = done === total
  const usesGreen = tone === 'auto' && complete

  const widthClass = size === 'md' ? 'w-20' : 'w-10 sm:w-12'
  const heightClass = size === 'md' ? 'h-1.5' : 'h-1'
  const textClass =
    size === 'md' ? 'text-[11px]' : 'text-[10px]'

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${textClass} text-text-3`}
      title={`${done} of ${total} subtasks done (${pct}%)`}
    >
      <i className="ti ti-list-check text-[11px]" aria-hidden />
      <span className={`relative bg-surface-3 rounded-full overflow-hidden ${widthClass} ${heightClass}`}>
        <span
          className={`absolute inset-y-0 left-0 transition-all duration-300 ${
            usesGreen ? 'bg-success' : 'bg-info'
          }`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular-nums">
        {done}/{total}
      </span>
    </span>
  )
}
