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
      <header
        className="sticky top-0 z-30 bg-bg/85 backdrop-blur-xl border-b border-border/60"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto max-w-5xl px-3 sm:px-6 py-2 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-full inline-flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors flex-shrink-0"
              aria-label="Back"
            >
              <i className="ti ti-arrow-left text-base" />
            </button>
            <i className="ti ti-shield-lock text-info text-lg flex-shrink-0" />
            <h1 className="text-base sm:text-xl font-medium tracking-tight">
              Super admin
            </h1>
          </div>

          <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex items-center gap-1 p-1 bg-surface-2 rounded-lg">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 text-xs rounded-md inline-flex items-center gap-1.5 whitespace-nowrap transition-colors active:scale-95 ${
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
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-3 sm:px-6 py-4 sm:py-6">
        <p className="text-xs text-text-2 mb-4 hidden sm:block">
          Cross-tenant control plane. You see workspaces, users, and activity
          metadata — but never task content unless you&rsquo;re an actual member.
        </p>

        {tab === 'workspaces' && <WorkspacesPanel />}
        {tab === 'users'      && <UsersPanel />}
        {tab === 'activity'   && <ActivityPanel />}
        {tab === 'system'     && <SystemPanel />}
      </div>
    </div>
  )
}
