import { useMemo } from 'react'
import { useAdminActivity, useAdminUsers } from '../../lib/queries'

function fmtRelative(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ActivityPanel() {
  const { data: activity = [], isLoading } = useAdminActivity({ limit: 100 })
  const { data: users = [] } = useAdminUsers()

  const userMap = useMemo(() => {
    const m = new Map()
    for (const u of users) m.set(u.id, u.email)
    return m
  }, [users])

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-medium">Cross-workspace activity</h2>
        <p className="text-xs text-text-2 mt-0.5">
          Last {activity.length} events across every workspace. Task titles are
          shown for context but content stays inside each workspace.
        </p>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-text-3">Loading…</div>
      ) : activity.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-3">No activity yet.</div>
      ) : (
        <div className="divide-y divide-border">
          {activity.map((e) => (
            <ActivityRow
              key={e.id}
              entry={e}
              actorEmail={userMap.get(e.actor_id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ActivityRow({ entry, actorEmail }) {
  const action = entry.action
  const taskTitle = entry.task?.title ?? entry.payload?.title
  const workspaceName = entry.workspace?.name ?? '—'

  let phrase
  if (action === 'task.created') {
    phrase = (
      <>
        created <em>&ldquo;{truncate(taskTitle, 50)}&rdquo;</em>
      </>
    )
  } else if (action === 'task.updated') {
    const changes = Object.keys(entry.payload?.changes ?? {})
    phrase = (
      <>
        updated {changes.length === 1 ? changes[0] : `${changes.length} fields`} on{' '}
        <em>&ldquo;{truncate(taskTitle, 40)}&rdquo;</em>
      </>
    )
  } else if (action === 'task.deleted') {
    phrase = <>deleted a task</>
  } else if (action === 'share.copied') {
    phrase = <>copied {entry.payload?.task_count ?? 0} tasks for {entry.payload?.pic_name?.split(' ')[0] ?? '—'}</>
  } else {
    phrase = <>{action}</>
  }

  return (
    <div className="px-4 py-2.5 text-xs flex items-baseline gap-2 flex-wrap">
      <span className="text-text-3 text-[10px] whitespace-nowrap min-w-[80px]">
        {fmtRelative(entry.created_at)}
      </span>
      <span className="font-medium text-text whitespace-nowrap">
        {actorEmail ?? 'Unknown'}
      </span>
      <span className="text-text-2 flex-1 min-w-0">{phrase}</span>
      <span className="text-text-3 text-[10px] whitespace-nowrap">
        in <span className="text-text-2">{workspaceName}</span>
      </span>
    </div>
  )
}

function truncate(s, n) {
  if (!s) return '—'
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
