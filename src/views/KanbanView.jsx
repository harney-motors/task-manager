import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useSearchParams } from 'react-router-dom'
import {
  usePeople,
  useTasks,
  useUpdateTask,
} from '../lib/queries'
import { isOverdue } from '../lib/dates'
import { picPill, statusPill } from '../lib/colors'
import {
  applyTaskFilters,
  readFiltersFromParams,
} from '../lib/applyTaskFilters'
import TaskFilterBar from '../components/TaskFilterBar'
import Avatar from '../components/Avatar'
import { useToast } from '../components/Toast'

// Kanban view — status columns with drag-drop. Trello / Linear /
// Monday's primary board pattern. Cards summarise a task (title +
// PIC + due + priority) and clicking opens the full TaskModal.
//
// Columns are the four task statuses (Open / In progress / Ongoing /
// Done). Dragging a card across columns mutates `status` via
// useUpdateTask — same optimistic + invalidate path other views use.
const COLUMNS = [
  { id: 'Open',         label: 'Open',         accent: 'bg-text-3/30' },
  { id: 'In progress',  label: 'In progress',  accent: 'bg-blue-500' },
  { id: 'Ongoing',      label: 'Ongoing',      accent: 'bg-violet-500' },
  { id: 'Done',         label: 'Done',         accent: 'bg-emerald-500' },
]

export default function KanbanView({ onOpenTask }) {
  const { data: tasks = [], isLoading } = useTasks()
  const { data: people = [] } = usePeople()
  const updateTask = useUpdateTask()
  const showToast = useToast()
  const [activeId, setActiveId] = useState(null)

  const [searchParams] = useSearchParams()
  const filters = readFiltersFromParams(searchParams)
  const filtered = useMemo(
    () => applyTaskFilters(tasks, filters),
    [tasks, filters],
  )

  // Split filtered tasks by status into the four columns.
  const grouped = useMemo(() => {
    const map = { Open: [], 'In progress': [], Ongoing: [], Done: [] }
    for (const t of filtered) {
      if (map[t.status]) map[t.status].push(t)
      else map.Open.push(t) // shouldn't happen, defensive
    }
    // Within each column: overdue first, then by due date asc, then
    // by priority (High > Medium > Low).
    for (const k of Object.keys(map)) {
      map[k].sort(compareCards)
    }
    return map
  }, [filtered])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null

  function handleDragEnd(e) {
    setActiveId(null)
    if (!e.over) return
    const targetStatus = String(e.over.id).replace('col-', '')
    const task = tasks.find((t) => t.id === e.active.id)
    if (!task || task.status === targetStatus) return
    updateTask.mutate(
      { id: task.id, status: targetStatus },
      {
        onSuccess: () => showToast(`Moved to "${targetStatus}"`),
      },
    )
  }

  return (
    <div className="space-y-3">
      {/* Sticky filter chrome — same pattern as List / Grid / Calendar. */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden tickd-stick-below-topbar">
        <TaskFilterBar hide={['group', 'sort']} />
      </div>

      <DndContext
        sensors={sensors}
        // `pointerWithin` makes the column under the POINTER win, not
        // the column under the card's rect center. Without this, wide
        // cards slid through one or two columns past where the user
        // actually pointed — the "jumps two boards over" bug.
        collisionDetection={pointerWithin}
        onDragStart={(e) => setActiveId(e.active.id)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {/* Columns: 4 across on desktop, horizontal-scroll on mobile
            so each card stays a comfortable readable width. */}
        <div className="flex gap-3 overflow-x-auto lg:grid lg:grid-cols-4 pb-2 [scrollbar-width:thin]">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={grouped[col.id]}
              loading={isLoading}
              onOpenTask={onOpenTask}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            // Explicit width on the overlay so the ghost matches the
            // card's column width — without this, the clone rendered
            // at its intrinsic content size and dnd-kit positioned it
            // wildly offset from the cursor (the "ghost ends up two
            // columns over" bug).
            <div style={{ width: '288px' }}>
              <KanbanCard task={activeTask} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function KanbanColumn({ column, tasks, loading, onOpenTask }) {
  const { isOver, setNodeRef } = useDroppable({ id: `col-${column.id}` })

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 lg:w-auto bg-surface-2/60 border border-border rounded-xl flex flex-col transition-colors ${
        isOver ? 'bg-info-bg/60 border-info' : ''
      }`}
    >
      {/* Column header — coloured accent stripe + label + count */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${column.accent} flex-shrink-0`} />
        <h3 className="text-xs uppercase tracking-wider font-semibold text-text-2">
          {column.label}
        </h3>
        <span className="text-[11px] text-text-3 font-medium ml-auto">
          {tasks.length}
        </span>
      </div>

      {/* Card list */}
      <div className="flex-1 p-2 space-y-2 min-h-[120px]">
        {loading ? (
          <div className="text-[11px] text-text-3 text-center py-6">Loading…</div>
        ) : tasks.length === 0 ? (
          <div className="text-[11px] text-text-3 text-center py-6 italic">
            Drop here
          </div>
        ) : (
          tasks.map((t) => (
            <DraggableKanbanCard
              key={t.id}
              task={t}
              onOpenTask={onOpenTask}
            />
          ))
        )}
      </div>
    </div>
  )
}

function DraggableKanbanCard({ task, onOpenTask }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpenTask?.(task.id)}
      className={`cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      }`}
      style={{ touchAction: 'none' }}
    >
      <KanbanCard task={task} />
    </div>
  )
}

function KanbanCard({ task, dragging = false }) {
  const overdue = isOverdue(task.due_date) && task.status !== 'Done'
  const displayStatus = overdue ? 'Overdue' : task.status

  return (
    <div
      className={`bg-surface border border-border rounded-lg p-2.5 hover:border-border-strong active:bg-surface-2 transition-colors shadow-sm ${
        dragging ? 'shadow-lg rotate-1 ring-2 ring-info' : ''
      }`}
    >
      <div className="text-sm font-medium line-clamp-2">{task.title}</div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {task.pic ? (
          <Avatar person={task.pic} size="sm" />
        ) : (
          <Avatar person={null} size="sm" />
        )}
        {task.due_date && (
          <span
            className={`text-[10px] ${
              overdue ? 'text-danger-text font-semibold' : 'text-text-3'
            }`}
          >
            {formatShort(task.due_date)}
          </span>
        )}
        {task.priority && task.priority !== 'Medium' && (
          <span
            className={`text-[9px] px-1.5 py-px rounded font-medium ${
              task.priority === 'High'
                ? 'bg-danger-bg text-danger-text'
                : 'bg-text-3/15 text-text-2'
            }`}
          >
            {task.priority}
          </span>
        )}
        {overdue && (
          <span className="text-[9px] px-1.5 py-px rounded-full bg-danger-bg text-danger-text font-medium ml-auto">
            Overdue
          </span>
        )}
      </div>
    </div>
  )
}

// --- helpers ---
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 }
function compareCards(a, b) {
  const ao = isOverdue(a.due_date) && a.status !== 'Done'
  const bo = isOverdue(b.due_date) && b.status !== 'Done'
  if (ao !== bo) return ao ? -1 : 1
  const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity
  const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity
  if (ad !== bd) return ad - bd
  return (
    (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99)
  )
}

function formatShort(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
