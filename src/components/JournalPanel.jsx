import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  subscribeJournalRealtime,
  useCreateJournalEntry,
  useJournalEntries,
  usePeople,
} from '../lib/queries'
import {
  detectActiveMention,
  extractMentions,
  tokenizeBody,
} from '../lib/mentions'
import { picPill } from '../lib/colors'

// Comments thread (formerly "Journal"). Renders entries grouped by
// thread — top-level newest first, replies asc-by-time underneath.
// Supports @mention autocomplete in the composer.
//
// Modes:
//   - Sidebar / standalone (default): renders the panel header
//   - Embedded (passed `embedded`): no header, square corners
export default function JournalPanel({
  taskId,
  onClose,
  embedded = false,
  inputRef,
}) {
  const { data: entries = [], isLoading } = useJournalEntries(taskId)
  const { data: people = [] } = usePeople()
  const createEntry = useCreateJournalEntry(taskId)
  const qc = useQueryClient()

  // Realtime: re-fetch on any insert/update/delete to journal_entries
  // scoped to this task. Cheap because each change is small.
  useEffect(() => {
    const off = subscribeJournalRealtime(taskId, qc)
    return off
  }, [taskId, qc])

  // Group entries into top-level + replies.
  const { topLevel, repliesByParent } = useMemo(() => {
    const top = []
    const replies = new Map()
    for (const e of entries) {
      if (e.parent_id) {
        if (!replies.has(e.parent_id)) replies.set(e.parent_id, [])
        replies.get(e.parent_id).push(e)
      } else {
        top.push(e)
      }
    }
    // top-level is already desc-by-created from fetch. Replies should
    // read top→bottom asc by time.
    for (const list of replies.values()) {
      list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    }
    return { topLevel: top, repliesByParent: replies }
  }, [entries])

  const totalCount = entries.length

  return (
    <div
      className={
        embedded
          ? 'w-full bg-surface flex flex-col'
          : 'w-full sm:w-72 flex-shrink-0 bg-surface-2 flex flex-col sm:rounded-r-2xl rounded-b-2xl sm:rounded-bl-none'
      }
    >
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <i className="ti ti-message-2 text-text-2 text-sm" />
            <span className="text-sm font-medium">Comments</span>
            <span className="text-[10px] px-1.5 py-px rounded-full bg-info-bg text-info-text font-medium">
              {totalCount}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text p-1"
            aria-label="Hide comments"
          >
            <i className="ti ti-chevron-right text-sm" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[60vh]">
        {isLoading ? (
          <div className="text-xs text-text-3 text-center py-6">Loading…</div>
        ) : topLevel.length === 0 ? (
          <div className="text-xs text-text-3 text-center py-6">
            No comments yet. Start a thread below.
          </div>
        ) : (
          topLevel.map((e) => (
            <CommentThread
              key={e.id}
              entry={e}
              replies={repliesByParent.get(e.id) ?? []}
              people={people}
              onPostReply={(reply) => createEntry.mutate(reply)}
            />
          ))
        )}
      </div>

      <Composer
        people={people}
        inputRef={inputRef}
        embedded={embedded}
        onSubmit={(body, mentions) =>
          createEntry.mutate({ body, mentions, parentId: null })
        }
        placeholder="Add a comment… type @ to mention someone"
      />
    </div>
  )
}

// ============================================================
// Thread = one top-level comment + its replies
// ============================================================

function CommentThread({ entry, replies, people, onPostReply }) {
  const [replying, setReplying] = useState(false)
  return (
    <div>
      <CommentRow entry={entry} people={people} />
      <div className="ml-5 mt-2 space-y-2 border-l-2 border-border pl-3">
        {replies.map((r) => (
          <CommentRow key={r.id} entry={r} people={people} compact />
        ))}
        {replying ? (
          <Composer
            people={people}
            embedded
            compact
            autoFocus
            placeholder="Reply…"
            onCancel={() => setReplying(false)}
            onSubmit={(body, mentions) => {
              onPostReply({ body, mentions, parentId: entry.id })
              setReplying(false)
            }}
          />
        ) : (
          <button
            onClick={() => setReplying(true)}
            className="text-[11px] text-text-3 hover:text-text underline"
          >
            Reply
          </button>
        )}
      </div>
    </div>
  )
}

function CommentRow({ entry, people, compact }) {
  const tokens = useMemo(
    () => tokenizeBody(entry.body, people),
    [entry.body, people],
  )
  return (
    <div>
      <div className="text-[11px] text-text-2 font-medium mb-1 flex items-center gap-1.5">
        {entry.author_name && (
          <span className="text-text">{entry.author_name}</span>
        )}
        <span className="text-text-3">{formatJournalTime(entry.created_at)}</span>
      </div>
      <div
        className={`text-xs leading-relaxed bg-surface rounded p-2 border-l-2 border-info ${
          compact ? '' : ''
        }`}
      >
        {tokens.map((tok, i) =>
          tok.type === 'mention' ? (
            <span
              key={i}
              className={`inline-flex items-center px-1 py-px rounded text-[10px] font-medium align-baseline mx-px ${
                tok.person
                  ? picPill(tok.person.color)
                  : 'bg-surface-2 text-text-3'
              }`}
              title={tok.person?.name ?? `Unknown: ${tok.value}`}
            >
              {tok.value}
            </span>
          ) : (
            <span key={i}>{tok.value}</span>
          ),
        )}
      </div>
    </div>
  )
}

// ============================================================
// Composer with @mention autocomplete
// ============================================================

function Composer({
  people,
  inputRef: externalRef,
  embedded,
  compact,
  autoFocus,
  placeholder,
  onSubmit,
  onCancel,
}) {
  const [body, setBody] = useState('')
  const [caret, setCaret] = useState(0)
  const localRef = useRef(null)
  const taRef = externalRef ?? localRef

  // Detect active @mention so we can show the autocomplete dropdown.
  const mention = useMemo(
    () => detectActiveMention(body, caret),
    [body, caret],
  )
  const suggestions = useMemo(() => {
    if (!mention.active) return []
    const q = (mention.query || '').toLowerCase()
    return people
      .filter((p) =>
        p.name?.split(' ')[0].toLowerCase().startsWith(q),
      )
      .slice(0, 6)
  }, [mention, people])
  const [highlightIdx, setHighlightIdx] = useState(0)
  useEffect(() => {
    setHighlightIdx(0)
  }, [mention.query, mention.active])

  function insertMention(person) {
    const first = person.name.split(' ')[0]
    const before = body.slice(0, mention.startIdx)
    const after = body.slice(caret)
    // Append a trailing space so user can keep typing without a manual space.
    const insertion = `@${first} `
    const next = before + insertion + after
    setBody(next)
    // Move caret to right after the insertion
    const nextCaret = before.length + insertion.length
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.focus()
        taRef.current.setSelectionRange(nextCaret, nextCaret)
        setCaret(nextCaret)
      }
    })
  }

  function handleSubmit(e) {
    e?.preventDefault?.()
    const trimmed = body.trim()
    if (!trimmed) return
    const mentions = extractMentions(trimmed, people)
    setBody('')
    onSubmit(trimmed, mentions)
  }

  function handleKey(e) {
    if (mention.active && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx((i) => Math.min(suggestions.length - 1, i + 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx((i) => Math.max(0, i - 1))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const pick = suggestions[highlightIdx]
        if (pick) insertMention(pick)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        // Force-close the mention without losing typed text
        setCaret((c) => c - 0) // no-op; closing happens by losing match
        return
      }
    }
    // Cmd/Ctrl+Enter submits even with no mention active
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  useEffect(() => {
    if (autoFocus && taRef.current) taRef.current.focus()
  }, [autoFocus, taRef])

  return (
    <form
      onSubmit={handleSubmit}
      className={
        embedded
          ? `${compact ? 'p-0' : 'border-t border-border bg-surface-2 p-3 rounded-b-2xl'}`
          : 'border-t border-border bg-surface p-3 rounded-b-2xl sm:rounded-bl-none'
      }
    >
      <div className="relative">
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            setCaret(e.target.selectionStart ?? e.target.value.length)
          }}
          onSelect={(e) => setCaret(e.target.selectionStart ?? 0)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          rows={compact ? 2 : 3}
          className="w-full text-xs p-2 border border-border rounded resize-y outline-none focus:border-info bg-surface"
        />
        {mention.active && suggestions.length > 0 && (
          <ul className="absolute z-30 left-2 top-full mt-1 bg-surface border border-border rounded-md shadow-lg min-w-[140px] py-1">
            {suggestions.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertMention(p)
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
                    i === highlightIdx
                      ? 'bg-surface-2 text-text'
                      : 'text-text-2 hover:bg-surface-2'
                  }`}
                >
                  <span
                    className={`px-1.5 py-px rounded text-[10px] font-medium ${picPill(p.color)}`}
                  >
                    {p.name.split(' ')[0]}
                  </span>
                  <span className="truncate text-text-3">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-between items-center mt-2">
        <div className="text-[10px] text-text-3">
          <kbd className="px-1 border border-border rounded">⌘↵</kbd> to post
          {!compact && (
            <span className="ml-2">
              · <kbd className="px-1 border border-border rounded">@</kbd> to
              mention
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-[11px] text-text-3 hover:text-text underline"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!body.trim()}
            className="text-[11px] font-medium px-3 py-1 rounded bg-info text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          >
            {onCancel ? 'Reply' : 'Post'}
          </button>
        </div>
      </div>
    </form>
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
