import { useState } from 'react'
import { useJournalEntries, useCreateJournalEntry } from '../lib/queries'

export default function JournalPanel({ taskId, onClose }) {
  const { data: entries = [], isLoading } = useJournalEntries(taskId)
  const createEntry = useCreateJournalEntry(taskId)
  const [body, setBody] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return
    setBody('')
    createEntry.mutate(trimmed)
  }

  return (
    <div className="w-full sm:w-72 flex-shrink-0 bg-surface-2 flex flex-col sm:rounded-r-2xl rounded-b-2xl sm:rounded-bl-none">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <i className="ti ti-notebook text-text-2 text-sm" />
          <span className="text-sm font-medium">Journal</span>
          <span className="text-[10px] px-1.5 py-px rounded-full bg-info-bg text-info-text font-medium">
            {entries.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-text-3 hover:text-text p-1"
          aria-label="Hide journal"
        >
          <i className="ti ti-chevron-right text-sm" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-96">
        {isLoading ? (
          <div className="text-xs text-text-3 text-center py-6">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="text-xs text-text-3 text-center py-6">
            No journal entries yet.
          </div>
        ) : (
          entries.map((e) => (
            <div key={e.id}>
              <div className="text-[11px] text-text-2 font-medium mb-1 flex items-center gap-1.5">
                {e.author_name && (
                  <span className="text-text">{e.author_name}</span>
                )}
                <span className="text-text-3">
                  {formatJournalTime(e.created_at)}
                </span>
              </div>
              <div className="text-xs leading-relaxed bg-surface rounded p-2 border-l-2 border-info">
                {e.body}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border bg-surface p-3 rounded-b-2xl sm:rounded-bl-none">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a progress note…"
          rows={3}
          className="w-full text-xs p-2 border border-border rounded resize-y outline-none focus:border-info"
        />
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            disabled={!body.trim()}
            className="text-[11px] font-medium px-3 py-1 rounded bg-info text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          >
            Save note
          </button>
        </div>
      </form>
    </div>
  )
}

function formatJournalTime(iso) {
  const d = new Date(iso)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const day = days[d.getDay()]
  const dayNum = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${dayNum} · ${hh}:${mm}`
}
