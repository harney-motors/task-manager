import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { usePeople, useTasks } from '../lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queries'
import { useToast } from './Toast'
import {
  resolveMatcher,
  describeMatcher,
  describeActions,
  hasDestructive,
  MAX_COMMAND_SCOPE,
} from '../lib/resolveMatcher'
import { executeCommand } from '../lib/executeCommand'
import { picPill, statusPill } from '../lib/colors'

// `plan` shape (when kind === 'command'):
//   { kind, summary, confirmation_text, matcher, actions }
export default function CommandPreviewModal({ plan, onClose }) {
  const { workspace } = useAuth()
  const { data: tasks = [] } = useTasks()
  const { data: people = [] } = usePeople()
  const qc = useQueryClient()
  const showToast = useToast()
  const [running, setRunning] = useState(false)

  // Resolve the matcher to actual tasks. Memoised because both lists
  // are stable references from React Query.
  const affected = useMemo(
    () => resolveMatcher(plan?.matcher, { tasks, people }),
    [plan, tasks, people],
  )

  const overCap = affected.length > MAX_COMMAND_SCOPE
  const truncated = overCap ? affected.slice(0, MAX_COMMAND_SCOPE) : affected
  const destructive = hasDestructive(plan?.actions)
  const actionLines = describeActions(plan?.actions, { people })
  const matcherLine = describeMatcher(plan?.matcher)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !running) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, onClose])

  if (!plan || plan.kind !== 'command') return null

  async function handleApply() {
    if (overCap) {
      showToast(
        `Too many tasks (${affected.length}). Narrow the query first — cap is ${MAX_COMMAND_SCOPE}.`,
        { type: 'error' },
      )
      return
    }
    if (truncated.length === 0) {
      showToast('Nothing matched — nothing to do.', { type: 'error' })
      return
    }
    if (destructive) {
      const ok = confirm(
        `This will permanently delete ${truncated.length} task${truncated.length === 1 ? '' : 's'}. This cannot be undone. Proceed?`,
      )
      if (!ok) return
    }
    setRunning(true)
    try {
      const result = await executeCommand({
        tasks: truncated,
        actions: plan.actions,
        people,
        workspaceId: workspace?.id,
      })
      // Refresh task list + activity feed
      if (workspace?.id) {
        qc.invalidateQueries({ queryKey: queryKeys.tasks(workspace.id) })
        qc.invalidateQueries({ queryKey: ['activity', workspace.id] })
      }
      if (result.failed === 0) {
        showToast(
          `Applied to ${result.ok} task${result.ok === 1 ? '' : 's'}.`,
        )
      } else {
        showToast(
          `Applied to ${result.ok}, ${result.failed} failed.`,
          { type: 'error' },
        )
      }
      onClose()
    } catch (err) {
      showToast(err.message ?? 'Command failed', { type: 'error' })
      setRunning(false)
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && !running && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <i className="ti ti-sparkles text-info text-base" />
            <span className="text-sm font-medium truncate">
              Preview AI command
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="text-text-3 hover:text-text p-1 rounded hover:bg-surface-2 disabled:opacity-50"
            aria-label="Close"
          >
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-border">
          <div className="text-sm leading-relaxed">{plan.summary}</div>
          {matcherLine && (
            <div className="text-[11px] text-text-3 mt-1.5 font-mono">
              {matcherLine}
            </div>
          )}
          {actionLines.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {actionLines.map((line, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border ${
                    destructive
                      ? 'border-danger-bg bg-danger-bg/40 text-danger-text'
                      : 'border-info bg-info-bg text-info-text'
                  }`}
                >
                  <i className="ti ti-arrow-right text-xs" />
                  {line}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-text-2">
            {affected.length === 0 ? (
              <span className="text-text-3">
                No tasks match. Try rephrasing.
              </span>
            ) : (
              <>
                <span className="font-medium text-text">
                  {affected.length}
                </span>{' '}
                task{affected.length === 1 ? '' : 's'} will be affected
                {overCap && (
                  <span className="text-danger-text font-medium">
                    {' '}
                    (over the {MAX_COMMAND_SCOPE}-task cap — please narrow)
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {truncated.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-3">
              Nothing to preview.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {truncated.map((t) => (
                <PreviewRow key={t.id} task={t} />
              ))}
              {overCap && (
                <li className="text-[11px] text-text-3 italic text-center pt-2">
                  …{affected.length - MAX_COMMAND_SCOPE} more not shown.
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="px-4 py-3 bg-surface-2 border-t border-border flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[11px] text-text-3">
            {plan.confirmation_text}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={running}
              className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={
                running || truncated.length === 0 || overCap
              }
              className={`text-xs font-medium px-3 py-1.5 rounded inline-flex items-center gap-1.5 disabled:opacity-50 ${
                destructive
                  ? 'bg-danger-text text-white hover:opacity-90'
                  : 'bg-info text-white hover:opacity-90'
              }`}
            >
              {running ? (
                <>
                  <i className="ti ti-loader-2 animate-spin text-sm" />
                  Applying…
                </>
              ) : destructive ? (
                <>
                  <i className="ti ti-trash text-sm" />
                  Delete {truncated.length}
                </>
              ) : (
                <>
                  <i className="ti ti-check text-sm" />
                  Apply to {truncated.length}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewRow({ task }) {
  return (
    <li className="flex items-start gap-2 text-xs border border-border rounded p-2 bg-surface">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{task.title}</div>
        <div className="text-[11px] text-text-2 mt-0.5 flex items-center gap-1.5 flex-wrap">
          {task.pic ? (
            <span
              className={`px-1.5 py-px rounded text-[10px] font-medium ${picPill(task.pic.color)}`}
            >
              {task.pic.name.split(' ')[0]}
            </span>
          ) : (
            <span className="text-text-3">Unassigned</span>
          )}
          {task.due_date && <span>{task.due_date}</span>}
          <span
            className={`text-[10px] px-1.5 py-px rounded-full font-medium ${statusPill(task.status)}`}
          >
            {task.status}
          </span>
        </div>
      </div>
    </li>
  )
}
