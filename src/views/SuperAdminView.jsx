import { useState } from 'react'
import WorkspacesPanel from './admin/WorkspacesPanel'
import UsersPanel from './admin/UsersPanel'
import ActivityPanel from './admin/ActivityPanel'
import SystemPanel from './admin/SystemPanel'

const TABS = [
  { id: 'workspaces', label: 'Workspaces', icon: 'ti-building' },
  { id: 'users',      label: 'Users',      icon: 'ti-users' },
  { id: 'activity',   label: 'Activity',   icon: 'ti-history' },
  { id: 'system',     label: 'System',     icon: 'ti-chart-bar' },
]

export default function SuperAdminView({ onBack }) {
  const [tab, setTab] = useState('workspaces')

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={onBack}
            className="p-2 rounded hover:bg-surface-2 text-text-2 hover:text-text"
            aria-label="Back"
          >
            <i className="ti ti-arrow-left text-base" />
          </button>
          <i className="ti ti-shield-lock text-info text-lg" />
          <h1 className="text-xl font-medium tracking-tight">Super admin</h1>
        </div>
        <p className="text-xs text-text-2 mb-5 ml-11">
          Cross-tenant control plane. You see workspaces, users, and activity
          metadata — but never task content unless you&rsquo;re an actual member.
        </p>

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

        {tab === 'workspaces' && <WorkspacesPanel />}
        {tab === 'users'      && <UsersPanel />}
        {tab === 'activity'   && <ActivityPanel />}
        {tab === 'system'     && <SystemPanel />}
      </div>
    </div>
  )
}
