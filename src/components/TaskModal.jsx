import { useEffect, useState } from 'react'
import {
  useAddWatcher,
  useDeleteTask,
  useDepartments,
  usePeople,
  useRemoveWatcher,
  useUpdateTask,
} from '../lib/queries'
import { picPill, statusPill } from '../lib/colors'
import { isOverdue, formatRelative } from '../lib/dates'
import JournalPanel from './JournalPanel'

export default function TaskModal({ task, onClose }) {
  const { data: people = [] } = usePeople()
  const { data: departments = [] } = useDepartments()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const addWatcher = useAddWatcher()
  const removeWatcher = useRemoveWatcher()

  const [showJournal, setShowJournal] = useState(false)
  const [title, setTitle] = useState('')
  const [tagInput, setTagInput] = useState('')

  // Sync local title with the task whenever the open task changes
  useEffect(() => {
    setTitle(task?.title ?? '')
  }, [task?.id, task?.title])

  // Close on Esc
  useEffect(() => {
    if (!task) return
    function handler(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [task, onClose])

  if (!task) return null

  const overdue = isOverdue(task.due_date) && task.status !== 'Done'
  const displayStatus = overdue ? 'Overdue' : task.status
  const taskNumber =
    task.task_number != null
      ? `T-${String(task.task_number).padStart(4, '0')}`
      : 'T-…'

  // Optimistic temp rows can't be updated until the server returns the real id
  const isTemp = String(task.id).startsWith('temp-')

  function updateField(field, value) {
    if (isTemp) return
    updateTask.mutate({ id: task.id, [field]: value })
  }

  function handleTitleBlur() {
    const trimmed = title.trim()
    if (!trimmed || trimmed === task.title) return
    updateField('title', trimmed)
  }

  function addTag() {
    const t = tagInput.trim()
    if (!t) return
    const existing = task.tags ?? []
    if (existing.includes(t)) {
      setTagInput('')
      return
    }
    setTagInput('')
    updateField('tags', [...existing, t])
  }

  function removeTag(t) {
    updateField(
      'tags',
      (task.tags ?? []).filter((x) => x !== t),
    )
  }

  function handleDelete() {
    if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return
    deleteTask.mutate(task.id)
    onClose()
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto"
    >
      <div
        className={`flex flex-col sm:flex-row bg-surface rounded-2xl border border-border shadow-xl w-full transition-all ${
          showJournal && !isTemp ? 'max-w-4xl' : 'max-w-xl'
        }`}
      >
        {/* Main modal */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusPill(displayStatus)}`}
              >
                {displayStatus}
              </span>
              <span className="text-xs font-mono text-text-3">{taskNumber}</span>
            </div>
            <div className="flex items-center gap-1">
              {!isTemp && (
                <button
                  onClick={() => setShowJournal((s) => !s)}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-surface-2 inline-flex items-center gap-1.5"
                >
                  <i className="ti ti-notebook text-sm" />
                  Journal
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded hover:bg-surface-2 text-text-3 hover:text-text"
                aria-label="Close"
              >
                <i className="ti ti-x text-sm" />
              </button>
            </div>
          </div>

          {/* Title + source */}
          <div className="px-5 pt-4 pb-2">
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              rows={2}
              disabled={isTemp}
              className="w-full text-lg font-medium leading-snug bg-transparent outline-none resize-none focus:bg-surface-2 rounded px-1 -mx-1 disabled:opacity-60"
            />
            <div className="text-xs text-text-2 mt-1">
              Captured · {task.source ?? 'Manual entry'}
            </div>
          </div>

          {/* Fields */}
          <div className="px-5 pb-3">
            <FieldRow label="PIC" icon="ti-user">
              <select
                value={task.pic_id ?? ''}
                onChange={(e) => updateField('pic_id', e.target.value || null)}
                disabled={isTemp}
                className="text-sm bg-surface border border-border rounded px-2 py-1 hover:bg-surface-2 cursor-pointer disabled:opacity-60"
              >
                <option value="">Unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FieldRow>

            <FieldRow label="Department" icon="ti-building">
              <select
                value={task.department_id ?? ''}
                onChange={(e) =>
                  updateField('department_id', e.target.value || null)
                }
                disabled={isTemp}
                className="text-sm bg-surface border border-border rounded px-2 py-1 hover:bg-surface-2 cursor-pointer disabled:opacity-60"
              >
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </FieldRow>

            <FieldRow label="Date raised" icon="ti-calendar-event">
              <input
                type="date"
                value={task.raised_date ?? ''}
                onChange={(e) =>
                  updateField('raised_date', e.target.value || null)
                }
                disabled={isTemp}
                className="text-sm bg-surface border border-border rounded px-2 py-1 hover:bg-surface-2 cursor-pointer disabled:opacity-60"
              />
              <span className="text-[11px] text-text-3">
                meeting / origin date
              </span>
            </FieldRow>

            <FieldRow label="Due" icon="ti-calendar-due">
              <input
                type="date"
                value={task.due_date ?? ''}
                onChange={(e) =>
                  updateField('due_date', e.target.value || null)
                }
                disabled={isTemp}
                className="text-sm bg-surface border border-border rounded px-2 py-1 hover:bg-surface-2 cursor-pointer disabled:opacity-60"
              />
              {task.due_date && (
                <span className="text-[11px] text-text-3">
                  {formatRelative(task.due_date)}
                </span>
              )}
            </FieldRow>

            <FieldRow label="Priority" icon="ti-flag">
              <select
                value={task.priority}
                onChange={(e) => updateField('priority', e.target.value)}
                disabled={isTemp}
                className="text-sm bg-surface border border-border rounded px-2 py-1 hover:bg-surface-2 cursor-pointer disabled:opacity-60"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </FieldRow>

            <FieldRow label="Status" icon="ti-circle-check">
              <select
                value={task.status}
                onChange={(e) => updateField('status', e.target.value)}
                disabled={isTemp}
                className="text-sm bg-surface border border-border rounded px-2 py-1 hover:bg-surface-2 cursor-pointer disabled:opacity-60"
              >
                <option value="Open">Open</option>
                <option value="In progress">In progress</option>
                <option value="Ongoing">Ongoing</option>
                <option value="Done">Done</option>
              </select>
            </FieldRow>

            <FieldRow label="Watchers" icon="ti-users">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(task.watchers ?? []).map((w) => (
                  <span
                    key={w.id}
                    className={`text-[11px] px-2 py-0.5 rounded inline-flex items-center gap-1 ${picPill(w.color)}`}
                  >
                    {w.name.split(' ')[0]}
                    <button
                      onClick={() =>
                        removeWatcher.mutate({
                          taskId: task.id,
                          personId: w.id,
                        })
                      }
                      disabled={isTemp}
                      className="opacity-70 hover:opacity-100"
                      aria-label={`Remove watcher ${w.name}`}
                    >
                      <i className="ti ti-x text-[10px]" />
                    </button>
                  </span>
                ))}
                {(() => {
                  const watcherIds = new Set((task.watchers ?? []).map((w) => w.id))
                  const candidates = people.filter(
                    (p) => p.id !== task.pic_id && !watcherIds.has(p.id),
                  )
                  if (candidates.length === 0) {
                    return (
                      <span className="text-[11px] text-text-3">No one else to add</span>
                    )
                  }
                  return (
                    <select
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return
                        addWatcher.mutate({
                          taskId: task.id,
                          personId: e.target.value,
                        })
                        e.target.value = ''
                      }}
                      disabled={isTemp}
                      className="text-[11px] bg-transparent border border-border rounded px-1.5 py-0.5 cursor-pointer disabled:opacity-50"
                    >
                      <option value="">+ Add watcher</option>
                      {candidates.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )
                })()}
              </div>
            </FieldRow>

            <FieldRow label="Tags" icon="ti-tag">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(task.tags ?? []).map((t) => (
                  <span
                    key={t}
                    className="text-[11px] px-2 py-0.5 rounded bg-surface-2 text-text-2 inline-flex items-center gap-1"
                  >
                    {t}
                    <button
                      onClick={() => removeTag(t)}
                      disabled={isTemp}
                      className="text-text-3 hover:text-text disabled:opacity-50"
                      aria-label={`Remove tag ${t}`}
                    >
                      <i className="ti ti-x text-[10px]" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag()
                    }
                  }}
                  onBlur={addTag}
                  disabled={isTemp}
                  placeholder="Add tag…"
                  className="text-[11px] bg-transparent outline-none w-20 placeholder:text-text-3 disabled:opacity-60"
                />
              </div>
            </FieldRow>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border-t border-border rounded-b-2xl mt-auto">
            <button
              onClick={handleDelete}
              disabled={isTemp}
              className="text-xs px-2 py-1 rounded text-danger-text hover:bg-danger-bg inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <i className="ti ti-trash text-sm" />
              Delete
            </button>
            {isTemp && (
              <span className="text-[11px] text-text-3">Saving…</span>
            )}
          </div>
        </div>

        {/* Journal sidebar — stacks below modal on mobile, side-by-side on tablet+ */}
        {showJournal && !isTemp && (
          <div className="border-t sm:border-t-0 sm:border-l border-border">
            <JournalPanel
              taskId={task.id}
              onClose={() => setShowJournal(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function FieldRow({ label, icon, children }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-center py-2 border-t border-border first:border-t-0">
      <div className="text-xs text-text-2 inline-flex items-center gap-2">
        <i className={`ti ${icon} text-sm`} />
        {label}
      </div>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  )
}
