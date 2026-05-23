import { useEffect, useState } from 'react'
import { fetchTaskActivity } from '../api/activity'
import { usePeople } from '../lib/queries'
import { supabase } from '../lib/supabase'

// Read-only timeline of every action recorded against a task —
// status changes, PIC reassignments, due changes, watcher add/remove,
// comments added, AI commands run. Reads activity_log filtered by
// task_id. RLS already scopes by workspace via tasks join.

export default function TaskActivityPanel({ taskId }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [actorNames, setActorNames] = useState({}) // userId -> name
  const { data: people = [] } = usePeople()

  useEffect(() => {
    if (!taskId || String(taskId).startsWith('temp-')) {
      setEntries([])
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const rows = await fetchTaskActivity(taskId)
        if (cancelled) return
        setEntries(rows)
        // Resolve actor ids → names via people (people.user_id link).
        const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))]
        if (ids.length) {
          const { data: pp } = await supabase
            .from('people')
            .select('user_id, name')
            .in('user_id', ids)
          if (cancelled) return
          const map = {}
          for (const p of pp ?? []) {
            if (p.user_id && !map[p.user_id]) map[p.user_id] = p.name
          }
          setActorNames(map)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [taskId])

  if (loading) {
    return (
      <div className="p-6 text-center text-xs text-text-3">
        Loading activity…
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-text-3">
        No recorded activity yet. Changes you make will show up here.
      </div>
    )
  }

  return (
    <ol className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
      {entries.map((e) => (
        <ActivityRow
          key={e.id}
          entry={e}
          actorName={
            e.actor_id
              ? actorNames[e.actor_id] ?? 'Unknown'
              : 'System'
          }
          people={people}
        />
      ))}
    </ol>
  )
}

function ActivityRow({ entry, actorName, people }) {
  const { icon, text } = describeActivity(entry, people)
  return (
    <li className="flex items-start gap-3 text-xs">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-2 text-text-2 flex items-center justify-center mt-0.5">
        <i className={`ti ${icon} text-sm`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="leading-snug">
          <span className="font-medium text-text">{actorName}</span>{' '}
          <span className="text-text-2">{text}</span>
        </div>
        <div className="text-[10px] text-text-3 mt-0.5">
          {formatTime(entry.created_at)}
        </div>
      </div>
    </li>
  )
}

function describeActivity(entry, people) {
  const { action, payload = {} } = entry
  switch (action) {
    case 'task.created':
      return { icon: 'ti-plus', text: 'created this task' }
    case 'task.updated': {
      const changes = payload.changes ?? {}
      const parts = []
      if ('status' in changes) parts.push(`set status to "${changes.status}"`)
      if ('priority' in changes)
        parts.push(`set priority to "${changes.priority}"`)
      if ('due_date' in changes)
        parts.push(
          changes.due_date ? `set due to ${changes.due_date}` : 'cleared the due date',
        )
      if ('pic_id' in changes) {
        const p = people.find((x) => x.id === changes.pic_id)
        parts.push(
          changes.pic_id
            ? `reassigned to ${p?.name ?? 'someone'}`
            : 'unassigned the PIC',
        )
      }
      if ('department_id' in changes) {
        parts.push(
          changes.department_id ? 'changed the department' : 'cleared the department',
        )
      }
      if ('title' in changes) parts.push('edited the title')
      if ('tags' in changes) parts.push('updated tags')
      const text = parts.length === 0 ? 'updated the task' : parts.join(' · ')
      return { icon: 'ti-edit', text }
    }
    case 'task.deleted':
      return { icon: 'ti-trash', text: 'deleted this task' }
    case 'watcher.added':
      return { icon: 'ti-user-plus', text: 'added a watcher' }
    case 'watcher.removed':
      return { icon: 'ti-user-minus', text: 'removed a watcher' }
    case 'journal.added':
    case 'comment.added':
      return { icon: 'ti-message-2', text: 'added a comment' }
    case 'ai.command': {
      const n = payload.task_count ?? '?'
      return {
        icon: 'ti-sparkles',
        text: `ran an AI command on ${n} task${n === 1 ? '' : 's'}`,
      }
    }
    case 'share.copied':
      return { icon: 'ti-brand-whatsapp', text: 'copied a share message' }
    default:
      return { icon: 'ti-circle-dot', text: action }
  }
}

function formatTime(iso) {
  const d = new Date(iso)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${hh}:${mm}`
}
