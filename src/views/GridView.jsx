import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import {
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useDepartments,
  usePeople,
  useSavedFilters,
  useTasks,
  useUpdateTask,
} from '../lib/queries'
import { useSearchParams } from 'react-router-dom'
import { formatShortDate, isOverdue } from '../lib/dates'
import { picPill, statusPill } from '../lib/colors'
import { addWatcher } from '../api/watchers'
import { exportTasksToCsv } from '../lib/exportCsv'
import { bulkDeleteWithUndo } from '../lib/deferredBulkDelete'
import {
  applyTaskFilters,
  readFiltersFromParams,
  readGroupingFromParams,
} from '../lib/applyTaskFilters'
import { applyTaskGrouping } from '../lib/applyTaskGrouping'
import { useToast } from '../components/Toast'
import BulkActionBar from '../components/BulkActionBar'
import TaskFilterBar from '../components/TaskFilterBar'
import TaskGroupSection from '../components/TaskGroupSection'
import ShareModal from '../components/ShareModal'
import Skeleton from '../components/Skeleton'

// Desktop-only grid template. On mobile the row falls back to a
// stacked TaskRow-style layout (see <GridRow>) because an 8-column
// table is unusable on a phone — column widths sum to ~700px+.
const COLS =
  'hidden sm:grid grid-cols-[24px_28px_minmax(0,2.2fr)_140px_120px_120px_100px_110px] gap-2 px-3 sm:px-4 items-center'

const STATUS_ORDER = { Open: 0, 'In progress': 1, Ongoing: 2, Done: 3 }
const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 }

function compareTasks(a, b, field, dir) {
  let aVal, bVal
  switch (field) {
    case 'title':
      aVal = (a.title || '').toLowerCase()
      bVal = (b.title || '').toLowerCase()
      break
    case 'pic':
      // Empty PICs sort to the bottom regardless of direction
      aVal = a.pic?.name?.toLowerCase() ?? '￿'
      bVal = b.pic?.name?.toLowerCase() ?? '￿'
      break
    case 'due_date':
      // Null dates sort to the bottom
      aVal = a.due_date ?? '￿'
      bVal = b.due_date ?? '￿'
      break
    case 'status':
      aVal = STATUS_ORDER[a.status] ?? 99
      bVal = STATUS_ORDER[b.status] ?? 99
      break
    case 'priority':
      aVal = PRIORITY_ORDER[a.priority] ?? 99
      bVal = PRIORITY_ORDER[b.priority] ?? 99
      break
    default:
      return 0
  }
  if (aVal < bVal) return dir === 'asc' ? -1 : 1
  if (aVal > bVal) return dir === 'asc' ? 1 : -1
  return 0
}

export default function GridView({ onOpenTask, aiFilter, onFiltersChange }) {
  const { data: people = [] } = usePeople()
  const { data: tasks = [], isLoading } = useTasks()
  const { data: departments = [] } = useDepartments()
  const updateTask = useUpdateTask()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const { workspace } = useAuth()

  // Filters + group + sort all live in URL params now (shared with
  // PIC + Calendar views). Default group=status to match user's
  // stated preference.
  const [searchParams] = useSearchParams()
  const filters = readFiltersFromParams(searchParams)
  const { group, sort } = readGroupingFromParams(searchParams, {
    defaultGroup: 'status',
    defaultSort: 'due',
  })
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [shareOpen, setShareOpen] = useState(false)

  // Clear selection when the URL filters change so a selected row
  // that's no longer visible doesn't haunt the bulk bar.
  useEffect(() => {
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.picId,
    filters.deptId,
    filters.status,
    filters.priority,
    filters.tag,
  ])

  const filtered = useMemo(
    () => applyTaskFilters(tasks, filters),
    [tasks, filters],
  )

  const taskGroups = useMemo(
    () =>
      applyTaskGrouping(filtered, { group, sort, people, departments }),
    [filtered, group, sort, people, departments],
  )

  function update(taskId, field, value) {
    updateTask.mutate({ id: taskId, [field]: value })
  }

  function toggleSelection(taskId) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  const visibleIds = filtered.map((t) => t.id)
  const visibleSelectedCount = visibleIds.filter((id) => selectedIds.has(id)).length
  const allVisibleSelected =
    filtered.length > 0 && visibleSelectedCount === filtered.length

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        // Unselect every visible row, keep any others
        const next = new Set(prev)
        for (const id of visibleIds) next.delete(id)
        return next
      }
      const next = new Set(prev)
      for (const id of visibleIds) next.add(id)
      return next
    })
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
    if (failed === 0) {
      showToast(`${label} on ${ok} task${ok === 1 ? '' : 's'}`)
    } else {
      showToast(`${label}: ${ok} ok, ${failed} failed`, { type: 'error' })
    }
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
        ? `Watcher added to ${ok} task${ok === 1 ? '' : 's'}`
        : `Added to ${ok}, ${failed} failed`,
      { type: failed === 0 ? 'success' : 'error' },
    )
    clearSelection()
  }

  function bulkExportCsv() {
    const selected = filtered.filter((t) => selectedIds.has(t.id))
    exportTasksToCsv(selected, {
      filename: `tickd-grid-${new Date().toISOString().slice(0, 10)}.csv`,
      departments,
    })
    showToast(`Exported ${selected.length} task${selected.length === 1 ? '' : 's'}.`)
  }

  const sharedTasks = useMemo(
    () => filtered.filter((t) => selectedIds.has(t.id)),
    [filtered, selectedIds],
  )

  function bulkDelete() {
    const selectedTasks = filtered.filter((t) => selectedIds.has(t.id))
    if (selectedTasks.length === 0) return
    bulkDeleteWithUndo({
      tasks: selectedTasks,
      queryClient,
      workspaceId: workspace?.id,
      showToast,
    })
    clearSelection()
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Saved-filters bar — temporarily disabled while the underlying
          schema only knows pic/dept/status (no priority/tag). Wire
          back once useSavedFilters spec includes the new fields. */}
      <TaskFilterBar defaultGroup="status" defaultSort="due" />

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onClear={clearSelection}
          onSetStatus={(v) =>
            bulkUpdate({ status: v }, `Status set to "${v}"`)
          }
          onSetPriority={(v) =>
            bulkUpdate({ priority: v }, `Priority set to "${v}"`)
          }
          onSetPic={(v) =>
            bulkUpdate({ pic_id: v || null }, 'PIC reassigned')
          }
          onAddWatcher={bulkAddWatcher}
          onSetDept={(v) =>
            bulkUpdate({ department_id: v || null }, 'Department updated')
          }
          onSetDue={(v) =>
            bulkUpdate({ due_date: v || null }, v ? `Due set to ${v}` : 'Due cleared')
          }
          onShareSelected={() => setShareOpen(true)}
          onExportCsv={bulkExportCsv}
          onDelete={bulkDelete}
          people={people}
          departments={departments}
        />
      )}
      {shareOpen && sharedTasks.length > 0 && (
        <ShareModal
          tasks={sharedTasks}
          selectionTitle={`Selection (${sharedTasks.length})`}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* sm+ — horizontal-scroll table with 8 columns.
          phone — natural width; each <GridRow> stacks instead. */}
      <div className="sm:overflow-x-auto">
        <div className="sm:min-w-[800px]">
          <GridHeader
            allVisibleSelected={allVisibleSelected}
            indeterminate={visibleSelectedCount > 0 && !allVisibleSelected}
            onToggleAll={toggleAllVisible}
            anySelectable={filtered.length > 0}
          />
          {isLoading ? (
            <div className="px-4 py-3">
              <Skeleton rows={5} height={32} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-text-3">
              {tasks.length === 0
                ? 'No tasks yet.'
                : 'No tasks match these filters.'}
            </div>
          ) : (
            taskGroups.map((g) => (
              <TaskGroupSection
                key={g.key}
                label={g.label}
                count={g.tasks.length}
                padded={false}
              >
                {g.tasks.map((t) => (
                  <GridRow
                    key={t.id}
                    task={t}
                    people={people}
                    departments={departments}
                    isSelected={selectedIds.has(t.id)}
                    anySelected={selectedIds.size > 0}
                    onToggleSelect={() => toggleSelection(t.id)}
                    onOpen={() => onOpenTask(t.id)}
                    onUpdate={update}
                  />
                ))}
              </TaskGroupSection>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function GridHeader({
  allVisibleSelected,
  indeterminate,
  onToggleAll,
  anySelectable,
}) {
  return (
    <div
      className={`${COLS} py-2 border-b border-border-strong bg-surface text-[10px] uppercase tracking-wider text-text-2 font-medium`}
    >
      <div>
        <input
          type="checkbox"
          ref={(el) => {
            if (el) el.indeterminate = indeterminate
          }}
          checked={allVisibleSelected}
          onChange={onToggleAll}
          disabled={!anySelectable}
          className="cursor-pointer"
          aria-label="Select all visible"
        />
      </div>
      <div></div>
      <div>Task</div>
      <div>PIC</div>
      <div>Department</div>
      <div>Due</div>
      <div>Tags</div>
      <div>Status</div>
    </div>
  )
}

function GridRow({
  task,
  people,
  departments,
  isSelected,
  anySelected,
  onToggleSelect,
  onOpen,
  onUpdate,
}) {
  const overdue = isOverdue(task.due_date) && task.status !== 'Done'
  const done = task.status === 'Done'
  const displayStatus = overdue ? 'Overdue' : task.status
  const isTemp = String(task.id).startsWith('temp-')

  const stop = (e) => e.stopPropagation()

  return (
    <div
      onClick={onOpen}
      className={`group border-b border-border last:border-b-0 cursor-pointer transition-colors ${
        isSelected ? 'bg-info-bg/60' : 'hover:bg-surface-2'
      }`}
    >
      {/* ===== MOBILE LAYOUT (phone only) =====
          The 8-column inline-edit table is hostile on a phone: column
          widths force horizontal scroll and the editable selects are
          fat-finger nightmares. On mobile we collapse to a TaskRow-style
          stack — tap-to-open routes you to the modal for editing. */}
      <div className="sm:hidden flex items-start gap-2.5 px-3 py-2 text-xs">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={stop}
          disabled={isTemp}
          aria-label="Select row"
          className={`mt-0.5 flex-shrink-0 cursor-pointer transition-opacity ${
            isSelected || anySelected ? 'opacity-100' : 'opacity-60'
          }`}
        />
        <button
          onClick={(e) => {
            e.stopPropagation()
            onUpdate(task.id, 'status', done ? 'Open' : 'Done')
          }}
          disabled={isTemp}
          className="flex-shrink-0 text-text-3 hover:text-text disabled:opacity-50 mt-0.5"
          aria-label={done ? 'Mark as open' : 'Mark as done'}
        >
          <i
            className={`ti ${done ? 'ti-circle-check-filled text-success' : 'ti-circle'} text-base`}
          />
        </button>
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm font-medium line-clamp-2 ${done ? 'line-through text-text-3' : ''}`}
          >
            {task.title}
          </div>
          <div className="text-[11px] text-text-2 flex items-center gap-1.5 mt-1 flex-wrap">
            {task.pic ? (
              <span
                className={`px-1.5 py-px rounded text-[10px] font-medium ${picPill(task.pic.color)}`}
              >
                {task.pic.name.split(' ')[0]}
              </span>
            ) : (
              <span className="text-text-3 text-[10px]">Unassigned</span>
            )}
            {task.due_date && (
              <span className={overdue ? 'text-danger-text font-medium' : 'text-text-3'}>
                {formatShortDate(task.due_date)}
              </span>
            )}
          </div>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${statusPill(displayStatus)}`}
        >
          {displayStatus}
        </span>
      </div>

      {/* ===== DESKTOP LAYOUT (tablet+) ===== */}
      <div className={`${COLS} py-2 text-xs`}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={stop}
          disabled={isTemp}
          aria-label="Select row"
          className={`cursor-pointer transition-opacity ${
            isSelected || anySelected
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}
        />

        <button
          onClick={(e) => {
            e.stopPropagation()
            onUpdate(task.id, 'status', done ? 'Open' : 'Done')
          }}
          disabled={isTemp}
          className="text-text-3 hover:text-text disabled:opacity-50 flex items-center"
          aria-label={done ? 'Mark as open' : 'Mark as done'}
          title={done ? 'Mark as open' : 'Mark as done'}
        >
          {/* Circle for "mark done" — distinct from the selection
              checkbox so the two squares don't read the same. */}
          <i
            className={`ti ${done ? 'ti-circle-check-filled text-success' : 'ti-circle'} text-base`}
          />
        </button>

        <div
          className={`text-sm line-clamp-2 ${done ? 'line-through text-text-3' : ''}`}
        >
          {task.title}
        </div>

        <select
          value={task.pic_id ?? ''}
          onClick={stop}
          onChange={(e) => {
            e.stopPropagation()
            onUpdate(task.id, 'pic_id', e.target.value || null)
          }}
          disabled={isTemp}
          className="text-xs bg-transparent border border-transparent hover:border-border focus:border-border rounded px-1 py-0.5 cursor-pointer disabled:opacity-50 min-w-0"
        >
          <option value="">—</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          value={task.department_id ?? ''}
          onClick={stop}
          onChange={(e) => {
            e.stopPropagation()
            onUpdate(task.id, 'department_id', e.target.value || null)
          }}
          disabled={isTemp}
          className="text-xs bg-transparent border border-transparent hover:border-border focus:border-border rounded px-1 py-0.5 cursor-pointer disabled:opacity-50 min-w-0"
        >
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={task.due_date ?? ''}
          onClick={stop}
          onChange={(e) => {
            e.stopPropagation()
            onUpdate(task.id, 'due_date', e.target.value || null)
          }}
          disabled={isTemp}
          className={`text-xs bg-transparent border border-transparent hover:border-border focus:border-border rounded px-1 py-0.5 cursor-pointer disabled:opacity-50 min-w-0 ${
            overdue ? 'text-danger-text font-medium' : ''
          }`}
        />

        <div className="text-text-3 text-[11px] truncate">
          {(task.tags ?? []).length === 0 ? '—' : (task.tags ?? []).join(', ')}
        </div>

        <span
          className={`text-[11px] px-2 py-0.5 rounded-full font-medium justify-self-start ${statusPill(displayStatus)}`}
        >
          {displayStatus}
        </span>
      </div>
    </div>
  )
}

// (Local BulkActionBar / BulkSelect removed — replaced by the shared
// component at src/components/BulkActionBar.jsx.)

function FilterSelect({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs border border-border rounded px-2 py-1 bg-surface hover:bg-surface-2 cursor-pointer"
    >
      {children}
    </select>
  )
}

function SavedFiltersBar({ currentSpec, canSave, onApply }) {
  const { data: filters = [] } = useSavedFilters()
  const create = useCreateSavedFilter()
  const remove = useDeleteSavedFilter()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  function isCurrent(spec) {
    return (
      (spec.picId ?? 'all') === (currentSpec.picId ?? 'all') &&
      (spec.deptId ?? 'all') === (currentSpec.deptId ?? 'all') &&
      (spec.status ?? 'all') === (currentSpec.status ?? 'all')
    )
  }

  async function handleSave(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await create.mutateAsync({ name: trimmed, spec: currentSpec })
      setName('')
      setNaming(false)
    } catch {
      // toast handled by hook
    }
  }

  // Hide the bar when there's nothing to show.
  if (filters.length === 0 && !canSave) return null

  return (
    <div className="px-3 py-2 border-b border-border bg-surface-2/40 flex items-center gap-1.5 flex-wrap text-xs">
      {filters.length > 0 && (
        <>
          <span className="text-[10px] uppercase tracking-wider text-text-3 mr-1">
            Saved
          </span>
          {filters.map((f) => {
            const active = isCurrent(f.spec)
            return (
              <span
                key={f.id}
                className={`inline-flex items-center rounded-md border text-xs ${
                  active
                    ? 'border-info text-info bg-info-bg'
                    : 'border-border text-text-2'
                }`}
              >
                <button
                  onClick={() => onApply(f.spec)}
                  className="px-2 py-0.5 hover:text-text"
                  title="Apply"
                >
                  {f.name}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete saved filter "${f.name}"?`)) {
                      remove.mutate(f.id)
                    }
                  }}
                  className="px-1.5 py-0.5 text-text-3 hover:text-danger-text border-l border-current/20"
                  title="Delete"
                  aria-label={`Delete saved filter ${f.name}`}
                >
                  <i className="ti ti-x text-[10px]" />
                </button>
              </span>
            )
          })}
        </>
      )}
      {canSave && !naming && (
        <button
          onClick={() => setNaming(true)}
          className="text-text-3 hover:text-text text-xs px-2 py-0.5 underline"
        >
          + Save current
        </button>
      )}
      {naming && (
        <form onSubmit={handleSave} className="inline-flex items-center gap-1">
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (!name.trim()) setNaming(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setNaming(false)
                setName('')
              }
            }}
            placeholder="filter name"
            maxLength={50}
            className="text-xs px-2 py-0.5 border border-border rounded bg-surface w-32 outline-none focus:border-info"
          />
          <button
            type="submit"
            disabled={!name.trim() || create.isPending}
            className="text-xs px-2 py-0.5 rounded bg-info text-white disabled:opacity-50"
          >
            Save
          </button>
        </form>
      )}
    </div>
  )
}
