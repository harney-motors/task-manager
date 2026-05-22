import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  useDeactivatePerson,
  useDeleteDepartment,
  useDepartments,
  usePeople,
} from '../lib/queries'
import { picDot } from '../lib/colors'
import PersonModal from '../components/PersonModal'
import DepartmentModal from '../components/DepartmentModal'

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

function PeoplePanel() {
  const { data: people = [], isLoading } = usePeople()
  const deactivate = useDeactivatePerson()
  const [editing, setEditing] = useState(null) // null | 'new' | person object

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-sm font-medium">People</h2>
          <p className="text-xs text-text-2 mt-0.5">
            PICs receive tasks; editors can also create and modify them.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 inline-flex items-center gap-1.5"
        >
          <i className="ti ti-plus text-sm" />
          Add person
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-text-3">Loading…</div>
      ) : people.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-3">
          No people yet. Add the first one.
        </div>
      ) : (
        <div>
          {people.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
            >
              <span className={`w-2.5 h-2.5 rounded-full ${picDot(p.color)} flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-xs text-text-2 truncate">
                  {p.title || '—'}
                  {p.department && ` · ${p.department}`}
                  {' · '}
                  {p.role === 'pic' ? 'PIC' : p.role}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditing(p)}
                  className="text-xs px-2 py-1 rounded hover:bg-surface text-text-2 hover:text-text"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Deactivate ${p.name}? They won't appear in PIC dropdowns until reactivated.`)) {
                      deactivate.mutate(p.id)
                    }
                  }}
                  className="text-xs px-2 py-1 rounded text-text-3 hover:text-danger-text hover:bg-danger-bg"
                >
                  Deactivate
                </button>
              </div>
            </div>
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

function DepartmentsPanel() {
  const { data: departments = [], isLoading } = useDepartments()
  const remove = useDeleteDepartment()
  const [editing, setEditing] = useState(null)

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-sm font-medium">Departments</h2>
          <p className="text-xs text-text-2 mt-0.5">
            Used to categorise tasks. Deleting a department unassigns its tasks.
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
        <div className="p-8 text-center text-xs text-text-3">Loading…</div>
      ) : departments.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-3">
          No departments yet. Add the first one.
        </div>
      ) : (
        <div>
          {departments.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
            >
              <span className={`w-2.5 h-2.5 rounded-full ${picDot(d.color)} flex-shrink-0`} />
              <div className="flex-1 min-w-0 text-sm font-medium truncate">
                {d.name}
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
                    if (confirm(`Delete "${d.name}"? Tasks assigned to this department will become unassigned.`)) {
                      remove.mutate(d.id)
                    }
                  }}
                  className="text-xs px-2 py-1 rounded text-text-3 hover:text-danger-text hover:bg-danger-bg"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
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
