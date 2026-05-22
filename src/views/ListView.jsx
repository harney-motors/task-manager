import { useMemo, useState } from 'react'
import {
  useDeleteTask,
  useDepartments,
  usePeople,
  useTasks,
  useUpdateTask,
} from '../lib/queries'
import { parseDate, startOfToday, addDays } from '../lib/dates'
import { useToast } from '../components/Toast'
import TaskRow from '../components/TaskRow'

export default function ListView({ onOpenTask }) {
  const { data: tasks = [], isLoading } = useTasks()
  const { data: people = [] } = usePeople()
  const { data: departments = [] } = useDepartments()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const showToast = useToast()

  const [selectedIds, setSelectedIds] = useState(() => new Set())

  const today = startOfToday()
  const sevenOut = addDays(today, 7)

  const todayAndOverdue = useMemo(
    () =>
      tasks
        .filter((t) => {
          if (t.status === 'Done') return false
          if (!t.due_date) return true
          return parseDate(t.due_date) <= today
        })
        .sort((a, b) => {
          const ad = a.due_date ? parseDate(a.due_date).getTime() : Infinity
          const bd = b.due_date ? parseDate(b.due_date).getTime() : Infinity
          return ad - bd
        }),
    [tasks, today],
  )

  const upcoming = useMemo(
    () =>
      tasks
        .filter((t) => {
          if (t.status === 'Done' || !t.due_date) return false
          const d = parseDate(t.due_date)
          return d > today && d <= sevenOut
        })
        .sort((a, b) => parseDate(a.due_date) - parseDate(b.due_date))
        .slice(0, 6),
    [tasks, today, sevenOut],
  )

  // Pool of selectable tasks across both panels — bulk ops act on
  // the union, so a select-all picks up rows from both columns.
  const allVisible = useMemo(
    () => [...todayAndOverdue, ...upcoming],
    [todayAndOverdue, upcoming],
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

  return (
    <div className="space-y-3">
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onClear={clearSelection}
          onSetStatus={(v) =>
            bulkUpdate({ status: v }, `Status set to "${v}"`)
          }
          onSetPic={(v) =>
            bulkUpdate({ pic_id: v || null }, 'PIC reassigned')
          }
          onSetDept={(v) =>
            bulkUpdate({ department_id: v || null }, 'Department updated')
          }
          onSetDue={(v) =>
            bulkUpdate(
              { due_date: v || null },
              v ? `Due set to ${v}` : 'Due cleared',
            )
          }
          onDelete={bulkDelete}
          people={people}
          departments={departments}
        />
      )}
      <div className="grid md:grid-cols-[1.5fr_1fr] gap-4">
        <Panel
          title="Today & overdue"
          count={todayAndOverdue.length}
          allTasks={todayAndOverdue}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
        >
          {isLoading ? (
            <Skeleton />
          ) : todayAndOverdue.length === 0 ? (
            <Empty msg="Nothing due today or overdue" />
          ) : (
            todayAndOverdue.map((t) => (
              <SelectableTaskRow
                key={t.id}
                task={t}
                selected={selectedIds.has(t.id)}
                onToggleSelect={() => toggle(t.id)}
                onClick={() => onOpenTask(t.id)}
                anySelected={selectedIds.size > 0}
              />
            ))
          )}
        </Panel>
        <Panel
          title="Up next"
          count={upcoming.length}
          allTasks={upcoming}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
        >
          {isLoading ? (
            <Skeleton />
          ) : upcoming.length === 0 ? (
            <Empty msg="Nothing in the next 7 days" />
          ) : (
            upcoming.map((t) => (
              <SelectableTaskRow
                key={t.id}
                task={t}
                selected={selectedIds.has(t.id)}
                onToggleSelect={() => toggle(t.id)}
                onClick={() => onOpenTask(t.id)}
                anySelected={selectedIds.size > 0}
              />
            ))
          )}
        </Panel>
      </div>
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
}) {
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

function Panel({
  title,
  count,
  allTasks,
  selectedIds,
  setSelectedIds,
  children,
}) {
  const allSelected =
    allTasks.length > 0 && allTasks.every((t) => selectedIds.has(t.id))
  const someSelected =
    !allSelected && allTasks.some((t) => selectedIds.has(t.id))

  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const t of allTasks) next.delete(t.id)
      } else {
        for (const t of allTasks) next.add(t.id)
      }
      return next
    })
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        {allTasks.length > 0 && (
          <input
            type="checkbox"
            ref={(el) => {
              if (el) el.indeterminate = someSelected
            }}
            checked={allSelected}
            onChange={toggleAll}
            title="Select all in this panel"
            aria-label="Select all"
            className="cursor-pointer"
          />
        )}
        <h2 className="text-sm font-medium">{title}</h2>
        {count > 0 && (
          <span className="text-[11px] text-text-3">· {count}</span>
        )}
      </div>
      <div className="px-4">{children}</div>
    </div>
  )
}

function Empty({ msg }) {
  return <div className="py-10 text-center text-xs text-text-3">{msg}</div>
}

function Skeleton() {
  return (
    <div className="py-4 space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 rounded-md bg-surface-2 animate-pulse" />
      ))}
    </div>
  )
}

// ============================================================
// Bulk action bar — mirrors Grid's, but full-width above both panels.
// ============================================================

function BulkActionBar({
  count,
  onClear,
  onSetStatus,
  onSetPic,
  onSetDept,
  onSetDue,
  onDelete,
  people,
  departments,
}) {
  return (
    <div className="bg-info text-white px-4 py-2 rounded-lg flex items-center gap-2 flex-wrap text-xs">
      <span className="font-medium">{count} selected</span>
      <button
        onClick={onClear}
        className="underline opacity-90 hover:opacity-100"
      >
        Clear
      </button>
      <div className="flex-1" />

      <BulkSelect onChange={onSetStatus} placeholder="Set status…">
        <option value="Open">Open</option>
        <option value="In progress">In progress</option>
        <option value="Ongoing">Ongoing</option>
        <option value="Done">Done</option>
      </BulkSelect>

      <BulkSelect onChange={onSetPic} placeholder="Set PIC…">
        <option value="">— Unassign —</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </BulkSelect>

      <BulkSelect onChange={onSetDept} placeholder="Set dept…">
        <option value="">— Clear —</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </BulkSelect>

      <input
        type="date"
        onChange={(e) => {
          if (e.target.value) {
            onSetDue(e.target.value)
            e.target.value = ''
          }
        }}
        className="text-xs bg-white/15 hover:bg-white/25 rounded px-2 py-1 border border-white/30 text-white cursor-pointer"
        title="Set due date"
      />

      <button
        onClick={onDelete}
        className="text-xs bg-danger-text/30 hover:bg-danger-text/50 rounded px-2 py-1 border border-white/30 font-medium"
      >
        Delete
      </button>
    </div>
  )
}

function BulkSelect({ onChange, placeholder, children }) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value !== '') {
          onChange(e.target.value)
          e.target.value = ''
        }
      }}
      className="text-xs bg-white/15 hover:bg-white/25 rounded px-2 py-1 border border-white/30 text-white cursor-pointer max-w-[140px]"
    >
      <option value="" className="text-text">
        {placeholder}
      </option>
      {children}
    </select>
  )
}
