import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { searchAll } from '../api/search'
import { nlFilter } from '../api/aiFilter'
import { picPill } from '../lib/colors'
import { formatRelative } from '../lib/dates'

export default function SearchPalette({
  open,
  onClose,
  onOpenTask,
  onSelectPic,
  onApplyFilter,
}) {
  const { workspace } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ tasks: [], people: [], journal: [] })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [askingAi, setAskingAi] = useState(false)
  const [aiError, setAiError] = useState(null)
  const inputRef = useRef(null)

  // Debounced search
  useEffect(() => {
    if (!query.trim() || !workspace) {
      setResults({ tasks: [], people: [], journal: [] })
      setIsSearching(false)
      return
    }
    const id = setTimeout(() => {
      setIsSearching(true)
      searchAll(workspace.id, query)
        .then((r) => {
          setResults(r)
          setSelectedIndex(0)
        })
        .catch((e) => console.warn('[search]', e))
        .finally(() => setIsSearching(false))
    }, 150)
    return () => clearTimeout(id)
  }, [query, workspace])

  // Reset / autofocus
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setQuery('')
      setSelectedIndex(0)
      setResults({ tasks: [], people: [], journal: [] })
      setAskingAi(false)
      setAiError(null)
    }
  }, [open])

  async function handleAskAi() {
    if (!query.trim() || !onApplyFilter) return
    setAskingAi(true)
    setAiError(null)
    try {
      const { filter } = await nlFilter(query)
      onApplyFilter(filter)
      onClose()
    } catch (e) {
      setAiError(e.message ?? 'AI search failed')
    } finally {
      setAskingAi(false)
    }
  }

  // Flatten results for arrow-key navigation
  const flat = [
    ...results.tasks.map((t) => ({ kind: 'task', item: t })),
    ...results.people.map((p) => ({ kind: 'person', item: p })),
    ...results.journal.map((j) => ({ kind: 'journal', item: j })),
  ]

  function activate(entry) {
    if (!entry) return
    if (entry.kind === 'task') onOpenTask(entry.item.id)
    else if (entry.kind === 'person') onSelectPic(entry.item.id)
    else if (entry.kind === 'journal') onOpenTask(entry.item.task_id)
    onClose()
  }

  // Keyboard nav
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(flat.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        // Cmd/Ctrl+Enter → ask AI; plain Enter → open selected result
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          handleAskAi()
        } else if (flat[selectedIndex]) {
          e.preventDefault()
          activate(flat[selectedIndex])
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, flat, selectedIndex, onClose, query])

  if (!open) return null

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-12 sm:pt-20 p-2 sm:p-4"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-xl overflow-hidden">
        <div className="flex items-center gap-3 p-3 border-b border-border">
          <i className="ti ti-search text-text-3 text-base" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, people, notes…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-text-3"
            autoComplete="off"
          />
          {isSearching && (
            <i className="ti ti-loader-2 animate-spin text-text-3 text-sm" />
          )}
          <kbd className="text-[10px] text-text-3 border border-border rounded px-1.5 py-0.5 hidden sm:inline">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!query.trim() ? (
            <Empty msg="Type to search tasks, people, and journal notes." />
          ) : flat.length === 0 && !isSearching ? (
            <Empty msg={`No matches for "${query}"`} />
          ) : (
            <div className="py-1">
              {results.tasks.length > 0 && (
                <Section
                  title="Tasks"
                  startIndex={0}
                  items={results.tasks}
                  selectedIndex={selectedIndex}
                  flat={flat}
                  activate={activate}
                  renderRow={taskRow}
                />
              )}
              {results.people.length > 0 && (
                <Section
                  title="People"
                  startIndex={results.tasks.length}
                  items={results.people}
                  selectedIndex={selectedIndex}
                  flat={flat}
                  activate={activate}
                  renderRow={personRow}
                />
              )}
              {results.journal.length > 0 && (
                <Section
                  title="Notes"
                  startIndex={results.tasks.length + results.people.length}
                  items={results.journal}
                  selectedIndex={selectedIndex}
                  flat={flat}
                  activate={activate}
                  renderRow={journalRow}
                />
              )}
            </div>
          )}
        </div>

        {query.trim().length >= 4 && onApplyFilter && (
          <div className="border-t border-border bg-info-bg/40">
            <button
              onClick={handleAskAi}
              disabled={askingAi}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-info-bg/60 disabled:opacity-60"
            >
              <i
                className={`ti ${askingAi ? 'ti-loader-2 animate-spin' : 'ti-sparkles'} text-info text-sm flex-shrink-0`}
              />
              <div className="flex-1 min-w-0 text-sm">
                {askingAi ? 'Asking Tickd AI…' : (
                  <>
                    Ask Tickd AI: <span className="text-text-2">&ldquo;{query}&rdquo;</span>
                  </>
                )}
              </div>
              <kbd className="hidden sm:inline text-[10px] text-text-3 border border-border bg-surface rounded px-1">
                ⌘↵
              </kbd>
            </button>
            {aiError && (
              <div className="px-4 pb-2 text-[11px] text-danger-text">{aiError}</div>
            )}
          </div>
        )}

        {flat.length > 0 && (
          <div className="border-t border-border px-3 py-2 flex items-center gap-3 text-[10px] text-text-3 bg-surface-2 flex-wrap">
            <span>
              <kbd className="border border-border bg-surface rounded px-1">↑↓</kbd> nav
            </span>
            <span>
              <kbd className="border border-border bg-surface rounded px-1">↵</kbd> open
            </span>
            {onApplyFilter && (
              <span>
                <kbd className="border border-border bg-surface rounded px-1">⌘↵</kbd> ask AI
              </span>
            )}
            <span>
              <kbd className="border border-border bg-surface rounded px-1">esc</kbd> close
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function Empty({ msg }) {
  return <div className="p-8 text-center text-xs text-text-3">{msg}</div>
}

function Section({ title, items, startIndex, selectedIndex, flat, activate, renderRow }) {
  return (
    <div className="mb-1">
      <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-text-3 font-medium">
        {title}
      </div>
      {items.map((item, i) => {
        const idx = startIndex + i
        const isSelected = selectedIndex === idx
        return (
          <button
            key={item.id}
            onClick={() => activate(flat[idx])}
            className={`w-full text-left px-4 py-2 flex items-center gap-3 ${
              isSelected ? 'bg-surface-2' : 'hover:bg-surface-2'
            }`}
          >
            {renderRow(item)}
          </button>
        )
      })}
    </div>
  )
}

function taskRow(t) {
  return (
    <>
      <i className="ti ti-checkbox text-text-3 text-sm flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{t.title}</div>
        <div className="text-[11px] text-text-2 flex items-center gap-2 mt-0.5">
          {t.pic && (
            <span className={`px-1.5 py-px rounded text-[10px] ${picPill(t.pic.color)}`}>
              {t.pic.name.split(' ')[0]}
            </span>
          )}
          <span>{t.status}</span>
          {t.due_date && <span>· {formatRelative(t.due_date)}</span>}
        </div>
      </div>
    </>
  )
}

function personRow(p) {
  return (
    <>
      <i className="ti ti-user text-text-3 text-sm flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{p.name}</div>
        <div className="text-[11px] text-text-2 truncate">
          {p.title || '—'}
          {p.department && ` · ${p.department}`}
        </div>
      </div>
    </>
  )
}

function journalRow(j) {
  return (
    <>
      <i className="ti ti-notebook text-text-3 text-sm flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{j.body}</div>
        <div className="text-[11px] text-text-2 truncate">
          on: {j.task?.title}
        </div>
      </div>
    </>
  )
}
