import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  useDeactivatePerson,
  useDeleteDepartment,
  useDeletePerson,
  useDepartments,
  usePeople,
  useReactivatePerson,
  useTasks,
} from '../lib/queries'
import { useToast } from '../components/Toast'
import { picDot } from '../lib/colors'
import PersonModal from '../components/PersonModal'
import DepartmentModal from '../components/DepartmentModal'
import Skeleton from '../components/Skeleton'

const TABS = [
  { id: 'people',      label: 'People',      icon: 'ti-users' },
  { id: 'departments', label: 'Departments', icon: 'ti-building' },
  { id: 'profile',     label: 'My profile',  icon: 'ti-user' },
]

export default function SettingsView({ onBack }) {
  const [tab, setTab] = useState('people')

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 rounded hover:bg-surface-2 text-text-2 hover:text-text"
            aria-label="Back"
          >
            <i className="ti ti-arrow-left text-base" />
          </button>
          <h1 className="text-xl font-medium tracking-tight">Settings</h1>
        </div>

        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 mb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex items-center gap-1 p-1 bg-surface-2 rounded-lg">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-xs rounded-md inline-flex items-center gap-1.5 whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-surface text-text font-medium shadow-sm'
                    : 'text-text-2 hover:text-text'
                }`}
              >
                <i className={`ti ${t.icon} text-sm`} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'people' && <PeoplePanel />}
        {tab === 'departments' && <DepartmentsPanel />}
        {tab === 'profile' && <ProfilePanel />}
      </div>
    </div>
  )
}

// ============================================================
// People
// ============================================================

function PeoplePanel() {
  const [showInactive, setShowInactive] = useState(false)
  const { data: people = [], isLoading } = usePeople({ includeInactive: showInactive })
  const { data: tasks = [] } = useTasks()
  const deactivate = useDeactivatePerson()
  const reactivate = useReactivatePerson()
  const remove = useDeletePerson()
  const showToast = useToast()
  const [editing, setEditing] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  // Compute task involvement per person (PIC + watcher)
  const involvementMap = useMemo(() => {
    const picCount = new Map()
    const watchCount = new Map()
    for (const t of tasks) {
      if (t.pic_id) picCount.set(t.pic_id, (picCount.get(t.pic_id) ?? 0) + 1)
      for (const w of t.watchers ?? []) {
        watchCount.set(w.id, (watchCount.get(w.id) ?? 0) + 1)
      }
    }
    return { picCount, watchCount }
  }, [tasks])

  const visiblePeople = people
  const visibleIds = visiblePeople.map((p) => p.id)
  const visibleSelectedCount = visibleIds.filter((id) => selectedIds.has(id)).length
  const allVisibleSelected =
    visiblePeople.length > 0 && visibleSelectedCount === visiblePeople.length

  function toggleAll() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        for (const id of visibleIds) next.delete(id)
        return next
      }
      const next = new Set(prev)
      for (const id of visibleIds) next.add(id)
      return next
    })
  }

  function toggle(id) {
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

  async function runBulk(mutationFn, label) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const results = await Promise.allSettled(
      ids.map(
        (id) =>
          new Promise((resolve, reject) =>
            mutationFn.mutate(id, { onSuccess: resolve, onError: reject }),
          ),
      ),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - ok
    if (failed === 0) {
      showToast(`${label} on ${ok} person${ok === 1 ? '' : 's'}`)
    } else {
      showToast(`${label}: ${ok} ok, ${failed} failed`, { type: 'error' })
    }
    clearSelection()
  }

  async function handleBulkDeactivate() {
    await runBulk(deactivate, 'Deactivated')
  }
  async function handleBulkReactivate() {
    await runBulk(reactivate, 'Reactivated')
  }
  async function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (
      !confirm(
        `Permanently delete ${ids.length} person${ids.length === 1 ? '' : 's'}? ` +
          `Tasks they were assigned to will become unassigned. This cannot be undone.`,
      )
    )
      return
    await runBulk(remove, 'Deleted')
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-medium">People</h2>
          <p className="text-xs text-text-2 mt-0.5">
            {visiblePeople.length} {showInactive ? 'total' : 'active'} ·
            PICs receive tasks. &quot;Unused&quot; means no current tasks and no
            watches.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-text-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="cursor-pointer"
            />
            Show inactive
          </label>
          <button
            onClick={() => setEditing('new')}
            className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 inline-flex items-center gap-1.5"
          >
            <i className="ti ti-plus text-sm" />
            Add person
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-info text-white px-4 py-2 flex items-center gap-2 flex-wrap text-xs">
          <span className="font-medium">{selectedIds.size} selected</span>
          <button
            onClick={clearSelection}
            className="underline opacity-90 hover:opacity-100"
          >
            Clear
          </button>
          <div className="flex-1" />
          {showInactive && (
            <button
              onClick={handleBulkReactivate}
              className="bg-white/15 hover:bg-white/25 rounded px-2 py-1 border border-white/30"
            >
              Reactivate
            </button>
          )}
          <button
            onClick={handleBulkDeactivate}
            className="bg-white/15 hover:bg-white/25 rounded px-2 py-1 border border-white/30"
          >
            Deactivate
          </button>
          <button
            onClick={handleBulkDelete}
            className="bg-danger-text/30 hover:bg-danger-text/50 rounded px-2 py-1 border border-white/30 font-medium"
          >
            Delete permanently
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="px-4 py-4">
          <Skeleton rows={6} height={48} />
        </div>
      ) : visiblePeople.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-3">
          {showInactive ? 'No people.' : 'No active people.'}
        </div>
      ) : (
        <div>
          {visiblePeople.length > 1 && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface-2 text-[11px] text-text-2">
              <input
                type="checkbox"
                ref={(el) => {
                  if (el) {
                    el.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected
                  }
                }}
                checked={allVisibleSelected}
                onChange={toggleAll}
                className="cursor-pointer"
                aria-label="Select all"
              />
              <span>Select all visible</span>
            </div>
          )}
          {visiblePeople.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              picCount={involvementMap.picCount.get(p.id) ?? 0}
              watchCount={involvementMap.watchCount.get(p.id) ?? 0}
              isSelected={selectedIds.has(p.id)}
              onToggleSelect={() => toggle(p.id)}
              onEdit={() => setEditing(p)}
              onDeactivate={deactivate}
              onReactivate={reactivate}
              onDelete={remove}
            />
          ))}
        </div>
      )}

      {editing && (
        <PersonModal
          person={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function PersonRow({
  person: p,
  picCount,
  watchCount,
  isSelected,
  onToggleSelect,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
}) {
  const totalInvolvement = picCount + watchCount
  const isActive = p.is_active !== false
  const isUnused = isActive && totalInvolvement === 0

  function handleDeactivate() {
    if (
      confirm(
        `Deactivate ${p.name}? They won't appear in PIC dropdowns until reactivated.`,
      )
    ) {
      onDeactivate.mutate(p.id)
    }
  }
  function handleDelete() {
    const taskWarning =
      picCount > 0
        ? ` They are the PIC on ${picCount} task${picCount === 1 ? '' : 's'} (those will become unassigned).`
        : ''
    if (
      confirm(
        `Permanently delete ${p.name}?${taskWarning} This cannot be undone.`,
      )
    ) {
      onDelete.mutate(p.id)
    }
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 transition-colors ${
        isSelected ? 'bg-info-bg/60' : 'hover:bg-surface-2'
      } ${!isActive ? 'opacity-60' : ''}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className="cursor-pointer flex-shrink-0"
        aria-label={`Select ${p.name}`}
      />
      <span
        className={`w-2.5 h-2.5 rounded-full ${picDot(p.color)} flex-shrink-0`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{p.name}</span>
          {!isActive && (
            <span className="text-[10px] px-1.5 py-px rounded bg-surface-3 text-text-3 uppercase tracking-wider">
              Inactive
            </span>
          )}
          {isUnused && (
            <span className="text-[10px] px-1.5 py-px rounded bg-warning-bg text-warning-text">
              Unused
            </span>
          )}
        </div>
        <div className="text-xs text-text-2 truncate flex items-center gap-2 mt-0.5">
          <span>
            {p.title || '—'}
            {p.department && ` · ${p.department}`}
            {' · '}
            {p.role === 'pic' ? 'PIC' : p.role}
          </span>
          {picCount > 0 && (
            <span className="text-text-3">
              · {picCount} task{picCount === 1 ? '' : 's'}
            </span>
          )}
          {watchCount > 0 && (
            <span className="text-text-3">· watching {watchCount}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onEdit}
          className="text-xs px-2 py-1 rounded hover:bg-surface text-text-2 hover:text-text"
        >
          Edit
        </button>
        {isActive ? (
          <button
            onClick={handleDeactivate}
            className="text-xs px-2 py-1 rounded text-text-3 hover:text-text hover:bg-surface"
            title="Soft-hide from dropdowns"
          >
            Deactivate
          </button>
        ) : (
          <button
            onClick={() => onReactivate.mutate(p.id)}
            className="text-xs px-2 py-1 rounded text-info hover:bg-info-bg/40"
          >
            Reactivate
          </button>
        )}
        <button
          onClick={handleDelete}
          className="text-xs px-2 py-1 rounded text-text-3 hover:text-danger-text hover:bg-danger-bg"
          title="Permanently delete (unassigns their tasks)"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Departments
// ============================================================

function DepartmentsPanel() {
  const { data: departments = [], isLoading } = useDepartments()
  const { data: tasks = [] } = useTasks()
  const remove = useDeleteDepartment()
  const [editing, setEditing] = useState(null)

  const usageMap = useMemo(() => {
    const m = new Map()
    for (const t of tasks) {
      if (t.department_id) m.set(t.department_id, (m.get(t.department_id) ?? 0) + 1)
    }
    return m
  }, [tasks])

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-sm font-medium">Departments</h2>
          <p className="text-xs text-text-2 mt-0.5">
            {departments.length} department{departments.length === 1 ? '' : 's'} ·
            Deleting one unassigns its tasks.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 inline-flex items-center gap-1.5"
        >
          <i className="ti ti-plus text-sm" />
          Add department
        </button>
      </div>

      {isLoading ? (
        <div className="px-4 py-4">
          <Skeleton rows={4} height={48} />
        </div>
      ) : departments.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-3">
          No departments yet. Add the first one.
        </div>
      ) : (
        <div>
          {departments.map((d) => {
            const count = usageMap.get(d.id) ?? 0
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${picDot(d.color)} flex-shrink-0`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {d.name}
                    {count === 0 && (
                      <span className="text-[10px] px-1.5 py-px rounded bg-warning-bg text-warning-text">
                        Unused
                      </span>
                    )}
                  </div>
                  {count > 0 && (
                    <div className="text-[11px] text-text-3 mt-0.5">
                      {count} task{count === 1 ? '' : 's'} assigned
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(d)}
                    className="text-xs px-2 py-1 rounded hover:bg-surface text-text-2 hover:text-text"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Delete "${d.name}"? ${count > 0 ? `${count} task${count === 1 ? '' : 's'} will become unassigned.` : ''}`,
                        )
                      ) {
                        remove.mutate(d.id)
                      }
                    }}
                    className="text-xs px-2 py-1 rounded text-text-3 hover:text-danger-text hover:bg-danger-bg"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <DepartmentModal
          department={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ============================================================
// Profile
// ============================================================

function ProfilePanel() {
  const { user, workspace, signOut } = useAuth()
  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div>
        <div className="text-xs text-text-2 mb-1">Signed in as</div>
        <div className="text-sm font-medium">{user.email}</div>
      </div>
      <div>
        <div className="text-xs text-text-2 mb-1">Workspace</div>
        <div className="text-sm font-medium">{workspace?.name ?? '—'}</div>
      </div>
      <div className="pt-3 border-t border-border">
        <button
          onClick={signOut}
          className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface-2 text-text-2 hover:text-text inline-flex items-center gap-1.5"
        >
          <i className="ti ti-logout text-sm" />
          Sign out
        </button>
      </div>
    </div>
  )
}
