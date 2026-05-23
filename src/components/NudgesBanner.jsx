import { useEffect, useState } from 'react'
import { useActiveNudges, useDismissNudge } from '../lib/queries'

const SEVERITY_STYLE = {
  urgent: 'border-danger-bg bg-danger-bg/40 text-danger-text',
  high:   'border-warning-bg bg-warning-bg/40 text-warning-text',
  medium: 'border-info bg-info-bg text-info-text',
  low:    'border-border bg-surface-2 text-text-2',
}

const SEVERITY_ICON = {
  urgent: 'ti-flame',
  high:   'ti-alert-triangle',
  medium: 'ti-bulb',
  low:    'ti-info-circle',
}

// Severity sort order so the single-line summary surfaces the most
// pressing nudge.
const SEVERITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 }

const MAX_VISIBLE = 3
const STORAGE_KEY = 'tickd-nudges-expanded'

export default function NudgesBanner({ onOpenTask }) {
  const { data: nudges = [], isLoading } = useActiveNudges()
  const dismiss = useDismissNudge()

  // Default to collapsed; remember per-session if user expanded.
  // We store as string '1' / '0' rather than JSON for simplicity.
  const [expanded, setExpanded] = useState(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) === '1'
  })
  // Track whether the user explicitly expanded (vs. inheriting from
  // a previous session). Doesn't change behaviour today; reserved for
  // future "auto-collapse after dismissal" logic.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, expanded ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [expanded])

  if (isLoading || nudges.length === 0) return null

  // Most-pressing-first ordering: severity, then newest.
  const sorted = [...nudges].sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] ?? 99
    const sb = SEVERITY_RANK[b.severity] ?? 99
    if (sa !== sb) return sa - sb
    return new Date(b.created_at) - new Date(a.created_at)
  })

  const top = sorted[0]
  const topTone = SEVERITY_STYLE[top.severity] || SEVERITY_STYLE.medium
  const topIcon = SEVERITY_ICON[top.severity] || SEVERITY_ICON.medium

  // ----- Collapsed (default) -----
  if (!expanded) {
    return (
      <div
        id="nudges-banner"
        className={`rounded-xl border ${topTone} mb-3 flex items-center gap-2 px-3 py-2`}
      >
        <i className="ti ti-sparkles text-info text-sm flex-shrink-0" />
        <i className={`ti ${topIcon} text-sm flex-shrink-0`} />
        <button
          onClick={() => setExpanded(true)}
          className="flex-1 min-w-0 text-left text-xs font-medium truncate hover:underline"
          title="Expand all nudges"
        >
          {top.title}
        </button>
        <span className="text-[10px] text-text-3 flex-shrink-0">
          {nudges.length > 1 && `+${nudges.length - 1}`}
        </span>
        <button
          onClick={() => setExpanded(true)}
          className="flex-shrink-0 text-text-3 hover:text-text p-0.5"
          aria-label="Expand"
          title="Expand"
        >
          <i className="ti ti-chevron-down text-xs" />
        </button>
      </div>
    )
  }

  // ----- Expanded -----
  const visible = sorted.slice(0, MAX_VISIBLE)
  const hidden = sorted.length - visible.length

  return (
    <div
      id="nudges-banner"
      className="bg-surface border border-border rounded-xl p-3 mb-3"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <i className="ti ti-sparkles text-info text-sm" />
          <span className="text-[11px] uppercase tracking-wider text-text-3 font-medium">
            Tickd AI noticed
          </span>
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-[11px] text-text-3 hover:text-text flex items-center gap-0.5"
          title="Collapse"
        >
          Collapse
          <i className="ti ti-chevron-up text-xs" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {visible.map((n) => (
          <li key={n.id}>
            <NudgeRow
              nudge={n}
              onOpenTask={onOpenTask}
              onDismiss={() => dismiss.mutate(n.id)}
            />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <div className="text-[10px] text-text-3 mt-1.5 px-1">
          +{hidden} more nudge{hidden === 1 ? '' : 's'} (will show when older ones dismissed)
        </div>
      )}
    </div>
  )
}

function NudgeRow({ nudge, onOpenTask, onDismiss }) {
  const tone = SEVERITY_STYLE[nudge.severity] || SEVERITY_STYLE.medium
  const icon = SEVERITY_ICON[nudge.severity] || SEVERITY_ICON.medium
  const taskIds = nudge.payload?.task_ids ?? []
  const hasFirstTask = taskIds.length > 0 && !!onOpenTask
  return (
    <div
      className={`flex items-start gap-2 px-2.5 py-2 rounded-md border ${tone}`}
    >
      <i className={`ti ${icon} text-sm mt-0.5 flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium leading-snug">{nudge.title}</div>
        {nudge.body && (
          <div className="text-[11px] mt-0.5 leading-snug opacity-90">
            {nudge.body}
          </div>
        )}
        {hasFirstTask && (
          <button
            onClick={() => onOpenTask(taskIds[0])}
            className="text-[10px] mt-1 underline opacity-80 hover:opacity-100"
          >
            Open task
            {taskIds.length > 1 && ` (+${taskIds.length - 1} more)`}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        title="Dismiss"
        aria-label="Dismiss"
        className="text-text-3 hover:text-text opacity-70 hover:opacity-100 flex-shrink-0 p-0.5"
      >
        <i className="ti ti-x text-xs" />
      </button>
    </div>
  )
}
