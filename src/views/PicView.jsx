import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useAuth } from '../auth/AuthProvider'
import {
  useCreateTask,
  useDepartments,
  usePeople,
  useTasks,
  useUpdateTask,
} from '../lib/queries'
import { isOverdue } from '../lib/dates'
import { picDot, picPill } from '../lib/colors'
import { addWatcher } from '../api/watchers'
import { exportTasksToCsv } from '../lib/exportCsv'
import { bulkDeleteWithUndo } from '../lib/deferredBulkDelete'
import {
  applyTaskFilters,
  readFiltersFromParams,
  readGroupingFromParams,
} from '../lib/applyTaskFilters'
import { applyTaskGrouping } from '../lib/applyTaskGrouping'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../components/Toast'
import BulkActionBar from '../components/BulkActionBar'
import TaskFilterBar from '../components/TaskFilterBar'
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
  const createTask = useCreateTask()
  const queryClient = useQueryClient()
  const { workspace } = useAuth()
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

  function bulkDelete() {
    const selectedTasks = picTasks.filter((t) => selectedIds.has(t.id))
    if (selectedTasks.length === 0) return
    bulkDeleteWithUndo({
      tasks: selectedTasks,
      queryClient,
      workspaceId: workspace?.id,
      showToast,
    })
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
  // URL-driven secondary filters + group/sort. Default group=status
  // because that's the most useful within-PIC slice.
  const [searchParams] = useSearchParams()
  const sideFilters = readFiltersFromParams(searchParams)
  const { group, sort } = readGroupingFromParams(searchParams, {
    defaultGroup: 'status',
    defaultSort: 'due',
  })
  const picTasks = useMemo(() => {
    const base = isUnassigned
      ? tasks.filter((t) => !t.pic_id)
      : tasks.filter((t) => t.pic_id === effectivePicId)
    return applyTaskFilters(base, { ...sideFilters, picId: 'all' })
  }, [tasks, effectivePicId, isUnassigned, sideFilters])
  const taskGroups = useMemo(
    () => applyTaskGrouping(picTasks, { group, sort, people, departments }),
    [picTasks, group, sort, people, departments],
  )
  const activeCount = picTasks.filter((t) => t.status !== 'Done').length
  const overdueCount = picTasks.filter(
    (t) => t.status !== 'Done' && isOverdue(t.due_date),
  ).length

  // ---- Drag-to-reassign --------------------------------------------
  // Drag any task row onto a PIC chip (or Unassigned) to reassign.
  // distance:8 keeps clicks-vs-drags clearly separated; below that
  // threshold the row click still opens the modal.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )
  const [draggingTaskId, setDraggingTaskId] = useState(null)
  function handleDragEnd(e) {
    setDraggingTaskId(null)
    const overId = e.over?.id
    if (!overId) return
    // overId format: 'pic-<id>' or 'pic-unassigned'
    const m = String(overId).match(/^pic-(.+)$/)
    if (!m) return
    const target = m[1] === 'unassigned' ? null : m[1]
    const taskId = e.active.id
    const t = tasks.find((x) => x.id === taskId)
    if (!t || t.pic_id === target) return
    updateTask.mutate(
      { id: taskId, pic_id: target },
      {
        onSuccess: () => {
          const name =
            target == null
              ? 'Unassigned'
              : people.find((p) => p.id === target)?.name?.split(' ')[0] ??
                'new PIC'
          showToast(`Reassigned to ${name}`)
        },
      },
    )
  }
  const draggingTask = draggingTaskId
    ? tasks.find((t) => t.id === draggingTaskId)
    : null

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setDraggingTaskId(e.active.id)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingTaskId(null)}
    >
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Chip selector — tighter padding on phone so the strip claims less
          vertical space when there are 10+ people. */}
      <div className="px-3 py-2 sm:p-4 border-b border-border flex flex-wrap gap-1 sm:gap-1.5">
        {people.map((p) => {
          const count = tasks.filter(
            (t) => t.pic_id === p.id && t.status !== 'Done',
          ).length
          const isSelected = p.id === effectivePicId && !isUnassigned
          return (
            <DroppablePicChip
              key={p.id}
              dropId={`pic-${p.id}`}
              onClick={() => setSelectedPicId(p.id)}
              isSelected={isSelected}
            >
              <span className={`w-2 h-2 rounded-full ${picDot(p.color)}`} />
              {p.name.split(' ')[0]}
              {count > 0 && <span className="text-text-3">{count}</span>}
            </DroppablePicChip>
          )
        })}
        {/* Unassigned bucket — surfaced even when count is 0 so the user
            can verify nothing is missing an owner. */}
        <DroppablePicChip
          dropId="pic-unassigned"
          onClick={() => setSelectedPicId(UNASSIGNED)}
          isSelected={isUnassigned}
        >
          <span className="w-2 h-2 rounded-full bg-text-3/40 border border-text-3/60" />
          Unassigned
          {unassignedCount > 0 && (
            <span className="text-text-3">{unassignedCount}</span>
          )}
        </DroppablePicChip>
      </div>

      {/* Header — compact on phone: smaller avatar, share button collapses
          to an icon-only pill so the row reads in one line. */}
      {selectedPic && (
        <div className="px-3 py-2 sm:px-4 sm:py-3 bg-surface-2 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[11px] sm:text-sm font-medium flex-shrink-0 ${picPill(selectedPic.color)}`}
            >
              {selectedPic.initials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{selectedPic.name}</div>
              <div className="text-[11px] sm:text-xs text-text-2 truncate">
                <span className="hidden sm:inline">{selectedPic.title} · </span>
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
            className="text-[11px] sm:text-xs font-medium bg-success text-white px-2 py-1 sm:px-3 sm:py-1.5 rounded inline-flex items-center gap-1 sm:gap-1.5 disabled:opacity-50 hover:opacity-90 flex-shrink-0"
            aria-label="Share to WhatsApp"
            title="Share to WhatsApp"
          >
            <i className="ti ti-brand-whatsapp text-sm" />
            <span className="hidden sm:inline">Share to WhatsApp</span>
            <span className="sm:hidden">Share</span>
          </button>
        </div>
      )}

      {isUnassigned && (
        <div className="px-3 py-2 sm:px-4 sm:py-3 bg-surface-2 border-b border-border flex items-center gap-2.5 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-surface border border-dashed border-border-strong flex items-center justify-center text-text-3 flex-shrink-0">
            <i className="ti ti-user-question text-sm sm:text-base" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">Unassigned</div>
            <div className="text-[11px] sm:text-xs text-text-2 truncate">
              <span className="hidden sm:inline">Tasks without a PIC · </span>
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

      {/* Secondary filters + group/sort. PIC filter hidden (implicit
          from the chip strip above). */}
      <TaskFilterBar
        hide={['picId']}
        defaultGroup="status"
        defaultSort="due"
      />

      {/* Quick-add scoped to the current PIC. Hidden until a PIC chip
          (or Unassigned) is actively selected. */}
      {(selectedPic || isUnassigned) && (
        <PicQuickAdd
          label={
            selectedPic
              ? `Add task for ${selectedPic.name.split(' ')[0]}`
              : 'Add unassigned task'
          }
          onCreate={(title) =>
            createTask.mutate({
              title,
              pic_id: selectedPic?.id ?? null,
              source: 'PIC view',
            })
          }
        />
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

      {/* Task list — driven by URL group/sort via applyTaskGrouping. */}
      <div>
        {isLoading ? (
          <div className="py-10 px-4 text-center text-xs text-text-3">
            Loading…
          </div>
        ) : picTasks.length === 0 ? (
          <div className="py-10 px-4 text-center text-xs text-text-3">
            {isUnassigned
              ? 'Every task has an owner.'
              : selectedPic
                ? `${selectedPic.name.split(' ')[0]} has no tasks`
                : 'No PIC selected'}
          </div>
        ) : (
          taskGroups.map((g) => (
            <TaskGroupSection
              key={g.key}
              label={g.label}
              count={g.tasks.length}
            >
              {g.tasks.map((t) => (
                <DraggableSelectableRow
                  key={t.id}
                  task={t}
                  selected={selectedIds.has(t.id)}
                  anySelected={selectedIds.size > 0}
                  onToggleSelect={() => toggleSelection(t.id)}
                  onClick={() => onOpenTask(t.id)}
                />
              ))}
            </TaskGroupSection>
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
    <DragOverlay>
      {draggingTask ? (
        <div
          className={`text-xs px-2 py-1 rounded shadow-lg ${picPill(draggingTask.pic?.color)} max-w-[260px] truncate -rotate-1`}
        >
          {draggingTask.title}
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  )
}

// ============================================================
// Generic group section — collapsible header + child rows
// ============================================================
//
// When `label` is null/empty we render no header (used when
// applyTaskGrouping returns a single "all" group, i.e. group=none).
// State is per-mount (resets when you switch PICs), which feels
// right: a fresh chip selection should open with everything visible.
export function TaskGroupSection({ label, count, children }) {
  const [open, setOpen] = useState(true)
  if (!label) {
    // Single ungrouped group — just render the rows in a padded
    // wrapper, no header.
    return <div className="px-3 sm:px-4">{children}</div>
  }
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-left bg-surface-2/40 hover:bg-surface-2 border-b border-border"
      >
        <i
          className={`ti ${open ? 'ti-chevron-down' : 'ti-chevron-right'} text-xs text-text-3`}
        />
        <span className="text-[11px] uppercase tracking-wider text-text-2 font-medium">
          {label}
        </span>
        <span className="text-[11px] text-text-3">· {count}</span>
      </button>
      {open && <div className="px-3 sm:px-4">{children}</div>}
    </div>
  )
}

// ============================================================
// PIC-scoped quick add
// ============================================================
//
// Lighter than the top-level QuickEntry: no smart detection, no
// voice — the PIC is whatever the parent says it is (the chip
// selector). Just title in, task out.
function PicQuickAdd({ label, onCreate }) {
  const [value, setValue] = useState('')
  function submit(e) {
    e.preventDefault()
    const title = value.trim()
    if (!title) return
    setValue('')
    onCreate(title)
  }
  return (
    <form
      onSubmit={submit}
      className="px-4 py-2 border-b border-border flex items-center gap-2 bg-surface-2/40"
    >
      <i className="ti ti-plus text-text-3 text-sm flex-shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`${label} — Enter to save`}
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-text-3 min-w-0"
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="text-[11px] px-2.5 py-1 rounded bg-info text-white font-medium disabled:opacity-50"
      >
        Add
      </button>
    </form>
  )
}

// ============================================================
// Drag/drop helpers
// ============================================================

// A draggable wrapper around SelectableTaskRow. The drag activation
// constraint (distance: 8) keeps row click vs. drag clearly separated.
function DraggableSelectableRow(props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.task.id,
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: 'auto' }}
      className={isDragging ? 'opacity-30' : ''}
    >
      <SelectableTaskRow {...props} />
    </div>
  )
}

// A droppable PIC chip. Wraps a button + the useDroppable hook so
// dropping a task onto it triggers the parent's handleDragEnd.
function DroppablePicChip({ dropId, onClick, isSelected, children }) {
  const { isOver, setNodeRef } = useDroppable({ id: dropId })
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[11px] sm:text-xs inline-flex items-center gap-1 sm:gap-1.5 border transition-colors ${
        isOver
          ? 'border-info bg-info-bg/60 text-info-text border-dashed'
          : isSelected
            ? 'bg-surface-2 border-border-strong text-text font-medium'
            : 'border-border text-text-2 hover:text-text hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  )
}

// Adds a hover-revealed checkbox before each TaskRow. Once anything's
// selected the checkbox stays visible across the list so the user can
// extend the selection without hunting.
function SelectableTaskRow({ task, selected, anySelected, onToggleSelect, onClick }) {
  const isTemp = String(task.id).startsWith('temp-')
  return (
    <div
      className={`group flex items-center gap-2.5 sm:gap-3 -mx-3 sm:-mx-4 px-3 sm:px-4 transition-colors cursor-pointer ${
        selected ? 'bg-info-bg/60' : 'hover:bg-surface-2'
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
        <TaskRow task={task} onClick={onClick} inWrapper />
      </div>
    </div>
  )
}
