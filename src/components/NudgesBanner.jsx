import { useState } from 'react'
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

const MAX_VISIBLE = 3

export default function NudgesBanner({ onOpenTask }) {
  const { data: nudges = [], isLoading } = useActiveNudges()
  const dismiss = useDismissNudge()
  const [expanded, setExpanded] = useState(false)

  if (isLoading || nudges.length === 0) return null

  const visible = expanded ? nudges : nudges.slice(0, MAX_VISIBLE)
  const hidden = nudges.length - visible.length

  return (
    <div className="bg-surface border border-border rounded-xl p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <i className="ti ti-sparkles text-info text-sm" />
          <span className="text-[11px] uppercase tracking-wider text-text-3 font-medium">
            Tickd AI noticed
          </span>
        </div>
        {nudges.length > MAX_VISIBLE && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-text-3 hover:text-text underline"
          >
            {expanded ? 'Show top 3' : `Show all ${nudges.length}`}
          </button>
        )}
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
      {!expanded && hidden > 0 && (
        <div className="text-[10px] text-text-3 mt-1.5 px-1">
          +{hidden} more
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
