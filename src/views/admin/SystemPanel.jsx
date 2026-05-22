import { useAdminSystemStats } from '../../lib/queries'

function Stat({ label, value, icon }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-text-2 text-xs mb-2">
        <i className={`ti ${icon} text-sm`} />
        <span>{label}</span>
      </div>
      <div className="text-2xl font-medium tracking-tight">{value ?? '—'}</div>
    </div>
  )
}

export default function SystemPanel() {
  const { data: stats, isLoading } = useAdminSystemStats()

  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-text-3">Loading…</div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <Stat label="Auth users" value={stats?.total_users} icon="ti-users" />
        <Stat label="Superadmins" value={stats?.total_superadmins} icon="ti-shield-lock" />
        <Stat label="Workspaces" value={stats?.total_workspaces} icon="ti-building" />
        <Stat label="Tasks" value={stats?.total_tasks} icon="ti-checkbox" />
        <Stat label="People records" value={stats?.total_people} icon="ti-user" />
        <Stat label="Activity entries" value={stats?.total_activity} icon="ti-history" />
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 text-xs text-text-2 space-y-2">
        <div className="text-sm font-medium text-text">Notes</div>
        <p>
          These are raw counts. They include archived/deactivated records.
        </p>
        <p>
          Anthropic API usage (cost of meeting extractions + NL queries) and
          Supabase storage usage aren&rsquo;t aggregated here yet — pull those
          from the Anthropic and Supabase dashboards directly.
        </p>
      </div>
    </div>
  )
}
