import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { usePeople, useRecentActivity } from '../lib/queries'
import { formatTimeAgo } from '../lib/dates'

// ActivityFeed renders the workspace's recent action log. Two
// surfaces use it:
//   - Settings → Activity (owners/superadmins) — a dedicated panel.
//     Pass `chromeless` so it skips its own wrapper styling.
//   - (previously) Home, below the active view — removed in favor
//     of the dedicated Settings tab.
export default function ActivityFeed({
  onOpenTask,
  compactLimit = 5,
  chromeless = false,
}) {
  const { data: activity = [], isLoading } = useRecentActivity({ limit: 30 })
  const { data: people = [] } = usePeople()
  const { user } = useAuth()
  const [expanded, setExpanded] = useState(false)

  const actorMap = useMemo(() => {
    const m = new Map()
    for (const p of people) {
      if (p.user_id) m.set(p.user_id, p.name)
    }
    return m
  }, [people])

  function actorName(actorId) {
    if (!actorId) return 'System'
    if (actorId === user?.id) return 'You'
    return actorMap.get(actorId) ?? 'Someone'
  }

  if (isLoading) {
    return chromeless ? (
      <div className="text-xs text-text-3 text-center py-8">Loading activity…</div>
    ) : null
  }

  if (activity.length === 0) {
    return chromeless ? (
      <div className="text-xs text-text-3 text-center py-10">
        No recent activity yet. Once people start creating and editing
        tasks, you&rsquo;ll see a live log here.
      </div>
    ) : null
  }

  const visible = expanded ? activity : activity.slice(0, compactLimit)
  const hasMore = activity.length > compactLimit

  // Chromeless mode skips the bordered card + heading because the
  // parent panel already provides them.
  const rows = (
    <div className="space-y-1">
      {visible.map((entry) => (
        <ActivityRow
          key={entry.id}
          entry={entry}
          actorName={actorName(entry.actor_id)}
          onOpenTask={onOpenTask}
        />
      ))}
      {hasMore && chromeless && (
        <div className="pt-2 mt-1 border-t border-border">
          <button
            onClick={() => setExpanded((x) => !x)}
            className="text-[11px] text-text-3 hover:text-text underline"
          >
            {expanded ? 'Show less' : `Show all ${activity.length}`}
          </button>
        </div>
      )}
    </div>
  )

  if (chromeless) return rows

  return (
    <div className="bg-surface-2 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 mb-4">
      <div className="flex items-center justify-between text-xs text-text-2 mb-2">
        <div className="flex items-center gap-2">
          <i className="ti ti-history text-sm" />
          <span>Recent activity</span>
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded((x) => !x)}
            className="text-[11px] text-text-3 hover:text-text underline"
          >
            {expanded ? 'Show less' : `Show all ${activity.length}`}
          </button>
        )}
      </div>
      {rows}
    </div>
  )
}

function ActivityRow({ entry, actorName, onOpenTask }) {
  const taskTitle = entry.task?.title ?? entry.payload?.title ?? null

  let body
  switch (entry.action) {
    case 'task.created':
      body = (
        <>
          added <TaskLink title={taskTitle} taskId={entry.task_id} onOpenTask={onOpenTask} />
        </>
      )
      break
    case 'task.updated': {
      const changes = Object.keys(entry.payload?.changes ?? {})
      let changeLabel
      if (changes.length === 0) changeLabel = 'a field'
      else if (changes.length === 1) changeLabel = humanizeField(changes[0])
      else changeLabel = `${changes.length} fields`
      body = (
        <>
          changed {changeLabel} on{' '}
          <TaskLink title={taskTitle} taskId={entry.task_id} onOpenTask={onOpenTask} />
        </>
      )
      break
    }
    case 'task.deleted':
      body = (
        <>
          deleted {taskTitle ? <em>&ldquo;{truncate(taskTitle, 40)}&rdquo;</em> : 'a task'}
        </>
      )
      break
    case 'share.copied': {
      const picName = entry.payload?.pic_name?.split(' ')[0] ?? 'someone'
      const count = entry.payload?.task_count ?? 0
      body = (
        <>
          copied {count} task{count === 1 ? '' : 's'} for {picName} to clipboard
        </>
      )
      break
    }
    default:
      body = <>{entry.action}</>
  }

  return (
    <div className="text-[12px] text-text-2 flex items-baseline gap-2">
      <span className="font-medium text-text whitespace-nowrap">{actorName}</span>
      <span className="flex-1 min-w-0">{body}</span>
      <span className="text-text-3 text-[10px] whitespace-nowrap">
        {formatTimeAgo(entry.created_at)}
      </span>
    </div>
  )
}

function TaskLink({ title, taskId, onOpenTask }) {
  if (!title) return <em className="text-text-3">a task</em>
  if (!taskId) {
    return <em>&ldquo;{truncate(title, 40)}&rdquo;</em>
  }
  return (
    <button
      onClick={() => onOpenTask?.(taskId)}
      className="text-info hover:underline truncate align-baseline"
    >
      &ldquo;{truncate(title, 40)}&rdquo;
    </button>
  )
}

function humanizeField(field) {
  return {
    pic_id: 'PIC',
    department_id: 'department',
    due_date: 'due date',
    raised_date: 'raised date',
    status: 'status',
    priority: 'priority',
    tags: 'tags',
    title: 'title',
    notes: 'notes',
  }[field] ?? field
}

function truncate(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
