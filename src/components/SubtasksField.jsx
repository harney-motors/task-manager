import { useState } from 'react'
import SubtaskProgress from './SubtaskProgress'

// In-place subtasks list. The full array lives on tasks.subtasks (JSONB).
// Every mutation (add / toggle / edit / delete) calls the parent with
// the *new array*, which the parent persists via updateTask.

export default function SubtasksField({ subtasks = [], onChange, disabled }) {
  const [adding, setAdding] = useState('')

  const total = subtasks.length

  function add() {
    const title = adding.trim()
    if (!title) return
    const next = [
      ...subtasks,
      {
        id: cryptoId(),
        title,
        done: false,
        created_at: new Date().toISOString(),
      },
    ]
    onChange(next)
    setAdding('')
  }

  function toggle(id) {
    onChange(subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)))
  }

  function rename(id, title) {
    onChange(subtasks.map((s) => (s.id === id ? { ...s, title } : s)))
  }

  function remove(id) {
    onChange(subtasks.filter((s) => s.id !== id))
  }

  return (
    <div className="flex-1 min-w-0">
      {total > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <SubtaskProgress subtasks={subtasks} size="md" tone="auto" />
        </div>
      )}
      {total > 0 && (
        <ul className="space-y-1 mb-2">
          {subtasks.map((s) => (
            <SubtaskRow
              key={s.id}
              item={s}
              onToggle={() => toggle(s.id)}
              onRename={(t) => rename(s.id, t)}
              onRemove={() => remove(s.id)}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          disabled={disabled}
          placeholder="Add a subtask… (Enter)"
          className="flex-1 text-xs px-2 py-1 border border-border rounded bg-surface outline-none focus:border-info disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={!adding.trim() || disabled}
          className="text-[11px] px-2 py-1 rounded bg-info text-white font-medium disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  )
}

function SubtaskRow({ item, onToggle, onRename, onRemove, disabled }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.title)
  function commit() {
    const next = draft.trim()
    if (!next) {
      setDraft(item.title)
    } else if (next !== item.title) {
      onRename(next)
    }
    setEditing(false)
  }
  return (
    <li className="group flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={!!item.done}
        onChange={onToggle}
        disabled={disabled}
        className="flex-shrink-0 cursor-pointer"
        aria-label={item.done ? 'Mark not done' : 'Mark done'}
      />
      {editing ? (
        <input
          type="text"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              setDraft(item.title)
              setEditing(false)
            }
          }}
          className="flex-1 text-xs px-1 py-0.5 border border-border rounded bg-surface outline-none focus:border-info"
        />
      ) : (
        <button
          type="button"
          onClick={() => !disabled && setEditing(true)}
          className={`flex-1 text-left truncate hover:bg-surface-2 rounded px-1 -mx-1 ${
            item.done ? 'line-through text-text-3' : ''
          }`}
          title="Click to edit"
        >
          {item.title}
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        title="Remove subtask"
        className="text-text-3 hover:text-danger-text opacity-0 group-hover:opacity-100 flex-shrink-0 px-1"
        aria-label="Remove subtask"
      >
        <i className="ti ti-x text-xs" />
      </button>
    </li>
  )
}

function cryptoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback: timestamp + random (good enough for client-side ids)
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
