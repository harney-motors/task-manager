import { useMemo, useState } from 'react'
import { useDepartments, usePeople, useTasks, useUpdateTask } from '../lib/queries'
import { isOverdue } from '../lib/dates'
import { statusPill } from '../lib/colors'

const COLS =
  'grid grid-cols-[28px_minmax(0,2.2fr)_140px_120px_120px_100px_110px] gap-3 px-4 items-center'

export default function GridView({ onOpenTask }) {
  const { data: people = [] } = usePeople()
  const { data: tasks = [], isLoading } = useTasks()
  const { data: departments = [] } = useDepartments()
  const updateTask = useUpdateTask()

  const [groupByPic, setGroupByPic] = useState(false)
  const [filterPic, setFilterPic] = useState('all')
  const [filterDept, setFilterDept] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        if (filterPic !== 'all' && t.pic_id !== filterPic) return false
        if (filterDept !== 'all' && t.department_id !== filterDept) return false
        if (filterStatus !== 'all' && t.status !== filterStatus) return false
        return true
      }),
    [tasks, filterPic, filterDept, filterStatus],
  )

  const groups = useMemo(() => {
    if (!groupByPic) return null
    const byPic = new Map()
    filtered.forEach((t) => {
      const key = t.pic_id ?? '__unassigned__'
      if (!byPic.has(key)) byPic.set(key, { picId: t.pic_id, tasks: [] })
      byPic.get(key).tasks.push(t)
    })
    return Array.from(byPic.values())
  }, [filtered, groupByPic])

  const hasFilters =
    filterPic !== 'all' || filterDept !== 'all' || filterStatus !== 'all'

  function update(taskId, field, value) {
    updateTask.mutate({ id: taskId, [field]: value })
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
        <FilterSelect value={filterPic} onChange={setFilterPic}>
          <option value="all">All PICs</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect value={filterDept} onChange={setFilterDept}>
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect value={filterStatus} onChange={setFilterStatus}>
          <option value="all">All statuses</option>
          <option value="Open">Open</option>
          <option value="In progress">In progress</option>
          <option value="Ongoing">Ongoing</option>
          <option value="Done">Done</option>
        </FilterSelect>
        {hasFilters && (
          <button
            onClick={() => {
              setFilterPic('all')
              setFilterDept('all')
              setFilterStatus('all')
            }}
            className="text-xs text-text-3 hover:text-text px-2 py-1 underline"
          >
            Clear
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setGroupByPic((g) => !g)}
          className={`text-xs px-2 py-1 rounded border inline-flex items-center gap-1.5 ${
            groupByPic
              ? 'border-info text-info'
              : 'border-border text-text-2 hover:text-text'
          }`}
        >
          <i className="ti ti-users text-sm" />
          Group by PIC
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <GridHeader />
          {isLoading ? (
            <div className="py-10 text-center text-xs text-text-3">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-text-3">
              {tasks.length === 0
                ? 'No tasks yet.'
                : 'No tasks match these filters.'}
            </div>
          ) : groupByPic && groups ? (
            groups.map((g) => {
              const pic = people.find((p) => p.id === g.picId)
              return (
                <div key={g.picId ?? 'unassigned'}>
                  <div className="px-4 py-2 bg-surface-2 border-b border-border flex items-center gap-2 text-xs">
                    <span className="font-medium text-text">
                      {pic?.name ?? 'Unassigned'}
                    </span>
                    <span className="text-text-3">· {g.tasks.length}</span>
                  </div>
                  {g.tasks.map((t) => (
                    <GridRow
                      key={t.id}
                      task={t}
                      people={people}
                      departments={departments}
                      onOpen={() => onOpenTask(t.id)}
                      onUpdate={update}
                    />
                  ))}
                </div>
              )
            })
          ) : (
            filtered.map((t) => (
              <GridRow
                key={t.id}
                task={t}
                people={people}
                departments={departments}
                onOpen={() => onOpenTask(t.id)}
                onUpdate={update}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function GridHeader() {
  return (
    <div
      className={`${COLS} py-2 border-b border-border-strong bg-surface text-[10px] uppercase tracking-wider text-text-2 font-medium`}
    >
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

function GridRow({ task, people, departments, onOpen, onUpdate }) {
  const overdue = isOverdue(task.due_date) && task.status !== 'Done'
  const done = task.status === 'Done'
  const displayStatus = overdue ? 'Overdue' : task.status
  const isTemp = String(task.id).startsWith('temp-')

  // stopPropagation on inline cells so changing them doesn't open the modal
  const stop = (e) => e.stopPropagation()

  return (
    <div
      onClick={onOpen}
      className="border-b border-border last:border-b-0 hover:bg-surface-2 cursor-pointer transition-colors"
    >
      <div className={`${COLS} py-2 text-xs`}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onUpdate(task.id, 'status', done ? 'Open' : 'Done')
          }}
          disabled={isTemp}
          className="text-text-3 hover:text-text disabled:opacity-50 flex items-center"
          aria-label={done ? 'Mark as open' : 'Mark as done'}
        >
          <i
            className={`ti ${done ? 'ti-square-check-filled text-success' : 'ti-square'} text-base`}
          />
        </button>

        <div
          className={`text-sm truncate ${done ? 'line-through text-text-3' : ''}`}
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
