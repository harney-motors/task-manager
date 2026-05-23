import { useMemo, useState } from 'react'
import {
  useDeleteTask,
  useDepartments,
  usePeople,
  useTasks,
  useUpdateTask,
} from '../lib/queries'
import { isOverdue } from '../lib/dates'
import { picDot, picPill } from '../lib/colors'
import { addWatcher } from '../api/watchers'
import { exportTasksToCsv } from '../lib/exportCsv'
import { useToast } from '../components/Toast'
import BulkActionBar from '../components/BulkActionBar'
import TaskRow from '../components/TaskRow'
import ShareModal from '../components/ShareModal'

// Sentinel value used as `selectedPicId` to surface the unassigned bucket
// (tasks with pic_id === null). Distinct from any UUID so it can't collide.
const UNASSIGNED = '__unassigned__'

// `selectedPicId` and `onSelectPic` are optional — when passed, PicView
// becomes controlled and the parent owns the selection (used by the
// search palette to jump directly to a person). When omitted, PicView
// defaults to the first PIC with tasks.
export default function PicView({ onOpenTask, selectedPicId: controlledId, onSelectPic }) {
  const { data: people = [] } = usePeople()
  const { data: departments = [] } = useDepartments()
  const { data: tasks = [], isLoading } = useTasks()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const showToast = useToast()
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [selectionShareOpen, setSelectionShareOpen] = useState(false)

  const unassignedCount = useMemo(
    () => tasks.filter((t) => !t.pic_id && t.status !== 'Done').length,
    [tasks],
  )

  const defaultPicId = useMemo(() => {
    const withTasks = people.find((p) =>
      tasks.some((t) => t.pic_id === p.id),
    )
    return withTasks?.id ?? people[0]?.id ?? null
  }, [people, tasks])

  const [internalPicId, setInternalPicId] = useState(defaultPicId)
  const selectedPicId = controlledId ?? internalPicId
  const setSelectedPicId = onSelectPic ?? setInternalPicId

  const [shareOpen, setShareOpen] = useState(false)

  // Selection helpers
  function toggleSelection(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function bulkUpdate(fields, label) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const results = await Promise.allSettled(
      ids.map(
        (id) =>
          new Promise((resolve, reject) =>
            updateTask.mutate(
              { id, ...fields },
              { onSuccess: resolve, onError: reject },
            ),
          ),
      ),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - ok
    showToast(
      failed === 0
        ? `${label} on ${ok} task${ok === 1 ? '' : 's'}`
        : `${label}: ${ok} ok, ${failed} failed`,
      { type: failed === 0 ? 'success' : 'error' },
    )
    clearSelection()
  }

  async function bulkAddWatcher(picId) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0 || !picId) return
    const results = await Promise.allSettled(
      ids.map((tid) => addWatcher(tid, picId)),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - ok
    showToast(
      failed === 0
        ? `Watcher added to ${ok}.`
        : `Added to ${ok}, ${failed} failed`,
      { type: failed === 0 ? 'success' : 'error' },
    )
    clearSelection()
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (
      !confirm(
        `Delete ${ids.length} task${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
      )
    )
      return
    const results = await Promise.allSettled(
      ids.map(
        (id) =>
          new Promise((resolve, reject) =>
            deleteTask.mutate(id, { onSuccess: resolve, onError: reject }),
          ),
      ),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - ok
    showToast(
      failed === 0
        ? `Deleted ${ok} task${ok === 1 ? '' : 's'}`
        : `Deleted ${ok}, failed ${failed}`,
      { type: failed === 0 ? 'success' : 'error' },
    )
    clearSelection()
  }

  const isUnassigned = selectedPicId === UNASSIGNED
  const effectivePicId = isUnassigned
    ? UNASSIGNED
    : people.some((p) => p.id === selectedPicId)
      ? selectedPicId
      : defaultPicId

  const selectedPic =
    !isUnassigned && people.find((p) => p.id === effectivePicId)
  const picTasks = useMemo(
    () =>
      isUnassigned
        ? tasks.filter((t) => !t.pic_id)
        : tasks.filter((t) => t.pic_id === effectivePicId),
    [tasks, effectivePicId, isUnassigned],
  )
  const activeCount = picTasks.filter((t) => t.status !== 'Done').length
  const overdueCount = picTasks.filter(
    (t) => t.status !== 'Done' && isOverdue(t.due_date),
  ).length

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Chip selector */}
      <div className="p-4 border-b border-border flex flex-wrap gap-1.5">
        {people.map((p) => {
          const count = tasks.filter(
            (t) => t.pic_id === p.id && t.status !== 'Done',
          ).length
          const isSelected = p.id === effectivePicId && !isUnassigned
          return (
            <button
              key={p.id}
              onClick={() => setSelectedPicId(p.id)}
              className={`px-2.5 py-1 rounded-md text-xs inline-flex items-center gap-1.5 border transition-colors ${
                isSelected
                  ? 'bg-surface-2 border-border-strong text-text font-medium'
                  : 'border-border text-text-2 hover:text-text hover:bg-surface-2'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${picDot(p.color)}`} />
              {p.name.split(' ')[0]}
              {count > 0 && <span className="text-text-3">{count}</span>}
            </button>
          )
        })}
        {/* Unassigned bucket — surfaced even when count is 0 so the user
            can verify nothing is missing an owner. */}
        <button
          onClick={() => setSelectedPicId(UNASSIGNED)}
          className={`px-2.5 py-1 rounded-md text-xs inline-flex items-center gap-1.5 border transition-colors ${
            isUnassigned
              ? 'bg-surface-2 border-border-strong text-text font-medium'
              : 'border-border text-text-2 hover:text-text hover:bg-surface-2'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-text-3/40 border border-text-3/60" />
          Unassigned
          {unassignedCount > 0 && (
            <span className="text-text-3">{unassignedCount}</span>
          )}
        </button>
      </div>

      {/* Header */}
      {selectedPic && (
        <div className="px-4 py-3 bg-surface-2 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${picPill(selectedPic.color)}`}
            >
              {selectedPic.initials}
            </div>
            <div>
              <div className="text-sm font-medium">{selectedPic.name}</div>
              <div className="text-xs text-text-2">
                {selectedPic.title}
                {' · '}
                {activeCount} active
                {overdueCount > 0 && (
                  <span className="text-danger-text font-medium">
                    {' · '}
                    {overdueCount} overdue
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShareOpen(true)}
            disabled={activeCount === 0}
            className="text-xs font-medium bg-success text-white px-3 py-1.5 rounded inline-flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90"
          >
            <i className="ti ti-brand-whatsapp text-sm" />
            Share to WhatsApp
          </button>
        </div>
      )}

      {isUnassigned && (
        <div className="px-4 py-3 bg-surface-2 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-surface border border-dashed border-border-strong flex items-center justify-center text-text-3">
            <i className="ti ti-user-question text-base" />
          </div>
          <div>
            <div className="text-sm font-medium">Unassigned</div>
            <div className="text-xs text-text-2">
              Tasks without a PIC ·{' '}
              {activeCount} active
              {overdueCount > 0 && (
                <span className="text-danger-text font-medium">
                  {' · '}
                  {overdueCount} overdue
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onClear={clearSelection}
          onSetStatus={(v) => bulkUpdate({ status: v }, `Status → "${v}"`)}
          onSetPriority={(v) => bulkUpdate({ priority: v }, `Priority → "${v}"`)}
          onSetPic={(v) =>
            bulkUpdate({ pic_id: v || null }, 'PIC reassigned')
          }
          onAddWatcher={bulkAddWatcher}
          onSetDept={(v) =>
            bulkUpdate({ department_id: v || null }, 'Department updated')
          }
          onSetDue={(v) =>
            bulkUpdate({ due_date: v || null }, v ? `Due → ${v}` : 'Due cleared')
          }
          onShareSelected={() => setSelectionShareOpen(true)}
          onExportCsv={() => {
            const selected = picTasks.filter((t) => selectedIds.has(t.id))
            exportTasksToCsv(selected, {
              filename: `tickd-pic-${new Date().toISOString().slice(0, 10)}.csv`,
              departments,
            })
            showToast(`Exported ${selected.length} task${selected.length === 1 ? '' : 's'}.`)
          }}
          onDelete={bulkDelete}
          people={people}
          departments={departments}
        />
      )}

      {/* Task list */}
      <div className="px-4">
        {isLoading ? (
          <div className="py-10 text-center text-xs text-text-3">Loading…</div>
        ) : picTasks.length === 0 ? (
          <div className="py-10 text-center text-xs text-text-3">
            {isUnassigned
              ? 'Every task has an owner.'
              : selectedPic
                ? `${selectedPic.name.split(' ')[0]} has no tasks`
                : 'No PIC selected'}
          </div>
        ) : (
          picTasks.map((t) => (
            <SelectableTaskRow
              key={t.id}
              task={t}
              selected={selectedIds.has(t.id)}
              anySelected={selectedIds.size > 0}
              onToggleSelect={() => toggleSelection(t.id)}
              onClick={() => onOpenTask(t.id)}
            />
          ))
        )}
      </div>

      {shareOpen && selectedPic && (
        <ShareModal
          pic={selectedPic}
          tasks={picTasks}
          onClose={() => setShareOpen(false)}
        />
      )}
      {selectionShareOpen && (
        <ShareModal
          tasks={picTasks.filter((t) => selectedIds.has(t.id))}
          selectionTitle={
            selectedPic
              ? `${selectedPic.name.split(' ')[0]} — selection (${selectedIds.size})`
              : `Selection (${selectedIds.size})`
          }
          onClose={() => setSelectionShareOpen(false)}
        />
      )}
    </div>
  )
}

// Adds a hover-revealed checkbox before each TaskRow. Once anything's
// selected the checkbox stays visible across the list so the user can
// extend the selection without hunting.
function SelectableTaskRow({ task, selected, anySelected, onToggleSelect, onClick }) {
  const isTemp = String(task.id).startsWith('temp-')
  return (
    <div
      className={`group flex items-center gap-2 -mx-4 px-4 transition-colors ${
        selected ? 'bg-info-bg/60' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        disabled={isTemp}
        aria-label="Select task"
        className={`flex-shrink-0 cursor-pointer transition-opacity ${
          selected || anySelected
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100'
        }`}
      />
      <div className="flex-1 min-w-0">
        <TaskRow task={task} onClick={onClick} />
      </div>
    </div>
  )
}
