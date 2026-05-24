import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { searchAll } from '../api/search'
import { aiCommand } from '../api/aiCommand'
import { useDictation } from '../lib/useDictation'
import { getRecentTasks } from '../lib/recentTasks'
import { useDeleteSavedCommand, useSavedCommands } from '../lib/queries'
import { picPill } from '../lib/colors'
import { formatRelative } from '../lib/dates'

const AI_EXAMPLES = [
  "Show me Errol's overdue tasks",
  "What's due tomorrow",
  "Mark all of Asbert's done",
  'Move overdue parts tasks to next Monday',
]

export default function SearchPalette({
  open,
  onClose,
  onOpenTask,
  onSelectPic,
  onApplyFilter,
  onPreviewCommand,
}) {
  const { workspace } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ tasks: [], people: [], journal: [] })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [askingAi, setAskingAi] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [recent, setRecent] = useState([])
  const inputRef = useRef(null)
  const { data: savedCommands = [] } = useSavedCommands()
  const deleteSaved = useDeleteSavedCommand()

  // Voice input — appends each finalised chunk to the query.
  const dict = useDictation({
    onResult: (chunk) => {
      const trimmed = chunk.trim()
      if (!trimmed) return
      setQuery((prev) => (prev ? `${prev.trimEnd()} ${trimmed}` : trimmed))
    },
  })

  // Debounced search
  useEffect(() => {
    if (!query.trim() || !workspace) {
      setResults({ tasks: [], people: [], journal: [] })
      setIsSearching(false)
      setSearchError(null)
      return
    }
    const id = setTimeout(() => {
      setIsSearching(true)
      setSearchError(null)
      searchAll(workspace.id, query)
        .then((r) => {
          setResults(r)
          setSelectedIndex(0)
        })
        .catch((e) => {
          // Previously this was console.warn-only — a search failure
          // (RLS, network, malformed tsquery) just produced an empty
          // results list with no indication something went wrong.
          // Surface it inline so the user understands and can retry.
          console.warn('[search]', e)
          setSearchError(e?.message ?? 'Search failed')
          setResults({ tasks: [], people: [], journal: [] })
        })
        .finally(() => setIsSearching(false))
    }, 150)
    return () => clearTimeout(id)
  }, [query, workspace])

  // Reset / autofocus
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
      // Refresh recent list on each open so a task opened a moment
      // ago surfaces immediately.
      if (workspace?.id) setRecent(getRecentTasks(workspace.id))
    } else {
      setQuery('')
      setSelectedIndex(0)
      setResults({ tasks: [], people: [], journal: [] })
      setAskingAi(false)
      setAiError(null)
      // Stop any in-flight dictation when the palette closes
      if (dict.listening) dict.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleAskAi() {
    if (!query.trim()) return
    setAskingAi(true)
    setAiError(null)
    try {
      const { plan } = await aiCommand(query, { workspaceId: workspace?.id })
      if (plan.kind === 'filter') {
        onApplyFilter?.(plan.filter)
        onClose()
      } else if (plan.kind === 'command') {
        // Hand the plan off to the parent which renders the preview
        // modal. We close the palette so the preview lands cleanly.
        onPreviewCommand?.(plan)
        onClose()
      } else {
        setAiError('Unknown AI response shape')
      }
    } catch (e) {
      setAiError(e.message ?? 'AI request failed')
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
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-12 sm:pt-20 p-2 sm:p-4 tickd-modal-backdrop"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-xl overflow-hidden tickd-modal-content">
        <div className="flex items-center gap-3 p-3 border-b border-border">
          <i className="ti ti-search text-text-3 text-base" />
          <input
            ref={inputRef}
            value={
              dict.listening && dict.interim
                ? `${query}${query ? ' ' : ''}${dict.interim}`
                : query
            }
            onChange={(e) => {
              if (dict.listening) return // don't fight the interim text
              setQuery(e.target.value)
            }}
            placeholder={
              dict.listening
                ? 'Listening… speak your query'
                : 'Search tasks, people, notes…'
            }
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-text-3"
            autoComplete="off"
          />
          {isSearching && (
            <i className="ti ti-loader-2 animate-spin text-text-3 text-sm" />
          )}
          {dict.supported && (
            <button
              type="button"
              onClick={() => (dict.listening ? dict.stop() : dict.start())}
              title={dict.listening ? 'Stop listening' : 'Dictate query'}
              className={`flex-shrink-0 p-1.5 rounded ${
                dict.listening
                  ? 'bg-danger-bg text-danger-text animate-pulse'
                  : 'text-text-3 hover:text-text hover:bg-surface-2'
              }`}
              aria-label={dict.listening ? 'Stop listening' : 'Start dictation'}
            >
              <i
                className={`ti ${dict.listening ? 'ti-microphone-filled' : 'ti-microphone'} text-base`}
              />
            </button>
          )}
          <kbd className="text-[10px] text-text-3 border border-border rounded px-1.5 py-0.5 hidden sm:inline">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!query.trim() ? (
            <div className="py-1">
              {savedCommands.length > 0 && (
                <>
                  <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-text-3 font-medium">
                    Saved automations
                  </div>
                  {savedCommands.map((cmd) => (
                    <div
                      key={cmd.id}
                      className="w-full px-4 py-2 flex items-center gap-3 hover:bg-surface-2 group"
                    >
                      <i className="ti ti-sparkles text-info text-sm flex-shrink-0" />
                      <button
                        onClick={() => {
                          onPreviewCommand?.(cmd.plan)
                          onClose()
                        }}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="text-sm truncate">{cmd.name}</div>
                        <div className="text-[10px] text-text-3 truncate">
                          {cmd.plan?.summary || 'AI command'}
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Delete saved automation "${cmd.name}"?`)) {
                            deleteSaved.mutate(cmd.id)
                          }
                        }}
                        title="Delete"
                        className="text-text-3 hover:text-danger-text opacity-0 group-hover:opacity-100 p-1"
                        aria-label={`Delete ${cmd.name}`}
                      >
                        <i className="ti ti-x text-xs" />
                      </button>
                    </div>
                  ))}
                </>
              )}
              {recent.length > 0 && (
                <>
                  <div className="px-4 py-1 mt-1 text-[10px] uppercase tracking-wider text-text-3 font-medium">
                    Recently opened
                  </div>
                  {recent.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        onOpenTask(t.id)
                        onClose()
                      }}
                      className="w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-surface-2"
                    >
                      {t.pic_color ? (
                        <span
                          className={`flex-shrink-0 px-1.5 py-px rounded text-[10px] font-medium ${picPill(t.pic_color)}`}
                        >
                          {(t.pic_name?.split(' ')[0]) ?? '—'}
                        </span>
                      ) : (
                        <span className="flex-shrink-0 text-[10px] text-text-3">—</span>
                      )}
                      <span className="text-sm truncate flex-1 min-w-0">
                        {t.title}
                      </span>
                    </button>
                  ))}
                </>
              )}
              {/* Always-on AI examples so capability is discoverable. */}
              <div className="px-4 py-1 mt-1 text-[10px] uppercase tracking-wider text-text-3 font-medium">
                Try Tickd AI
              </div>
              {AI_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setQuery(ex)}
                  className="w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-surface-2 text-text-2 hover:text-text"
                >
                  <i className="ti ti-sparkles text-info text-sm flex-shrink-0" />
                  <span className="text-sm truncate flex-1 min-w-0">{ex}</span>
                  <span className="text-[10px] text-text-3 flex-shrink-0">
                    ⌘↵
                  </span>
                </button>
              ))}
              {savedCommands.length === 0 && recent.length === 0 && (
                <div className="px-4 py-2 text-[10px] text-text-3 border-t border-border mt-1">
                  Type to search · ⌘↵ to ask Tickd AI
                </div>
              )}
            </div>
          ) : searchError ? (
            <div className="px-4 py-6 text-center">
              <div className="text-sm text-danger-text mb-1">Search failed</div>
              <div className="text-[11px] text-text-3">{searchError}</div>
              <div className="text-[10px] text-text-3 mt-2">
                Ask Tickd AI instead with ⌘↵
              </div>
            </div>
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

        {query.trim().length >= 2 && (onApplyFilter || onPreviewCommand) && (
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
            {(onApplyFilter || onPreviewCommand) && (
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
