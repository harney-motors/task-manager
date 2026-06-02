import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useAddWatcher,
  useDepartments,
  useJournalEntries,
  usePeople,
  useRemoveWatcher,
  useUpdateTask,
} from '../lib/queries'
import { bulkDeleteWithUndo } from '../lib/deferredBulkDelete'
import { useToast } from './Toast'
import { picPill, statusPill } from '../lib/colors'
import Avatar from './Avatar'
import {
  addDays as addDaysIso,
  isOverdue,
  formatRelative,
  startOfToday,
} from '../lib/dates'
import { recordRecentTask } from '../lib/recentTasks'
import { useAuth } from '../auth/AuthProvider'
import JournalPanel from './JournalPanel'
import TaskActivityPanel from './TaskActivityPanel'
import SubtasksField from './SubtasksField'
import DependenciesField from './DependenciesField'
import ModalHeader from './ModalHeader'
import { useTaskDependencies } from '../lib/queries'
import useTaskPresence from '../lib/useTaskPresence'
import { AvatarStack } from './Avatar'

export default function TaskModal({ task, onClose, onOpenTask }) {
  const { user, workspace } = useAuth()
  const queryClient = useQueryClient()
  const showToast = useToast()
  const { data: people = [] } = usePeople()
  const { data: departments = [] } = useDepartments()
  const { data: journalEntries = [] } = useJournalEntries(task?.id)
  const updateTask = useUpdateTask()
  const addWatcher = useAddWatcher()
  const removeWatcher = useRemoveWatcher()

  // Role gates — keep the UI honest about what the server will accept.
  // Phase-27 RLS: only owners can DELETE; the BEFORE-UPDATE trigger
  // blocks PIC status changes.
  const role = workspace?.role
  const isPicRole = role === 'pic'
  const canDelete = role === 'owner'
  const canEditStatus = !isPicRole

  // Realtime presence — broadcasts "I'm viewing this task" + tracks
  // others doing the same. Used to surface co-edit warnings (#16/#17).
  const meIdentity = useMemo(() => {
    const person = people.find((p) => p.user_id === user?.id)
    return {
      name: person?.name ?? user?.email ?? null,
      color: person?.color ?? null,
      initials: person?.initials ?? null,
    }
  }, [people, user?.id, user?.email])
  const presence = useTaskPresence(task?.id, user, meIdentity)

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

  // Keyboard nav: Esc closes; Cmd/Ctrl+Enter closes; 'n' jumps to
  // comments; 'a' jumps to activity (read-only).
  useEffect(() => {
    if (!task) return
    function handler(e) {
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
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        // ⌘S — explicit Save (without close). Mirrors the Save
        // button in the sticky footer; flushes any pending title.
        e.preventDefault()
        handleTitleBlur()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        // ⌘↵ — flush pending title then close in one stroke.
        e.preventDefault()
        handleTitleBlur()
        onClose()
        return
      }
      if (!inField && e.key === 'n') {
        e.preventDefault()
        setTab('journal')
        setTimeout(() => journalInputRef.current?.focus(), 50)
      }
      if (!inField && e.key === 'a') {
        e.preventDefault()
        setTab('activity')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // `title` is included so the Cmd+Enter handler captures the
    // latest typed text — without it, the handler keeps a stale title
    // from mount time and the title commit on Save/⌘↵ is a no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, onClose, title])

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
    // Gmail-style soft delete: close the modal and show an undo toast.
    // The real server delete fires after the toast window — clicking
    // Undo within the window restores the cache without any DB round-trip.
    onClose()
    bulkDeleteWithUndo({
      tasks: [task],
      queryClient,
      workspaceId: workspace?.id,
      showToast,
    })
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
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto tickd-modal-backdrop"
    >
      <div className="flex flex-col bg-surface rounded-2xl border border-border shadow-xl w-full max-w-xl tickd-modal-content">
        <ModalHeader
          title={taskNumber}
          onClose={onClose}
          rightSlot={
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusPill(displayStatus)}`}
              >
                {displayStatus}
              </span>
              <SaveBadge tone={saveTone} isTemp={isTemp} />
            </div>
          }
        />

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
              icon="ti-message-2"
              badge={journalEntries.length}
            >
              Comments
            </TabButton>
            <TabButton
              active={tab === 'activity'}
              onClick={() => setTab('activity')}
              icon="ti-history"
            >
              Activity
            </TabButton>
          </div>
        )}

        {/* Body */}
        {tab === 'activity' && !isTemp ? (
          <div className="border-b border-border">
            <TaskActivityPanel taskId={task.id} />
          </div>
        ) : tab === 'details' || isTemp ? (
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
            onOpenRelated={onOpenTask}
            presence={presence}
            canDelete={canDelete}
            canEditStatus={canEditStatus}
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

        {/* Sticky footer — Save and Close are deliberately distinct
            actions. Save flushes the pending title (which only auto-
            commits on blur) and keeps you in the modal so you can
            keep editing; Close dismisses. Solid bg + top shadow so
            the bar reads cleanly as content scrolls under it rather
            than blending with the modal body. */}
        {!isTemp && (
          <div className="sticky bottom-0 z-10 px-4 py-3 bg-surface border-t border-border shadow-[0_-4px_12px_-6px_rgba(15,23,42,0.08)] flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-surface-2 active:bg-surface-3 text-text-2 hover:text-text transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => {
                // Commit any pending title — title only persists on blur,
                // so clicking Save without first blurring would lose it.
                // Stays in the modal so the user can keep editing.
                handleTitleBlur()
              }}
              disabled={saveTone === 'saving'}
              className={`text-xs px-3.5 py-1.5 rounded-md font-semibold transition-all inline-flex items-center gap-1.5 disabled:opacity-70 ${
                saveTone === 'saved'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-info text-white hover:opacity-90 active:scale-[0.98]'
              }`}
            >
              <i
                className={`ti ${
                  saveTone === 'saving'
                    ? 'ti-loader-2 animate-spin'
                    : saveTone === 'saved'
                      ? 'ti-check'
                      : 'ti-device-floppy'
                } text-sm`}
              />
              {saveTone === 'saving'
                ? 'Saving…'
                : saveTone === 'saved'
                  ? 'Saved'
                  : 'Save'}
              <kbd className="hidden sm:inline text-[9px] text-white/70 border border-white/30 rounded px-1 ml-0.5">
                ⌘S
              </kbd>
            </button>
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
  onOpenRelated,
  presence,
  canDelete = true,
  canEditStatus = true,
}) {
  const { data: deps = { blockedBy: [] } } = useTaskDependencies(task.id)
  const openBlockers = (deps.blockedBy ?? []).filter(
    (b) => b.status !== 'Done',
  )

  function handleStatusChange(next) {
    if (next === 'Done' && openBlockers.length > 0) {
      const ok = confirm(
        `This task has ${openBlockers.length} open blocker${openBlockers.length === 1 ? '' : 's'}:\n\n` +
          openBlockers.map((b) => `• ${b.title}`).join('\n') +
          '\n\nMark Done anyway?',
      )
      if (!ok) return
    }
    updateField('status', next)
  }

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

      {/* Presence banner — only visible when someone else also has
          this task open. Avatar stack on the left, "editing" warning
          on the right when any of them are typing. Goal is awareness,
          not collision avoidance: it just nudges you to wait or talk
          to them rather than fighting last-write-wins. */}
      {presence && presence.others.length > 0 && (
        <div className="mx-5 mt-3 px-3 py-2 rounded-md border border-info-bg bg-info-bg/40 text-info-text text-xs flex items-center gap-2 flex-wrap">
          <AvatarStack
            people={presence.others.map((o) => ({
              id: o.user_id,
              name: o.name,
              color: o.color,
              initials: o.avatar_initials,
            }))}
            size="xs"
            max={4}
          />
          <span className="font-medium">
            {presence.others.length === 1
              ? `${firstName(presence.others[0].name)} is also viewing this`
              : `${presence.others.length} others are also viewing this`}
          </span>
          {presence.anyEditing && (
            <span className="ml-auto inline-flex items-center gap-1 text-warning-text font-semibold">
              <span className="relative inline-flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-warning-text opacity-60 motion-safe:animate-ping" />
                <span className="relative w-1.5 h-1.5 rounded-full bg-warning-text" />
              </span>
              editing — your save may overwrite theirs
            </span>
          )}
        </div>
      )}

      {/* Title + source — bigger, bolder heading; the modal's "page
          title" feel that Notion / Linear use. */}
      <div className="px-5 pt-4 pb-3">
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => presence?.setEditing?.(true)}
          onBlur={(e) => {
            presence?.setEditing?.(false)
            handleTitleBlur(e)
          }}
          rows={2}
          disabled={isTemp}
          placeholder="Untitled task"
          className="w-full text-lg sm:text-xl font-semibold leading-snug tracking-tight bg-transparent outline-none resize-none focus:bg-surface-2 rounded px-1 -mx-1 disabled:opacity-60 placeholder:text-text-3"
        />
        <div className="text-[11px] text-text-3 mt-1 inline-flex items-center gap-1.5">
          <i className="ti ti-history text-xs" />
          Captured · {task.source ?? 'Manual entry'}
        </div>
      </div>

      {/* Fields */}
      <div className="px-5 pb-3">
        <FieldRow label="PIC" icon="ti-user">
          {/* Avatar inline so the assignee is visually obvious before
              you even read the dropdown — matches how Linear/Monday
              show people in property rows. */}
          <Avatar person={task.pic} size="sm" />
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

        <FieldRow label="Start date" icon="ti-calendar-plus">
          <input
            type="date"
            value={task.start_date ?? ''}
            max={task.due_date ?? undefined}
            onChange={(e) =>
              updateField('start_date', e.target.value || null)
            }
            disabled={isTemp}
            className="text-sm bg-surface border border-border rounded px-2 py-1 hover:bg-surface-2 cursor-pointer disabled:opacity-60"
          />
          <span className="text-[11px] text-text-3">
            when work begins (optional)
          </span>
          {task.start_date && task.due_date && task.start_date > task.due_date && (
            <span className="text-[10px] text-danger-text">
              after due date
            </span>
          )}
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
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={isTemp || !canEditStatus}
            title={
              canEditStatus
                ? undefined
                : 'PICs cannot change task status. Ask an editor or owner.'
            }
            className="text-sm bg-surface border border-border rounded px-2 py-1 hover:bg-surface-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <option value="Open">Open</option>
            <option value="In progress">In progress</option>
            <option value="Ongoing">Ongoing</option>
            <option value="Done">Done</option>
          </select>
          {!canEditStatus && (
            <span className="text-[10px] uppercase tracking-wider text-text-3 bg-surface-2 px-1.5 py-0.5 rounded">
              Read only
            </span>
          )}
          {openBlockers.length > 0 && (
            <span className="text-[11px] text-warning-text inline-flex items-center gap-1">
              <i className="ti ti-link text-xs" />
              {openBlockers.length} open blocker
              {openBlockers.length === 1 ? '' : 's'}
            </span>
          )}
        </FieldRow>

        <FieldRow label="Subtasks" icon="ti-list-check">
          <SubtasksField
            subtasks={task.subtasks ?? []}
            onChange={(next) => updateField('subtasks', next)}
            disabled={isTemp}
          />
        </FieldRow>

        <FieldRow label="Dependencies" icon="ti-link">
          <DependenciesField
            taskId={task.id}
            disabled={isTemp}
            onOpenRelated={onOpenRelated}
          />
        </FieldRow>

        <FieldRow label="Watchers" icon="ti-users">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(task.watchers ?? []).map((w) => (
              <span
                key={w.id}
                className="text-[11px] pl-0.5 pr-1.5 py-0.5 rounded-full inline-flex items-center gap-1 border border-border bg-surface hover:bg-surface-2 transition-colors"
              >
                <Avatar person={w} size="xs" />
                <span>{w.name.split(' ')[0]}</span>
                <button
                  onClick={() =>
                    removeWatcher.mutate({
                      taskId: task.id,
                      personId: w.id,
                    })
                  }
                  disabled={isTemp}
                  className="text-text-3 hover:text-text"
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

      {/* Footer — owner-only delete affordance. Editors + PICs simply
          don't see the button; phase-27 RLS rejects their attempts at
          the server too, and the API surfaces a clear error toast. */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border-t border-border rounded-b-2xl mt-auto">
        {canDelete ? (
          <button
            onClick={handleDelete}
            disabled={isTemp}
            className="text-xs px-2 py-1 rounded text-danger-text hover:bg-danger-bg inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <i className="ti ti-trash text-sm" />
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="text-[11px] text-text-3">
          <kbd className="px-1 border border-border rounded">⌘↵</kbd> close ·{' '}
          <kbd className="px-1 border border-border rounded">n</kbd> comments ·{' '}
          <kbd className="px-1 border border-border rounded">a</kbd> activity
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

function firstName(full) {
  if (!full) return 'Someone'
  return full.split(' ')[0]
}
