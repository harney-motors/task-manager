import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday as isTodayDF,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import {
  useDepartments,
  usePeople,
  useTasks,
  useUpdateTask,
  useWorkspaceBlockerMap,
} from '../lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { isOverdue } from '../lib/dates'
import { picPill } from '../lib/colors'
import { addWatcher } from '../api/watchers'
import { exportTasksToCsv } from '../lib/exportCsv'
import { bulkDeleteWithUndo } from '../lib/deferredBulkDelete'
import {
  applyTaskFilters,
  readFiltersFromParams,
} from '../lib/applyTaskFilters'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../components/Toast'
import BulkActionBar from '../components/BulkActionBar'
import TaskFilterBar from '../components/TaskFilterBar'
import ShareModal from '../components/ShareModal'
import TaskRow from '../components/TaskRow'

const RANGES = [
  { id: 'day',   label: 'Day' },
  { id: '1w',    label: '1 week' },
  { id: '2w',    label: '2 weeks' },
  { id: '4w',    label: '4 weeks' },
  { id: 'month', label: 'Month' },
]

const SPAN_DAYS = { '1w': 7, '2w': 14, '4w': 28 }

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toIso(date) {
  return format(date, 'yyyy-MM-dd')
}

export default function CalendarView({ onOpenTask }) {
  const { data: allTasks = [] } = useTasks()
  // URL-driven filters apply to the entire calendar (chips, day view,
  // bulk select). Memoised so heavy month views don't recompute on
  // unrelated re-renders.
  const [searchParams] = useSearchParams()
  const filters = readFiltersFromParams(searchParams)
  const tasks = useMemo(
    () => applyTaskFilters(allTasks, filters),
    [allTasks, filters],
  )
  const { data: people = [] } = usePeople()
  const { data: departments = [] } = useDepartments()
  const { data: blockerMap = new Map() } = useWorkspaceBlockerMap()
  const updateTask = useUpdateTask()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const { workspace } = useAuth()
  const [range, setRange] = useState('4w')
  const [anchor, setAnchor] = useState(() => new Date())
  const [activeId, setActiveId] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [shareOpen, setShareOpen] = useState(false)

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
  function exitSelectMode() {
    setSelectMode(false)
    clearSelection()
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
    const selectedTasks = tasks.filter((t) => selectedIds.has(t.id))
    if (selectedTasks.length === 0) return
    bulkDeleteWithUndo({
      tasks: selectedTasks,
      queryClient,
      workspaceId: workspace?.id,
      showToast,
    })
    clearSelection()
  }

  const sharedTasks = useMemo(
    () => tasks.filter((t) => selectedIds.has(t.id)),
    [tasks, selectedIds],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const days = useMemo(() => {
    if (range === 'day') {
      return [anchor]
    }
    if (range === 'month') {
      const monthStart = startOfMonth(anchor)
      const monthEnd = endOfMonth(anchor)
      const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
      const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
      return eachDayOfInterval({ start: gridStart, end: gridEnd })
    }
    const span = SPAN_DAYS[range] ?? 7
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    return Array.from({ length: span }, (_, i) => addDays(start, i))
  }, [range, anchor])

  const tasksByDay = useMemo(() => {
    const m = new Map()
    tasks.forEach((t) => {
      if (!t.due_date) return
      const key = t.due_date
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(t)
    })
    return m
  }, [tasks])

  const navTitle = useMemo(() => {
    if (range === 'day') return format(anchor, 'EEEE, MMM d, yyyy')
    if (range === 'month') return format(anchor, 'MMMM yyyy')
    const first = days[0]
    const last = days[days.length - 1]
    if (isSameMonth(first, last)) {
      return `${format(first, 'MMM d')} – ${format(last, 'd, yyyy')}`
    }
    return `${format(first, 'MMM d')} – ${format(last, 'MMM d, yyyy')}`
  }, [range, days, anchor])

  function step(direction) {
    const factor = direction === 'next' ? 1 : -1
    if (range === 'day') {
      setAnchor((prev) => addDays(prev, factor))
      return
    }
    if (range === 'month') {
      setAnchor((prev) => {
        const d = new Date(prev)
        d.setMonth(d.getMonth() + factor)
        return d
      })
    } else {
      const inc = SPAN_DAYS[range] ?? 7
      setAnchor((prev) => addDays(prev, inc * factor))
    }
  }

  // Clicking a day cell in any non-day range jumps into the 1-day view
  // anchored on that date.
  function handleDayCellClick(day) {
    if (range === 'day') return // already there
    setAnchor(day)
    setRange('day')
  }

  function handleDragEnd(e) {
    setActiveId(null)
    if (!e.over) return
    const targetDate = String(e.over.id).replace('day-', '')
    const task = tasks.find((t) => t.id === e.active.id)
    if (!task || task.due_date === targetDate) return
    updateTask.mutate({ id: task.id, due_date: targetDate })
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <TaskFilterBar />
      <div className="p-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => step('prev')}
            className="p-2 hover:bg-surface-2 rounded text-text-2 hover:text-text"
            aria-label="Previous"
          >
            <i className="ti ti-chevron-left text-sm" />
          </button>
          <div className="text-sm font-medium px-2 min-w-0">{navTitle}</div>
          <button
            onClick={() => step('next')}
            className="p-2 hover:bg-surface-2 rounded text-text-2 hover:text-text"
            aria-label="Next"
          >
            <i className="ti ti-chevron-right text-sm" />
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="text-xs px-2 py-1 ml-1 rounded border border-border hover:bg-surface-2"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              if (selectMode) exitSelectMode()
              else setSelectMode(true)
            }}
            className={`text-xs px-2.5 py-1 rounded border inline-flex items-center gap-1.5 ${
              selectMode
                ? 'border-info text-info bg-info-bg'
                : 'border-border text-text-2 hover:text-text'
            }`}
            title={selectMode ? 'Exit select mode' : 'Enable select mode (click chips to multi-select)'}
          >
            <i className={`ti ${selectMode ? 'ti-square-check' : 'ti-square'} text-sm`} />
            {selectMode ? 'Done selecting' : 'Select'}
          </button>
          <div className="inline-flex items-center gap-0.5 p-0.5 bg-surface-2 rounded-md">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`text-xs px-2.5 py-1 rounded ${
                  range === r.id
                    ? 'bg-surface text-text font-medium shadow-sm'
                    : 'text-text-2 hover:text-text'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectMode && selectedIds.size > 0 && (
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
          onShareSelected={() => setShareOpen(true)}
          onExportCsv={() => {
            exportTasksToCsv(sharedTasks, {
              filename: `tickd-calendar-${new Date().toISOString().slice(0, 10)}.csv`,
              departments,
            })
            showToast(`Exported ${sharedTasks.length} task${sharedTasks.length === 1 ? '' : 's'}.`)
          }}
          onDelete={bulkDelete}
          people={people}
          departments={departments}
        />
      )}
      {shareOpen && sharedTasks.length > 0 && (
        <ShareModal
          tasks={sharedTasks}
          selectionTitle={`Calendar selection (${sharedTasks.length})`}
          onClose={() => setShareOpen(false)}
        />
      )}

      {range === 'day' ? (
        <DayDetailView
          day={anchor}
          tasks={tasksByDay.get(toIso(anchor)) ?? []}
          onOpenTask={onOpenTask}
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveId(e.active.id)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          {/* Mobile: vertical day list */}
          <div className="sm:hidden">
            {days.map((d) => (
              <DayList
                key={d.toISOString()}
                day={d}
                tasks={tasksByDay.get(toIso(d)) ?? []}
                onOpenTask={onOpenTask}
                onSelectDay={handleDayCellClick}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelection}
              />
            ))}
          </div>

          {/* Tablet+: grid */}
          <div className="hidden sm:block">
            <div className="grid grid-cols-7 gap-1.5 px-4 pt-3 pb-2">
              {DAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="text-[10px] uppercase tracking-wider text-text-2 text-center font-medium"
                >
                  {d}
                </div>
              ))}
            </div>
            <div
              className={`grid grid-cols-7 px-4 pb-4 ${
                range === 'month' ? 'gap-1' : 'gap-1.5'
              }`}
            >
              {days.map((d) => (
                <DayCell
                  key={d.toISOString()}
                  day={d}
                  anchor={anchor}
                  range={range}
                  tasks={tasksByDay.get(toIso(d)) ?? []}
                  blockerMap={blockerMap}
                  onOpenTask={onOpenTask}
                  onSelectDay={handleDayCellClick}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelection}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeTask ? (
              <div
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium shadow-lg ${picPill(activeTask.pic?.color)} max-w-[200px] truncate -rotate-2`}
              >
                {activeTask.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

// ---- 1-day view ----
// Single big column showing rich TaskRows for the anchored date. Used
// when range === 'day' (selected by clicking a day in any other range,
// or by clicking the Day tab in the range switcher).
function DayDetailView({ day, tasks, onOpenTask }) {
  const active = tasks.filter((t) => t.status !== 'Done')
  const done = tasks.filter((t) => t.status === 'Done')
  const overdueCount = active.filter((t) => isOverdue(t.due_date)).length
  const isOnToday = isTodayDF(day)

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wider text-text-3">
            {format(day, 'EEEE')}
            {isOnToday && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-info-bg text-info-text font-medium tracking-normal normal-case">
                Today
              </span>
            )}
          </div>
          <div className="text-2xl font-medium tracking-tight mt-0.5">
            {format(day, 'MMM d')}
          </div>
        </div>
        <div className="text-xs text-text-2">
          {active.length} active
          {overdueCount > 0 && (
            <span className="text-danger-text font-medium">
              {' · '}
              {overdueCount} overdue
            </span>
          )}
          {done.length > 0 && (
            <span className="text-text-3">{' · '}{done.length} done</span>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="py-12 text-center text-xs text-text-3">
          Nothing scheduled this day.
        </div>
      ) : (
        <div>
          {active.length > 0 && (
            <div className="-mx-4 sm:-mx-6">
              <div className="px-4 sm:px-6">
                {active.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onClick={() => onOpenTask(t.id)}
                  />
                ))}
              </div>
            </div>
          )}
          {done.length > 0 && (
            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-wider text-text-3 mb-2">
                Completed
              </div>
              <div className="-mx-4 sm:-mx-6 opacity-70">
                <div className="px-4 sm:px-6">
                  {done.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onClick={() => onOpenTask(t.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DayCell({
  day,
  anchor,
  range,
  tasks,
  blockerMap,
  onOpenTask,
  onSelectDay,
  selectMode,
  selectedIds,
  onToggleSelect,
}) {
  const { isOver, setNodeRef } = useDroppable({ id: 'day-' + toIso(day) })
  const isToday = isTodayDF(day)
  const isWeekend = day.getDay() === 0 || day.getDay() === 6
  const isOtherMonth = range === 'month' && !isSameMonth(day, anchor)

  const maxVisible = range === 'month' ? 2 : 4
  const visibleTasks = tasks.slice(0, maxVisible)
  const overflow = tasks.length - visibleTasks.length

  return (
    <div
      ref={setNodeRef}
      onClick={() => onSelectDay(day)}
      title="Click to open this day"
      className={`
        ${range === 'month' ? 'min-h-[80px] p-1.5' : 'min-h-[110px] p-2'}
        rounded-md border transition-colors cursor-pointer overflow-hidden
        ${isOver ? 'bg-info-bg border-info border-dashed' : 'border-border'}
        ${isToday ? 'bg-info-bg/40' : isWeekend ? 'bg-surface-2/60' : 'bg-surface'}
        ${isOtherMonth ? 'opacity-40' : ''}
        hover:border-border-strong
      `}
    >
      <div
        className={`text-[10px] font-medium mb-1 ${isToday ? 'text-info-text' : 'text-text-2'}`}
      >
        {format(day, 'd')}
      </div>
      {visibleTasks.map((t) => (
        <DayTaskChip
          key={t.id}
          task={t}
          blocked={(blockerMap?.get(t.id) ?? 0) > 0}
          onClick={() => {
            if (selectMode) onToggleSelect?.(t.id)
            else onOpenTask(t.id)
          }}
          selectMode={selectMode}
          isSelected={selectedIds?.has(t.id) ?? false}
        />
      ))}
      {overflow > 0 && (
        <div className="text-[9px] text-text-3 mt-0.5">+{overflow} more</div>
      )}
    </div>
  )
}

function DayTaskChip({ task, onClick, selectMode, isSelected, blocked }) {
  // In select mode we suppress dnd so taps select instead of dragging.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: selectMode,
  })
  return (
    <div
      ref={setNodeRef}
      {...(selectMode ? {} : listeners)}
      {...(selectMode ? {} : attributes)}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`text-[10px] px-1.5 py-0.5 rounded mb-0.5 font-medium truncate select-none ${picPill(task.pic?.color)} ${
        isDragging ? 'opacity-30' : ''
      } ${
        blocked ? 'opacity-50' : ''
      } ${
        selectMode
          ? `cursor-pointer ${isSelected ? 'ring-2 ring-info ring-offset-1 ring-offset-surface' : 'opacity-90 hover:opacity-100'}`
          : 'cursor-grab active:cursor-grabbing'
      }`}
      style={{ touchAction: selectMode ? 'auto' : 'none' }}
      title={
        selectMode
          ? 'Tap to toggle selection'
          : blocked
            ? `${task.title} — blocked by open task(s)`
            : task.title
      }
    >
      {selectMode && isSelected && <i className="ti ti-check mr-1" />}
      {task.title}
    </div>
  )
}

function DayList({ day, tasks, onOpenTask, onSelectDay, selectMode, selectedIds, onToggleSelect }) {
  const isToday = isTodayDF(day)
  return (
    <div className="border-b border-border last:border-b-0 p-3">
      <button
        type="button"
        onClick={() => onSelectDay?.(day)}
        className={`text-xs font-medium mb-1.5 inline-flex items-center hover:text-text ${isToday ? 'text-info-text' : 'text-text-2'}`}
      >
        {format(day, 'EEE, MMM d')}
        {isToday && <span className="ml-1 text-[10px] text-info">· Today</span>}
      </button>
      {tasks.length === 0 ? (
        <div className="text-[11px] text-text-3 pl-1">Nothing scheduled</div>
      ) : (
        <div className="space-y-1">
          {tasks.map((t) => {
            const isSel = selectedIds?.has(t.id) ?? false
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (selectMode) onToggleSelect?.(t.id)
                  else onOpenTask(t.id)
                }}
                className={`block w-full text-left text-xs px-2 py-1.5 rounded ${picPill(t.pic?.color)} truncate ${
                  selectMode && isSel
                    ? 'ring-2 ring-info ring-inset'
                    : ''
                }`}
              >
                {selectMode && isSel && <i className="ti ti-check mr-1" />}
                {t.title}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
