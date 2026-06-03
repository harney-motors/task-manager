import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import {
  useDepartments,
  useMyPersonId,
  usePeople,
  useTasks,
  useUpdateTask,
} from '../lib/queries'
import { parseDate, startOfToday, addDays } from '../lib/dates'
import { useToast } from '../components/Toast'
import { addWatcher } from '../api/watchers'
import { exportTasksToCsv } from '../lib/exportCsv'
import { bulkDeleteWithUndo } from '../lib/deferredBulkDelete'
import BulkActionBar from '../components/BulkActionBar'
import ShareModal from '../components/ShareModal'
import TaskRow from '../components/TaskRow'
import TaskFilterBar from '../components/TaskFilterBar'
import {
  applyTaskFilters,
  readFiltersFromParams,
} from '../lib/applyTaskFilters'
import { useSearchParams } from 'react-router-dom'

// ListView — rebuilt as a single-column structured list with smart
// date-bucket sections. The old design was a 2-panel inbox-style split
// (Today & overdue | Up next capped at 6); it felt cramped on mobile
// and the cap meant tasks "disappeared" past the 7-day window.
//
// New shape:
//   • Sticky filter bar at the top (same chrome as Grid/Kanban/Cal)
//   • Status filter chips (Open / In progress / Ongoing / Done) — quick
//     scopes that compose with TaskFilterBar's filters
//   • Sections by due bucket, in calendar order:
//       - Overdue
//       - Today
//       - Tomorrow
//       - This week
//       - Next week
//       - Later
//       - No due date
//     Each section is sticky-headered with a count + collapsible.
//     Sections with no items are hidden unless filters are wide open.
//
// Keyboard nav (j/k/e/x/Esc) preserved.
// Bulk select + bulk action bar preserved.

const BUCKETS = [
  { id: 'overdue',  label: 'Overdue',     defaultOpen: true,  emphasis: 'danger' },
  { id: 'today',    label: 'Today',       defaultOpen: true },
  { id: 'tomorrow', label: 'Tomorrow',    defaultOpen: true },
  { id: 'week',     label: 'This week',   defaultOpen: true },
  { id: 'next',     label: 'Next week',   defaultOpen: false },
  { id: 'later',    label: 'Later',       defaultOpen: false },
  { id: 'none',     label: 'No due date', defaultOpen: false },
]

const STATUS_OPTIONS = [
  { id: 'all',         label: 'All',     icon: 'ti-stack' },
  { id: 'Open',        label: 'Open',    icon: 'ti-circle' },
  { id: 'In progress', label: 'Active',  icon: 'ti-progress' },
  { id: 'Ongoing',     label: 'Ongoing', icon: 'ti-rotate-clockwise' },
  { id: 'Done',        label: 'Done',    icon: 'ti-check' },
]

export default function ListView({ onOpenTask }) {
  const { workspace } = useAuth()
  const { data: tasks = [], isLoading } = useTasks()
  const { data: people = [] } = usePeople()
  const { data: departments = [] } = useDepartments()
  const updateTask = useUpdateTask()
  const showToast = useToast()
  const queryClient = useQueryClient()

  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [shareOpen, setShareOpen] = useState(false)
  const [focusedId, setFocusedId] = useState(null)
  const rowRefs = useRef(new Map())

  const today = startOfToday()
  const tomorrow = addDays(today, 1)
  const sevenOut = addDays(today, 7)
  const fourteenOut = addDays(today, 14)

  const [searchParams] = useSearchParams()
  const filters = readFiltersFromParams(searchParams)
  // Status quick-scope is local UI state (not URL'd) — it's the "filter
  // mode" of the list itself rather than a portable share-target.
  // Default 'open-ish' (everything but Done) so the list reads as
  // "what's actionable right now".
  const [statusScope, setStatusScope] = useState('open-ish')

  const meId = useMyPersonId()
  const filteredTasks = useMemo(() => {
    let pool = applyTaskFilters(tasks, filters, { meId })
    if (statusScope === 'open-ish') {
      pool = pool.filter((t) => t.status !== 'Done')
    } else if (statusScope !== 'all') {
      pool = pool.filter((t) => t.status === statusScope)
    }
    return pool
  }, [tasks, filters, statusScope, meId])

  // Bucket each task by due-bucket → sort within bucket by due asc then
  // priority. Tasks without a due date go to 'none' (regardless of status).
  const buckets = useMemo(() => {
    const out = {}
    for (const b of BUCKETS) out[b.id] = []
    for (const t of filteredTasks) {
      const id = bucketFor(t, { today, tomorrow, sevenOut, fourteenOut })
      out[id].push(t)
    }
    for (const id of Object.keys(out)) {
      out[id].sort((a, b) => {
        const ad = a.due_date ? parseDate(a.due_date).getTime() : Infinity
        const bd = b.due_date ? parseDate(b.due_date).getTime() : Infinity
        if (ad !== bd) return ad - bd
        return priorityRank(a) - priorityRank(b)
      })
    }
    return out
  }, [filteredTasks, today, tomorrow, sevenOut, fourteenOut])

  // Flattened ordering for j/k navigation across all sections.
  const allVisible = useMemo(
    () => BUCKETS.flatMap((b) => buckets[b.id] ?? []),
    [buckets],
  )

  function toggle(taskId) {
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
        ? `Watcher added to ${ok} task${ok === 1 ? '' : 's'}`
        : `Added to ${ok}, ${failed} failed`,
      { type: failed === 0 ? 'success' : 'error' },
    )
    clearSelection()
  }

  function bulkExportCsv() {
    const ids = selectedIds
    const selected = allVisible.filter((t) => ids.has(t.id))
    exportTasksToCsv(selected, {
      filename: `tickd-list-${new Date().toISOString().slice(0, 10)}.csv`,
      departments,
    })
    showToast(`Exported ${selected.length} task${selected.length === 1 ? '' : 's'}.`)
  }

  function bulkShare() {
    if (selectedIds.size === 0) return
    setShareOpen(true)
  }

  const sharedTasks = useMemo(
    () => allVisible.filter((t) => selectedIds.has(t.id)),
    [allVisible, selectedIds],
  )

  function bulkDelete() {
    const selectedTasks = allVisible.filter((t) => selectedIds.has(t.id))
    if (selectedTasks.length === 0) return
    bulkDeleteWithUndo({
      tasks: selectedTasks,
      queryClient,
      workspaceId: workspace?.id,
      showToast,
    })
    clearSelection()
  }

  // ---- Keyboard nav (j/k/e/x/Esc) — unchanged behavior ---------
  useEffect(() => {
    function isInField(target) {
      const tag = target?.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      )
    }
    function isOverlayOpen() {
      return !!document.querySelector('.fixed.inset-0.bg-black\\/40')
    }
    function move(delta) {
      if (allVisible.length === 0) return
      const idx = focusedId
        ? allVisible.findIndex((t) => t.id === focusedId)
        : -1
      const next =
        idx < 0
          ? delta > 0
            ? 0
            : allVisible.length - 1
          : (idx + delta + allVisible.length) % allVisible.length
      const target = allVisible[next]
      setFocusedId(target.id)
      const el = rowRefs.current.get(target.id)
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    function onKey(e) {
      if (isInField(e.target) || isOverlayOpen()) return
      if (e.key === 'j') {
        e.preventDefault()
        move(1)
      } else if (e.key === 'k') {
        e.preventDefault()
        move(-1)
      } else if ((e.key === 'e' || e.key === 'Enter') && focusedId) {
        e.preventDefault()
        onOpenTask(focusedId)
      } else if (e.key === 'x' && focusedId) {
        e.preventDefault()
        toggle(focusedId)
      } else if (e.key === 'Escape') {
        if (focusedId || selectedIds.size > 0) {
          e.preventDefault()
          setFocusedId(null)
          if (selectedIds.size > 0) clearSelection()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, allVisible.map((t) => t.id).join(','), selectedIds.size, onOpenTask])

  const totalVisible = allVisible.length

  return (
    <div className="space-y-3">
      {/* Sticky filter bar — same pattern as Grid / PIC / Calendar. */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden tickd-stick-below-topbar">
        <TaskFilterBar hide={['group', 'sort']} />
        {/* Status quick-scope row — sits inside the same chrome so it
            doesn't compete for vertical space. */}
        <div className="flex items-center gap-1.5 px-2 sm:px-3 py-2 border-t border-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { id: 'open-ish', label: 'Active', icon: 'ti-bolt' },
            ...STATUS_OPTIONS,
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusScope(s.id)}
              className={`text-[11px] sm:text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 flex-shrink-0 transition-colors ${
                statusScope === s.id
                  ? 'bg-info text-white font-medium'
                  : 'text-text-2 hover:text-text hover:bg-surface-2 border border-border'
              }`}
            >
              <i className={`ti ${s.icon} text-sm`} />
              {s.label}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-[10px] text-text-3 font-medium hidden sm:inline-flex">
            {totalVisible} {totalVisible === 1 ? 'task' : 'tasks'}
          </span>
        </div>
      </div>

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
            bulkUpdate(
              { due_date: v || null },
              v ? `Due set to ${v}` : 'Due cleared',
            )
          }
          onShareSelected={bulkShare}
          onExportCsv={bulkExportCsv}
          onDelete={bulkDelete}
          people={people}
          departments={departments}
          className="rounded-lg"
        />
      )}
      {shareOpen && sharedTasks.length > 0 && (
        <ShareModal
          tasks={sharedTasks}
          selectionTitle={`Selection (${sharedTasks.length})`}
          onClose={() => setShareOpen(false)}
        />
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="py-6 px-4">
            <SkeletonRows />
          </div>
        ) : totalVisible === 0 ? (
          <div className="py-16 text-center text-xs text-text-3">
            Nothing matches the current filters.
          </div>
        ) : (
          BUCKETS.map((b) => {
            const items = buckets[b.id] ?? []
            if (items.length === 0) return null
            return (
              <BucketSection
                key={b.id}
                bucket={b}
                tasks={items}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                onOpenTask={onOpenTask}
                onToggleSelect={toggle}
                focusedId={focusedId}
                rowRefs={rowRefs}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

// One date-bucket section. Sticky header with name + count + collapse
// chevron. Each task renders via SelectableTaskRow for bulk select.
function BucketSection({
  bucket,
  tasks,
  selectedIds,
  setSelectedIds,
  onOpenTask,
  onToggleSelect,
  focusedId,
  rowRefs,
}) {
  const [open, setOpen] = useState(bucket.defaultOpen)

  const allSelected =
    tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id))
  const someSelected =
    !allSelected && tasks.some((t) => selectedIds.has(t.id))

  function toggleAll(e) {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const t of tasks) next.delete(t.id)
      } else {
        for (const t of tasks) next.add(t.id)
      }
      return next
    })
  }

  const isDanger = bucket.emphasis === 'danger'

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className={`tickd-stick-below-topbar flex items-center gap-2 px-3 sm:px-4 py-2 cursor-pointer transition-colors bg-surface/95 backdrop-blur-md hover:bg-surface-2 ${
          isDanger ? 'text-danger-text' : ''
        }`}
        onClick={() => setOpen((x) => !x)}
      >
        <i
          className={`ti ${open ? 'ti-chevron-down' : 'ti-chevron-right'} text-sm flex-shrink-0 text-text-3`}
        />
        <input
          type="checkbox"
          ref={(el) => {
            if (el) el.indeterminate = someSelected
          }}
          checked={allSelected}
          onChange={() => {}}
          onClick={toggleAll}
          aria-label={`Select all in ${bucket.label}`}
          className="cursor-pointer flex-shrink-0"
        />
        <h2
          className={`text-[11px] uppercase tracking-wider font-semibold ${
            isDanger ? 'text-danger-text' : 'text-text-2'
          }`}
        >
          {bucket.label}
        </h2>
        <span className="text-[11px] text-text-3 font-medium">
          {tasks.length}
        </span>
      </div>
      {open && (
        <div className="px-3 sm:px-4">
          {tasks.map((t) => (
            <SelectableTaskRow
              key={t.id}
              task={t}
              selected={selectedIds.has(t.id)}
              onToggleSelect={() => onToggleSelect(t.id)}
              onClick={() => onOpenTask(t.id)}
              anySelected={selectedIds.size > 0}
              focused={focusedId === t.id}
              rowRef={(el) => {
                if (el) rowRefs.current.set(t.id, el)
                else rowRefs.current.delete(t.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Wrapper around TaskRow that adds a checkbox column on the left when
// either (a) something is selected globally, or (b) the user hovers
// the row. Keeps the default view clean and unobtrusive.
function SelectableTaskRow({
  task,
  selected,
  onToggleSelect,
  onClick,
  anySelected,
  focused = false,
  rowRef,
}) {
  const isTemp = String(task.id).startsWith('temp-')
  return (
    <div
      ref={rowRef}
      className={`group flex items-center gap-2.5 sm:gap-3 -mx-3 sm:-mx-4 px-3 sm:px-4 transition-colors cursor-pointer ${
        focused ? 'ring-2 ring-info ring-inset' : ''
      } ${
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
            : 'opacity-60 sm:opacity-0 sm:group-hover:opacity-100'
        }`}
      />
      <div className="flex-1 min-w-0">
        <TaskRow task={task} onClick={onClick} inWrapper />
      </div>
    </div>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-12 rounded-md bg-surface-2 animate-pulse" />
      ))}
    </div>
  )
}

// ---- helpers ----------------------------------------------------

function priorityRank(t) {
  return { High: 0, Medium: 1, Low: 2 }[t.priority] ?? 99
}

// Place a task into one of the date buckets. `today` / `tomorrow` /
// `sevenOut` / `fourteenOut` are calendar-Date objects (midnight).
function bucketFor(task, { today, tomorrow, sevenOut, fourteenOut }) {
  if (!task.due_date) return 'none'
  const d = parseDate(task.due_date)
  if (!d) return 'none'
  // Overdue trumps everything when task isn't Done.
  if (d < today && task.status !== 'Done') return 'overdue'
  if (sameDay(d, today)) return 'today'
  if (sameDay(d, tomorrow)) return 'tomorrow'
  if (d <= sevenOut) return 'week'
  if (d <= fourteenOut) return 'next'
  return 'later'
}

function sameDay(a, b) {
  return a.getTime() === b.getTime()
}
