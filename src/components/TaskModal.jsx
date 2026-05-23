import { useEffect, useRef, useState } from 'react'
import {
  useAddWatcher,
  useDeleteTask,
  useDepartments,
  useJournalEntries,
  usePeople,
  useRemoveWatcher,
  useUpdateTask,
} from '../lib/queries'
import { picPill, statusPill } from '../lib/colors'
import {
  addDays as addDaysIso,
  isOverdue,
  formatRelative,
  startOfToday,
} from '../lib/dates'
import { recordRecentTask } from '../lib/recentTasks'
import { useAuth } from '../auth/AuthProvider'
import JournalPanel from './JournalPanel'

export default function TaskModal({ task, onClose }) {
  const { workspace } = useAuth()
  const { data: people = [] } = usePeople()
  const { data: departments = [] } = useDepartments()
  const { data: journalEntries = [] } = useJournalEntries(task?.id)
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const addWatcher = useAddWatcher()
  const removeWatcher = useRemoveWatcher()

  // Tab — 'details' default; 'journal' switches the body. Same on
  // desktop and mobile (the old side-by-side layout was nice but
  // gobbled screen real estate; tabs scale better).
  const [tab, setTab] = useState('details')
  const [title, setTitle] = useState('')
  const [tagInput, setTagInput] = useState('')
  const journalInputRef = useRef(null)

  // Sync local title with the task whenever the open task changes
  useEffect(() => {
    setTitle(task?.title ?? '')
    setTab('details')
  }, [task?.id, task?.title])

  // Record the open in the per-workspace recent-tasks list.
  useEffect(() => {
    if (!task?.id || !workspace?.id) return
    if (String(task.id).startsWith('temp-')) return
    recordRecentTask(workspace.id, task)
  }, [task?.id, workspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard nav: Esc closes; Cmd/Ctrl+Enter closes; 'n' jumps to journal.
  useEffect(() => {
    if (!task) return
    function handler(e) {
      // Don't hijack typing inside inputs/textareas/selects.
      const tag = e.target?.tagName
      const inField =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        e.target?.isContentEditable
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        onClose()
        return
      }
      if (!inField && e.key === 'n') {
        e.preventDefault()
        setTab('journal')
        // Focus the journal input on the next paint (after tab swap).
        setTimeout(() => journalInputRef.current?.focus(), 50)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [task, onClose])

  // Save indicator — shows "Saving…" while any task mutation is in
  // flight, then briefly "Saved" after it lands. addWatcher and
  // removeWatcher also count since they affect the task surface.
  const anyPending =
    updateTask.isPending || addWatcher.isPending || removeWatcher.isPending
  const [saveTone, setSaveTone] = useState(null) // 'saving' | 'saved' | null
  const wasPendingRef = useRef(false)
  useEffect(() => {
    if (anyPending) {
      setSaveTone('saving')
      wasPendingRef.current = true
      return
    }
    if (wasPendingRef.current) {
      wasPendingRef.current = false
      setSaveTone('saved')
      const t = setTimeout(() => setSaveTone(null), 1500)
      return () => clearTimeout(t)
    }
  }, [anyPending])

  if (!task) return null

  const overdue = isOverdue(task.due_date) && task.status !== 'Done'
  const displayStatus = overdue ? 'Overdue' : task.status
  const taskNumber =
    task.task_number != null
      ? `T-${String(task.task_number).padStart(4, '0')}`
      : 'T-…'

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

  // ----- Quick-snooze helpers -----
  function snoozeTo(iso) {
    updateField('due_date', iso)
  }
  const today = startOfToday()
  const tomorrowIso = formatIso(addDaysIso(today, 1))
  const nextMondayIso = formatIso(nextMonday(today))
  const plus7Iso = formatIso(addDaysIso(today, 7))

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto"
    >
      <div className="flex flex-col bg-surface rounded-2xl border border-border shadow-xl w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusPill(displayStatus)}`}
            >
              {displayStatus}
            </span>
            <span className="text-xs font-mono text-text-3 flex-shrink-0">
              {taskNumber}
            </span>
            <SaveBadge tone={saveTone} isTemp={isTemp} />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface-2 text-text-3 hover:text-text flex-shrink-0"
            aria-label="Close"
          >
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        {/* Tabs */}
        {!isTemp && (
          <div className="px-4 pt-3 -mb-px flex items-center gap-1 border-b border-border">
            <TabButton
              active={tab === 'details'}
              onClick={() => setTab('details')}
              icon="ti-list-details"
            >
              Details
            </TabButton>
            <TabButton
              active={tab === 'journal'}
              onClick={() => setTab('journal')}
              icon="ti-notebook"
              badge={journalEntries.length}
            >
              Journal
            </TabButton>
          </div>
        )}

        {/* Body */}
        {tab === 'details' || isTemp ? (
          <DetailsTab
            task={task}
            title={title}
            setTitle={setTitle}
            handleTitleBlur={handleTitleBlur}
            isTemp={isTemp}
            people={people}
            departments={departments}
            updateField={updateField}
            addWatcher={addWatcher}
            removeWatcher={removeWatcher}
            tagInput={tagInput}
            setTagInput={setTagInput}
            addTag={addTag}
            removeTag={removeTag}
            snoozeTo={snoozeTo}
            tomorrowIso={tomorrowIso}
            nextMondayIso={nextMondayIso}
            plus7Iso={plus7Iso}
            handleDelete={handleDelete}
          />
        ) : (
          <div className="border-b border-border">
            <JournalPanel
              taskId={task.id}
              onClose={() => setTab('details')}
              inputRef={journalInputRef}
              embedded
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Details tab
// ============================================================

function DetailsTab({
  task,
  title,
  setTitle,
  handleTitleBlur,
  isTemp,
  people,
  departments,
  updateField,
  addWatcher,
  removeWatcher,
  tagInput,
  setTagInput,
  addTag,
  removeTag,
  snoozeTo,
  tomorrowIso,
  nextMondayIso,
  plus7Iso,
  handleDelete,
}) {
  return (
    <>
      {/* Inactive PIC banner — surfaces the orphaned ownership so the
          user notices it and can reassign in one click. */}
      {task.pic?.is_active === false && (
        <div className="mx-5 mt-3 mb-1 px-3 py-2 rounded-md border border-warning-bg bg-warning-bg/40 text-warning-text text-xs flex items-center gap-2">
          <i className="ti ti-user-off text-sm" />
          <span>
            <span className="font-medium">{task.pic.name}</span> is inactive —
            this task has no active owner.
          </span>
        </div>
      )}

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
          {/* Quick-snooze — single tap to push the date forward */}
          <div className="flex items-center gap-1 ml-1">
            <SnoozeChip onClick={() => snoozeTo(tomorrowIso)} disabled={isTemp}>
              Tomorrow
            </SnoozeChip>
            <SnoozeChip
              onClick={() => snoozeTo(nextMondayIso)}
              disabled={isTemp}
            >
              Next Mon
            </SnoozeChip>
            <SnoozeChip onClick={() => snoozeTo(plus7Iso)} disabled={isTemp}>
              +7d
            </SnoozeChip>
          </div>
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
                  <span className="text-[11px] text-text-3">
                    No one else to add
                  </span>
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
        <div className="text-[11px] text-text-3">
          Press <kbd className="px-1 border border-border rounded">⌘↵</kbd> to close · <kbd className="px-1 border border-border rounded">n</kbd> for notes
        </div>
      </div>
    </>
  )
}

// ============================================================
// Small atoms
// ============================================================

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

function SnoozeChip({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-surface-2 text-text-2 hover:text-text disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function TabButton({ active, onClick, icon, badge, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1.5 inline-flex items-center gap-1.5 border-b-2 -mb-px ${
        active
          ? 'border-info text-text font-medium'
          : 'border-transparent text-text-2 hover:text-text'
      }`}
    >
      <i className={`ti ${icon} text-sm`} />
      {children}
      {badge != null && badge > 0 && (
        <span className="text-[10px] text-text-3 ml-0.5">· {badge}</span>
      )}
    </button>
  )
}

function SaveBadge({ tone, isTemp }) {
  if (isTemp) {
    return (
      <span className="text-[11px] text-text-3 inline-flex items-center gap-1">
        <i className="ti ti-loader-2 animate-spin text-xs" />
        Saving…
      </span>
    )
  }
  if (tone === 'saving') {
    return (
      <span className="text-[11px] text-text-3 inline-flex items-center gap-1">
        <i className="ti ti-loader-2 animate-spin text-xs" />
        Saving…
      </span>
    )
  }
  if (tone === 'saved') {
    return (
      <span className="text-[11px] text-success-text inline-flex items-center gap-1">
        <i className="ti ti-check text-xs" />
        Saved
      </span>
    )
  }
  return null
}

// ============================================================
// Date helpers
// ============================================================

function nextMonday(from) {
  // 0=Sun, 1=Mon, ... 6=Sat — find next Monday strictly after `from`.
  const d = new Date(from)
  const day = d.getDay()
  const offset = day === 0 ? 1 : (8 - day) % 7 || 7
  d.setDate(d.getDate() + offset)
  return d
}

function formatIso(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
