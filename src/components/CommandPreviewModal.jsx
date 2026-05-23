import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  queryKeys,
  useCreateSavedCommand,
  usePeople,
  useTasks,
} from '../lib/queries'
import { useQueryClient } from '@tanstack/react-query'
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
  const saveCommand = useCreateSavedCommand()
  const [running, setRunning] = useState(false)
  // Per-row exclusion set: tasks the user opted out before applying.
  const [excluded, setExcluded] = useState(() => new Set())
  // Save-as-automation prompt state.
  const [namingSave, setNamingSave] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveScope, setSaveScope] = useState('workspace') // 'workspace' | 'all'

  // Reset per-row state whenever a fresh plan comes in.
  useEffect(() => {
    setExcluded(new Set())
    setNamingSave(false)
    setSaveName('')
  }, [plan])

  // Resolve the matcher to actual tasks. Memoised because both lists
  // are stable references from React Query.
  const affected = useMemo(
    () => resolveMatcher(plan?.matcher, { tasks, people }),
    [plan, tasks, people],
  )

  const overCap = affected.length > MAX_COMMAND_SCOPE
  const truncated = overCap ? affected.slice(0, MAX_COMMAND_SCOPE) : affected
  // Final set to apply = truncated minus user-excluded rows.
  const finalTasks = useMemo(
    () => truncated.filter((t) => !excluded.has(t.id)),
    [truncated, excluded],
  )
  const destructive = hasDestructive(plan?.actions)
  const actionLines = describeActions(plan?.actions, { people })
  const matcherLine = describeMatcher(plan?.matcher)

  function toggleExclude(taskId) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }
  function includeAll() {
    setExcluded(new Set())
  }
  function excludeAll() {
    setExcluded(new Set(truncated.map((t) => t.id)))
  }

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
    if (finalTasks.length === 0) {
      showToast(
        truncated.length === 0
          ? 'Nothing matched — nothing to do.'
          : 'Every task was excluded — nothing to do.',
        { type: 'error' },
      )
      return
    }
    if (destructive) {
      const ok = confirm(
        `This will permanently delete ${finalTasks.length} task${finalTasks.length === 1 ? '' : 's'}. This cannot be undone. Proceed?`,
      )
      if (!ok) return
    }
    setRunning(true)
    try {
      const result = await executeCommand({
        tasks: finalTasks,
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

  async function handleSaveAutomation() {
    const name = saveName.trim()
    if (!name) return
    try {
      await saveCommand.mutateAsync({
        name,
        plan: {
          // Persist only the bits we need to re-run later. We drop
          // the human-readable summary so it can be regenerated from
          // current state if/when we re-run.
          kind: 'command',
          summary: plan.summary,
          confirmation_text: plan.confirmation_text,
          matcher: plan.matcher,
          actions: plan.actions,
        },
        scopeWorkspace: saveScope === 'workspace',
      })
      showToast(`Saved automation: "${name}"`)
      setNamingSave(false)
      setSaveName('')
    } catch {
      // toast handled by hook
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
                  {finalTasks.length}
                </span>{' '}
                of{' '}
                <span className="text-text-2">
                  {truncated.length}
                </span>{' '}
                shown will be affected
                {overCap && (
                  <span className="text-danger-text font-medium">
                    {' '}
                    (over the {MAX_COMMAND_SCOPE}-task cap — please narrow)
                  </span>
                )}
              </>
            )}
          </div>
          {truncated.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <button
                onClick={includeAll}
                disabled={excluded.size === 0}
                className="underline text-text-3 hover:text-text disabled:opacity-50"
              >
                Include all
              </button>
              <span className="text-text-3">·</span>
              <button
                onClick={excludeAll}
                disabled={excluded.size === truncated.length}
                className="underline text-text-3 hover:text-text disabled:opacity-50"
              >
                Exclude all
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {truncated.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-3">
              Nothing to preview.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {truncated.map((t) => (
                <PreviewRow
                  key={t.id}
                  task={t}
                  included={!excluded.has(t.id)}
                  onToggle={() => toggleExclude(t.id)}
                />
              ))}
              {overCap && (
                <li className="text-[11px] text-text-3 italic text-center pt-2">
                  …{affected.length - MAX_COMMAND_SCOPE} more not shown.
                </li>
              )}
            </ul>
          )}
        </div>

        {namingSave && (
          <div className="px-4 py-3 bg-surface-2 border-t border-border">
            <div className="text-[11px] uppercase tracking-wider text-text-3 font-medium mb-1.5">
              Save as automation
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSaveAutomation()
              }}
              className="flex items-center gap-2 flex-wrap"
            >
              <input
                type="text"
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                maxLength={80}
                placeholder="Name this automation…"
                className="text-xs px-2 py-1 border border-border rounded bg-surface flex-1 min-w-[160px] outline-none focus:border-info"
              />
              <select
                value={saveScope}
                onChange={(e) => setSaveScope(e.target.value)}
                className="text-xs px-2 py-1 border border-border rounded bg-surface cursor-pointer"
                title="Where the chip shows up"
              >
                <option value="workspace">This workspace</option>
                <option value="all">All workspaces</option>
              </select>
              <button
                type="submit"
                disabled={!saveName.trim() || saveCommand.isPending}
                className="text-xs px-3 py-1 rounded bg-info text-white font-medium disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setNamingSave(false)
                  setSaveName('')
                }}
                className="text-xs text-text-3 hover:text-text px-1"
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        <div className="px-4 py-3 bg-surface-2 border-t border-border flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[11px] text-text-3">
            {plan.confirmation_text}
          </div>
          <div className="flex gap-2 items-center">
            {!namingSave && (
              <button
                onClick={() => setNamingSave(true)}
                disabled={running || overCap}
                title="Save this matcher + actions to reuse from Cmd+K later"
                className="text-xs px-2 py-1.5 rounded text-text-3 hover:text-text hover:bg-surface inline-flex items-center gap-1 disabled:opacity-50"
              >
                <i className="ti ti-bookmark text-sm" />
                Save automation
              </button>
            )}
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
                running || finalTasks.length === 0 || overCap
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
                  Delete {finalTasks.length}
                </>
              ) : (
                <>
                  <i className="ti ti-check text-sm" />
                  Apply to {finalTasks.length}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewRow({ task, included, onToggle }) {
  return (
    <li
      className={`flex items-start gap-2 text-xs border rounded p-2 bg-surface ${
        included ? 'border-border' : 'border-border opacity-50 line-through'
      }`}
    >
      <input
        type="checkbox"
        checked={included}
        onChange={onToggle}
        className="mt-0.5 cursor-pointer flex-shrink-0"
        title={included ? 'Click to exclude from this run' : 'Click to include'}
        aria-label={included ? 'Exclude this task' : 'Include this task'}
      />
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
