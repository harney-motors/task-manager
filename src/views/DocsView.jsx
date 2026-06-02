import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useCreateDoc,
  useCreateTask,
  useDeleteDoc,
  useDoc,
  useDocs,
  useUpdateDoc,
} from '../lib/queries'
import { useAuth } from '../auth/AuthProvider'
import { useToast } from '../components/Toast'
import { useDictation } from '../lib/useDictation'
import { formatTimeAgo } from '../lib/dates'
import Skeleton from '../components/Skeleton'

// DocsView — flat list of markdown docs in the active workspace.
//
// Editor model: a single writing surface. Two control surfaces:
//   1. Sticky toolbar above the editor (always present, operates on
//      the cursor or selection).
//   2. Floating selection bubble that appears when the user selects
//      text — surfaces the same actions in-context.
//
// Storage: markdown text in `docs.body`. Output stays plain markdown
// so existing docs render unchanged.
export default function DocsView() {
  const { workspace } = useAuth()
  const {
    data: docs = [],
    isLoading,
    error,
    refetch,
    isFetching,
  } = useDocs()
  const createDoc = useCreateDoc()
  const showToast = useToast()
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const canWrite = workspace?.role === 'editor' || workspace?.role === 'owner'

  const needsMigration = !!(
    error &&
    (String(error?.message ?? '').includes("table 'public.docs'") ||
      String(error?.code ?? '') === 'PGRST205' ||
      String(error?.code ?? '') === '42P01')
  )
  if (needsMigration) return <DocsSetupGuide />

  // Network / RLS / generic errors — show a real banner with retry
  // instead of silently rendering an empty list. Without this, an
  // intermittent "Load failed" looked like "all my docs disappeared".
  if (error) {
    return (
      <DocsLoadError
        error={error}
        onRetry={refetch}
        retrying={isFetching}
      />
    )
  }

  const autoSelectedRef = useRef(false)
  useEffect(() => {
    if (autoSelectedRef.current) return
    if (isLoading) return
    if (selectedId) {
      autoSelectedRef.current = true
      return
    }
    if (docs.length > 0) setSelectedId(docs[0].id)
    autoSelectedRef.current = true
  }, [docs, isLoading, selectedId])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    autoSelectedRef.current = false
    setSelectedId(null)
  }, [workspace?.id])

  const filtered = useMemo(() => {
    if (!search) return docs
    const q = search.trim().toLowerCase()
    return docs.filter(
      (d) =>
        d.title?.toLowerCase().includes(q) ||
        d.body?.toLowerCase().includes(q),
    )
  }, [docs, search])

  function handleCreate() {
    createDoc.mutate(
      { title: 'Untitled', body: '' },
      {
        onSuccess: (doc) => {
          setSelectedId(doc.id)
          showToast('New doc created')
        },
      },
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 lg:min-h-[calc(100vh-6rem)]">
      <DocList
        docs={filtered}
        totalCount={docs.length}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        isLoading={isLoading}
        search={search}
        setSearch={setSearch}
        canWrite={canWrite}
        hideOnMobile={!!selectedId}
      />
      {selectedId ? (
        <DocEditor
          id={selectedId}
          onBack={() => setSelectedId(null)}
          onDeleted={() => setSelectedId(null)}
          canWrite={canWrite}
        />
      ) : (
        <DocEmpty
          onCreate={handleCreate}
          canWrite={canWrite}
          hasDocs={docs.length > 0}
        />
      )}
    </div>
  )
}

// ============================================================
// Doc list
// ============================================================

function DocList({
  docs,
  totalCount,
  selectedId,
  onSelect,
  onCreate,
  isLoading,
  search,
  setSearch,
  canWrite,
  hideOnMobile,
}) {
  return (
    <aside
      className={`bg-surface border border-border rounded-2xl flex flex-col w-full lg:w-[280px] flex-shrink-0 ${
        hideOnMobile ? 'hidden lg:flex' : ''
      }`}
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold tracking-tight">Docs</h2>
          <span className="text-[11px] text-text-3 font-medium">
            {totalCount} {totalCount === 1 ? 'doc' : 'docs'}
          </span>
        </div>
        {canWrite && (
          <button
            onClick={onCreate}
            className="w-full h-9 inline-flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg bg-info text-white hover:opacity-95 active:scale-[0.98] transition-all shadow-sm shadow-info/20"
          >
            <i className="ti ti-plus text-base" />
            New doc
          </button>
        )}
        <div className="relative mt-3">
          <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-text-3 text-sm pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search docs…"
            className="w-full text-sm pl-9 pr-3 py-2 rounded-lg bg-surface-2/60 border border-transparent outline-none focus:border-info focus:bg-surface placeholder:text-text-3"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5 max-h-[60vh] lg:max-h-none">
        {isLoading ? (
          <div className="p-2">
            <Skeleton.TaskRows rows={4} />
          </div>
        ) : docs.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-text-3">
            {search
              ? 'No matches.'
              : canWrite
                ? 'No docs yet — create your first.'
                : 'No docs in this workspace yet.'}
          </div>
        ) : (
          docs.map((d) => (
            <DocListRow
              key={d.id}
              doc={d}
              selected={d.id === selectedId}
              onClick={() => onSelect(d.id)}
            />
          ))
        )}
      </div>
    </aside>
  )
}

function DocListRow({ doc, selected, onClick }) {
  const preview = useMemo(() => {
    if (!doc.body) return ''
    const firstLine = doc.body
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0)
    if (!firstLine) return ''
    return firstLine
      .replace(/^#+\s+/, '')
      .replace(/\*\*|__|`|\*|_|>/g, '')
      .slice(0, 90)
  }, [doc.body])
  return (
    <button
      onClick={onClick}
      className={`group w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
        selected
          ? 'bg-info-bg/60 text-text'
          : 'hover:bg-surface-2/70 text-text-2 hover:text-text'
      }`}
    >
      <div className="flex items-start gap-2">
        <i
          className={`ti ti-file-text text-base mt-0.5 flex-shrink-0 ${
            selected ? 'text-info' : 'text-text-3'
          }`}
        />
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm leading-snug truncate ${selected ? 'font-semibold' : 'font-medium'}`}
          >
            {doc.title?.trim() || 'Untitled'}
          </div>
          {preview && (
            <div className="text-[11.5px] text-text-3 truncate mt-0.5 leading-snug">
              {preview}
            </div>
          )}
          <div className="text-[10.5px] text-text-3 mt-1.5">
            {formatTimeAgo(doc.updated_at)}
          </div>
        </div>
      </div>
    </button>
  )
}

// ============================================================
// Migration-needed state
// ============================================================

// ============================================================
// Generic load-error state — surfaces real network / RLS errors
// ============================================================
//
// Without this, a one-off network blip ("Load failed" on Safari)
// would just produce an empty doc list and feel like everything
// vanished. Showing the actual error + a retry button reassures
// the user that the data is still on the server.

function DocsLoadError({ error, onRetry, retrying }) {
  const msg = error?.message || 'Could not load docs.'
  return (
    <div className="bg-surface border border-border rounded-2xl p-6 sm:p-10 max-w-2xl">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-danger-bg text-danger-text inline-flex items-center justify-center">
          <i className="ti ti-cloud-off text-lg" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold tracking-tight">
            Couldn’t reach Docs
          </h2>
          <p className="text-sm text-text-2 mt-1.5 leading-relaxed">
            Something went wrong loading your docs. Your data is still
            safe on the server — this just means the request didn’t
            complete. Most often it’s a flaky network.
          </p>
          <p className="text-[11px] font-mono text-text-3 mt-2 break-all">
            {msg}
          </p>
          <button
            type="button"
            onClick={() => onRetry?.()}
            disabled={retrying}
            className="mt-4 text-sm px-4 py-2 rounded-lg bg-info text-white font-medium hover:opacity-95 active:scale-[0.98] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <i
              className={`ti ${retrying ? 'ti-loader-2 animate-spin' : 'ti-refresh'} text-sm`}
            />
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DocsSetupGuide() {
  return (
    <div className="bg-surface border border-border rounded-2xl p-6 sm:p-10 max-w-2xl">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-warning-bg text-warning-text inline-flex items-center justify-center">
          <i className="ti ti-database-off text-lg" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold tracking-tight">
            Docs needs a one-time setup
          </h2>
          <p className="text-sm text-text-2 mt-1.5 leading-relaxed">
            The <code>docs</code> table hasn&rsquo;t been created in this
            Supabase project yet. Run the migration once and the Docs view
            will be ready.
          </p>
          <ol className="mt-3 text-sm text-text-2 space-y-1.5 list-decimal pl-4 leading-relaxed">
            <li>Open your Supabase project &rarr; SQL Editor.</li>
            <li>
              Paste the contents of{' '}
              <code className="px-1.5 py-0.5 rounded bg-surface-2 border border-border font-mono text-[12px]">
                supabase/2026-05-27-phase-21-docs.sql
              </code>{' '}
              from the repo.
            </li>
            <li>Click <span className="font-medium">Run</span>.</li>
            <li>Refresh this page.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Empty state
// ============================================================

function DocEmpty({ onCreate, canWrite, hasDocs }) {
  return (
    <div className="hidden lg:flex flex-1 bg-surface border border-border rounded-2xl items-center justify-center p-12">
      <div className="text-center max-w-md">
        <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-info-bg text-info">
          <i className="ti ti-book-2 text-2xl" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight mt-4">
          {hasDocs ? 'Pick a doc to read' : 'Docs for your team'}
        </h2>
        <p className="text-sm text-text-2 mt-1.5 leading-relaxed">
          {canWrite
            ? 'Capture meeting summaries, decisions, processes — anything that would otherwise live in a scattered email thread.'
            : 'Your team’s shared docs land here. Pick one from the list to read.'}
        </p>
        {canWrite && (
          <button
            onClick={onCreate}
            className="mt-5 text-sm px-4 py-2 rounded-lg bg-info text-white font-medium hover:opacity-95 active:scale-[0.98] inline-flex items-center gap-1.5 shadow-sm shadow-info/20"
          >
            <i className="ti ti-plus text-sm" />
            New doc
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// List-continuation patterns
// ============================================================
//
// Pure helper used by the Enter handler — given the text on the
// current line UP TO the cursor, returns { prefix, isMarkerOnly } if
// it starts with a list marker. The Enter handler then either:
//   • exits the list (isMarkerOnly === true)
//   • inserts a new line + the same prefix (isMarkerOnly === false)
//
// Patterns supported (checked in order most-specific first):
//   - task checkboxes:  "- [ ] " / "- [x] " → continues with "- [ ] "
//   - bullets:          "- " / "* " / "+ "   → continues with same marker
//   - numbered:         "1. " / "12. "       → continues with next number
//   - blockquotes:      "> "                 → continues with "> "
function detectListContext(beforeCursor) {
  const task = beforeCursor.match(/^(\s*)([-*+])\s\[(.)\]\s/)
  if (task) {
    const marker = `${task[1]}${task[2]} [ ] `
    return {
      prefix: marker,
      markerLen: task[0].length,
      isMarkerOnly: beforeCursor.length === task[0].length,
    }
  }
  const bullet = beforeCursor.match(/^(\s*)([-*+])\s/)
  if (bullet) {
    const marker = `${bullet[1]}${bullet[2]} `
    return {
      prefix: marker,
      markerLen: bullet[0].length,
      isMarkerOnly: beforeCursor.length === bullet[0].length,
    }
  }
  const numbered = beforeCursor.match(/^(\s*)(\d+)\.\s/)
  if (numbered) {
    const next = parseInt(numbered[2], 10) + 1
    return {
      prefix: `${numbered[1]}${next}. `,
      markerLen: numbered[0].length,
      isMarkerOnly: beforeCursor.length === numbered[0].length,
    }
  }
  const quote = beforeCursor.match(/^(\s*)>\s/)
  if (quote) {
    const marker = `${quote[1]}> `
    return {
      prefix: marker,
      markerLen: quote[0].length,
      isMarkerOnly: beforeCursor.length === quote[0].length,
    }
  }
  return null
}

// ============================================================
// Editor — single writing surface with sticky toolbar + floating bubble
// ============================================================

function DocEditor({ id, onBack, onDeleted, canWrite }) {
  const { data: doc, isLoading } = useDoc(id)
  const update = useUpdateDoc()
  const remove = useDeleteDoc()
  const createTask = useCreateTask()
  const showToast = useToast()
  const textareaRef = useRef(null)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saveTone, setSaveTone] = useState('idle')
  const [deleting, setDeleting] = useState(false)
  const [bubble, setBubble] = useState(null) // { start, end, rect } | null
  const userDirtyRef = useRef(false)

  useEffect(() => {
    if (doc) {
      setTitle(doc.title ?? '')
      setBody(doc.body ?? '')
      setSaveTone('idle')
      userDirtyRef.current = false
      setBubble(null)
    }
  }, [doc?.id, doc?.title, doc?.body])

  useEffect(() => {
    if (!doc) return
    if (!canWrite) return
    if (!userDirtyRef.current) return
    if (title === (doc.title ?? '') && body === (doc.body ?? '')) return
    setSaveTone('saving')
    const handle = setTimeout(() => {
      update.mutate(
        { id: doc.id, title, body },
        {
          onSuccess: () => {
            setSaveTone('saved')
            setTimeout(() => setSaveTone('idle'), 1500)
          },
          onError: () => setSaveTone('idle'),
        },
      )
    }, 600)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, doc?.id])

  // Cmd+S — force-flush.
  useEffect(() => {
    if (!canWrite) return
    function onKey(e) {
      const cmd = e.metaKey || e.ctrlKey
      if (!cmd || e.key.toLowerCase() !== 's') return
      if (!doc) return
      e.preventDefault()
      if (title === (doc.title ?? '') && body === (doc.body ?? '')) return
      setSaveTone('saving')
      update.mutate(
        { id: doc.id, title, body },
        {
          onSuccess: () => {
            setSaveTone('saved')
            setTimeout(() => setSaveTone('idle'), 1500)
          },
          onError: () => setSaveTone('idle'),
        },
      )
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, title, body, canWrite])

  function markUserDirty() {
    userDirtyRef.current = true
  }
  function handleTitleChange(v) {
    markUserDirty()
    setTitle(v)
  }
  function handleBodyChange(v) {
    markUserDirty()
    setBody(v)
  }

  function handleDelete() {
    if (!doc) return
    if (
      !confirm(
        `Delete "${doc.title?.trim() || 'Untitled'}"? This cannot be undone.`,
      )
    )
      return
    setDeleting(true)
    remove.mutate(doc.id, {
      onSuccess: () => {
        showToast('Doc deleted')
        onDeleted?.()
      },
      onError: (err) => {
        showToast(err?.message ?? 'Could not delete', { type: 'error' })
      },
      onSettled: () => setDeleting(false),
    })
  }

  // ===== Selection tracking (drives the floating bubble) =====
  // Skipped on phone widths — iOS / Android pop their own native
  // selection menu (Cut / Copy / Paste / Look up …) which the bubble
  // would overlap with. The sticky toolbar above the editor covers
  // the same actions on mobile.
  function refreshBubble() {
    const el = textareaRef.current
    if (!el || !canWrite) {
      setBubble(null)
      return
    }
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setBubble(null)
      return
    }
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    if (start === end) {
      setBubble(null)
      return
    }
    const rect = caretRect(el, end)
    if (!rect) {
      setBubble(null)
      return
    }
    setBubble({ start, end, rect })
  }

  useEffect(() => {
    if (!bubble) return
    function onScroll() {
      setBubble(null)
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [bubble])

  useEffect(() => {
    if (!bubble) return
    function onClick(e) {
      if (textareaRef.current?.contains(e.target)) return
      const bubbleEl = document.querySelector('[data-doc-bubble]')
      if (bubbleEl && bubbleEl.contains(e.target)) return
      setBubble(null)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [bubble])

  // ===== Selection helpers — work with bubble OR cursor =====
  // `getRange()` returns {start, end} from the live textarea so the
  // toolbar buttons work even without a selection.
  function getRange() {
    const el = textareaRef.current
    if (!el) return { start: 0, end: 0 }
    return {
      start: el.selectionStart ?? 0,
      end: el.selectionEnd ?? 0,
    }
  }

  function applyAt(start, end, replacement, nextSelStart, nextSelEnd) {
    const next = body.slice(0, start) + replacement + body.slice(end)
    handleBodyChange(next)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(
        nextSelStart ?? start + replacement.length,
        nextSelEnd ?? start + replacement.length,
      )
      refreshBubble()
    })
  }

  function wrap(prefix, suffix = prefix, placeholder = 'text') {
    const { start, end } = getRange()
    const inner = body.slice(start, end) || placeholder
    const replacement = `${prefix}${inner}${suffix}`
    applyAt(
      start,
      end,
      replacement,
      start + prefix.length,
      start + prefix.length + inner.length,
    )
  }

  // Apply a line-level marker (heading / list / quote / etc) to every
  // line in the current selection. Behaviour:
  //   • If a line already starts with the SAME marker, strip it
  //     (toggle off). Clicking H1 on a heading clears the heading.
  //   • If a line has a DIFFERENT line-level marker (e.g. "## " when
  //     applying H1), strip it first and prepend the new one. Without
  //     this, clicking H1 on H2 produced "# ## Hello".
  //   • If a line has no marker, just prepend.
  function prefixLine(marker) {
    const { start, end } = getRange()
    const lineStart = body.lastIndexOf('\n', start - 1) + 1
    const lineEndIdx = body.indexOf('\n', end)
    const blockEnd = lineEndIdx === -1 ? body.length : lineEndIdx
    const block = body.slice(lineStart, blockEnd)
    // Order matters — checkbox + numbered patterns must come before
    // the bare bullet pattern, or the bullet would match first.
    const STRIP_RE = /^(?:[-*+]\s\[.\]\s|\d+\.\s|[-*+]\s|#{1,6}\s|>\s)/
    const prefixed = block
      .split('\n')
      .map((l) => {
        if (l.startsWith(marker)) return l.slice(marker.length)
        return marker + l.replace(STRIP_RE, '')
      })
      .join('\n')
    applyAt(lineStart, blockEnd, prefixed)
  }

  function insertLink() {
    const url = prompt('Link URL', 'https://')
    if (!url) return
    const { start, end } = getRange()
    const label = body.slice(start, end) || 'link text'
    const replacement = `[${label}](${url})`
    applyAt(start, end, replacement, start + 1, start + 1 + label.length)
  }

  function insertHr() {
    const { start } = getRange()
    const before = body.slice(0, start)
    const needsLead = before.length > 0 && !before.endsWith('\n')
    const insert = (needsLead ? '\n' : '') + '\n---\n\n'
    applyAt(start, start, insert)
  }

  // ===== Make task — creates a real workspace task, opens the modal =====
  // Uses selection if present, falls back to the current line.
  function handleMakeTask() {
    const { start, end } = getRange()
    let text = body.slice(start, end).trim()
    if (!text) {
      const lineStart = body.lastIndexOf('\n', start - 1) + 1
      const nextNl = body.indexOf('\n', start)
      const lineEnd = nextNl === -1 ? body.length : nextNl
      text = body
        .slice(lineStart, lineEnd)
        .trim()
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/^>\s+/, '')
        .replace(/^#+\s+/, '')
    }
    if (!text) {
      showToast('Select text or place the cursor on a line first', {
        type: 'error',
      })
      return
    }
    createTask.mutate(
      {
        title: text.slice(0, 200),
        source: `Doc: ${doc?.title?.trim() || 'Untitled'}`,
      },
      {
        onSuccess: (task) => {
          window.dispatchEvent(
            new CustomEvent('tickd:open-task', { detail: { taskId: task.id } }),
          )
          showToast('Task created — assign a PIC in the open modal')
          setBubble(null)
        },
        onError: (err) => {
          showToast(err?.message ?? 'Could not create task', { type: 'error' })
        },
      },
    )
  }

  // ===== Voice dictation =====
  // Replaces the active selection if there is one; otherwise inserts
  // at the cursor. Adds a leading space when the previous character
  // isn't whitespace so "hello world" doesn't run together.
  const dict = useDictation({
    onResult: (chunk) => {
      const trimmed = chunk.trim()
      if (!trimmed) return
      const { start, end } = getRange()
      const before = body.slice(0, start)
      const needsSpace =
        start === end && before.length > 0 && !/\s$/.test(before)
      const insert = (needsSpace ? ' ' : '') + trimmed
      applyAt(start, end, insert)
    },
  })

  // ===== Enter — continue lists =====
  // Standard editor convention: pressing Enter inside a list item
  // automatically prefixes the new line with the same marker. Pressing
  // Enter on an empty list item exits the list (deletes the marker).
  function handleBodyKeyDown(e) {
    if (e.key !== 'Enter') return
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
    const el = textareaRef.current
    if (!el) return
    const pos = el.selectionStart ?? 0
    const lineStart = body.lastIndexOf('\n', pos - 1) + 1
    const beforeCursor = body.slice(lineStart, pos)
    const detected = detectListContext(beforeCursor)
    if (!detected) return
    e.preventDefault()
    if (detected.isMarkerOnly) {
      // Exit the list — strip the marker from this line.
      const next = body.slice(0, lineStart) + body.slice(pos)
      handleBodyChange(next)
      requestAnimationFrame(() => {
        el.setSelectionRange(lineStart, lineStart)
      })
    } else {
      // Continue the list with the same prefix.
      const insert = '\n' + detected.prefix
      const next = body.slice(0, pos) + insert + body.slice(pos)
      handleBodyChange(next)
      requestAnimationFrame(() => {
        const newPos = pos + insert.length
        el.setSelectionRange(newPos, newPos)
      })
    }
  }

  if (isLoading || !doc) {
    return (
      <div className="flex-1 bg-surface border border-border rounded-2xl p-8">
        <Skeleton.Block className="h-8 w-64 mb-4" />
        <Skeleton.Block className="h-4 w-full mb-2" />
        <Skeleton.Block className="h-4 w-4/5 mb-2" />
        <Skeleton.Block className="h-4 w-3/4" />
      </div>
    )
  }

  return (
    <article className="flex-1 bg-surface border border-border rounded-2xl flex flex-col min-w-0 overflow-hidden">
      {/* Top bar — back / breadcrumb / save / delete */}
      <div className="px-4 sm:px-5 h-12 border-b border-border flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onBack}
          className="lg:hidden w-9 h-9 rounded-full inline-flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 transition-colors flex-shrink-0"
          aria-label="Back to list"
        >
          <i className="ti ti-arrow-left text-base" />
        </button>
        <i className="ti ti-file-text text-text-3 text-sm hidden lg:inline" />
        <div className="text-xs text-text-3 truncate flex-1 min-w-0">
          {doc.title?.trim() || 'Untitled'}
          {!canWrite && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-text-3 bg-surface-2 px-1.5 py-0.5 rounded">
              Read only
            </span>
          )}
        </div>
        <SaveBadge tone={saveTone} />
        {canWrite && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-9 h-9 rounded-full inline-flex items-center justify-center text-text-3 hover:text-danger-text hover:bg-danger-bg active:scale-95 transition-all flex-shrink-0 disabled:opacity-50"
            aria-label="Delete doc"
            title="Delete doc"
          >
            <i
              className={`ti ${deleting ? 'ti-loader-2 animate-spin' : 'ti-trash'} text-base`}
            />
          </button>
        )}
      </div>

      {/* Sticky markup toolbar — always visible while editing. Works on
          the current selection OR cursor position. */}
      {canWrite && (
        <Toolbar
          onBold={() => wrap('**', '**', 'bold')}
          onItalic={() => wrap('*', '*', 'italic')}
          onCode={() => wrap('`', '`', 'code')}
          onH1={() => prefixLine('# ')}
          onH2={() => prefixLine('## ')}
          onQuote={() => prefixLine('> ')}
          onHr={insertHr}
          onBullet={() => prefixLine('- ')}
          onNumbered={() => prefixLine('1. ')}
          onCheck={() => prefixLine('- [ ] ')}
          onLink={insertLink}
          onMakeTask={handleMakeTask}
          dict={dict}
        />
      )}

      {/* Writing surface — tighter padding on phones so the reading
          column gets the room. Bottom padding accounts for the
          mobile BottomNav (h≈64px + safe area). */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 sm:px-10 lg:px-14 pt-6 sm:pt-8 pb-24 sm:pb-10 max-w-3xl w-full mx-auto">
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled"
            disabled={!canWrite}
            className="w-full text-2xl sm:text-3xl font-semibold tracking-tight bg-transparent outline-none placeholder:text-text-3 disabled:opacity-80"
          />
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
            onMouseUp={refreshBubble}
            onKeyUp={refreshBubble}
            onTouchEnd={refreshBubble}
            onKeyDown={handleBodyKeyDown}
            placeholder="Start writing…"
            spellCheck="true"
            disabled={!canWrite}
            // text-base = 16px — keeps iOS from zooming on focus.
            className="w-full mt-5 text-base leading-relaxed bg-transparent outline-none resize-none placeholder:text-text-3 disabled:opacity-80 min-h-[55vh]"
            style={{ fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* Floating selection bubble — same actions as the static
          toolbar, surfaced in-context. */}
      {bubble &&
        createPortal(
          <SelectionBubble
            rect={bubble.rect}
            onBold={() => wrap('**', '**', 'bold')}
            onItalic={() => wrap('*', '*', 'italic')}
            onCode={() => wrap('`', '`', 'code')}
            onH1={() => prefixLine('# ')}
            onH2={() => prefixLine('## ')}
            onBullet={() => prefixLine('- ')}
            onCheck={() => prefixLine('- [ ] ')}
            onQuote={() => prefixLine('> ')}
            onLink={insertLink}
            onMakeTask={handleMakeTask}
          />,
          document.body,
        )}
    </article>
  )
}

// ============================================================
// Sticky toolbar
// ============================================================

function Toolbar({
  onBold,
  onItalic,
  onCode,
  onH1,
  onH2,
  onQuote,
  onHr,
  onBullet,
  onNumbered,
  onCheck,
  onLink,
  onMakeTask,
  dict,
}) {
  return (
    <div className="sticky top-0 z-10 bg-surface border-b border-border flex items-center gap-0.5 px-2 sm:px-3 py-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ToolButton icon="ti-bold" onClick={onBold} title="Bold (wraps **…**)" />
      <ToolButton icon="ti-italic" onClick={onItalic} title="Italic (wraps *…*)" />
      <ToolButton icon="ti-code" onClick={onCode} title="Inline code" />
      <Divider />
      <ToolButton icon="ti-h-1" onClick={onH1} title="Heading 1" />
      <ToolButton icon="ti-h-2" onClick={onH2} title="Heading 2" />
      <ToolButton icon="ti-quote" onClick={onQuote} title="Blockquote" />
      <ToolButton icon="ti-minus" onClick={onHr} title="Divider" />
      <Divider />
      <ToolButton icon="ti-list" onClick={onBullet} title="Bullet list" />
      <ToolButton
        icon="ti-list-numbers"
        onClick={onNumbered}
        title="Numbered list"
      />
      <ToolButton
        icon="ti-checkbox"
        onClick={onCheck}
        title="Task checklist"
      />
      <ToolButton icon="ti-link" onClick={onLink} title="Insert link" />
      <Divider />
      <ToolButton
        icon="ti-subtask"
        onClick={onMakeTask}
        title="Create a workspace task from the selection (or current line)"
        label="Make task"
      />
      {dict?.supported && (
        <ToolButton
          icon={dict.listening ? 'ti-microphone-filled' : 'ti-microphone'}
          onClick={() => (dict.listening ? dict.stop() : dict.start())}
          title={
            dict.listening
              ? 'Stop dictating'
              : 'Dictate — words appear at the cursor'
          }
          label={dict.listening ? 'Listening…' : 'Voice'}
          active={dict.listening}
        />
      )}
    </div>
  )
}

function ToolButton({ icon, onClick, title, label, active = false }) {
  return (
    <button
      type="button"
      // Prevent the textarea from losing focus on click, otherwise
      // selection-aware actions (wrap, etc) lose their range.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex items-center gap-1.5 h-10 sm:h-8 min-w-[40px] sm:min-w-0 px-2 rounded-md text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors flex-shrink-0 ${
        active ? 'bg-danger-bg/40 text-danger-text animate-pulse' : ''
      }`}
    >
      <i className={`ti ${icon} text-lg sm:text-base`} />
      {label && (
        <span className="hidden sm:inline text-[11px] font-medium">
          {label}
        </span>
      )}
    </button>
  )
}

function Divider() {
  return <span className="w-px h-5 bg-border mx-1 flex-shrink-0" />
}

// ============================================================
// Floating selection bubble
// ============================================================

function SelectionBubble({
  rect,
  onBold,
  onItalic,
  onCode,
  onH1,
  onH2,
  onBullet,
  onCheck,
  onQuote,
  onLink,
  onMakeTask,
}) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const bw = el.offsetWidth
    const bh = el.offsetHeight
    let top = rect.top - bh - 8
    let left = rect.left - bw / 2
    if (top < 8) top = rect.top + rect.height + 8
    const maxLeft = window.innerWidth - bw - 8
    if (left < 8) left = 8
    if (left > maxLeft) left = maxLeft
    setPos({ top, left, ready: true })
  }, [rect.top, rect.left, rect.height])

  return (
    <div
      ref={ref}
      data-doc-bubble=""
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        visibility: pos.ready ? 'visible' : 'hidden',
        zIndex: 60,
      }}
      className="bg-surface border border-border rounded-lg shadow-xl flex items-center gap-0.5 px-1.5 py-1 tickd-popover"
      onMouseDown={(e) => e.preventDefault()}
    >
      <BubbleButton icon="ti-bold" onClick={onBold} title="Bold" />
      <BubbleButton icon="ti-italic" onClick={onItalic} title="Italic" />
      <BubbleButton icon="ti-code" onClick={onCode} title="Inline code" />
      <BubbleDivider />
      <BubbleButton icon="ti-h-1" onClick={onH1} title="Heading 1" />
      <BubbleButton icon="ti-h-2" onClick={onH2} title="Heading 2" />
      <BubbleButton icon="ti-quote" onClick={onQuote} title="Blockquote" />
      <BubbleDivider />
      <BubbleButton icon="ti-list" onClick={onBullet} title="Bullet list" />
      <BubbleButton icon="ti-checkbox" onClick={onCheck} title="Task checklist" />
      <BubbleButton icon="ti-link" onClick={onLink} title="Insert link" />
      <BubbleDivider />
      <BubbleButton
        icon="ti-subtask"
        onClick={onMakeTask}
        title="Create a workspace task from the selection"
        label="Make task"
        emphasis
      />
    </div>
  )
}

function BubbleButton({ icon, onClick, title, label, emphasis = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex items-center gap-1.5 h-8 px-2 rounded-md transition-colors flex-shrink-0 ${
        emphasis
          ? 'bg-info text-white hover:opacity-90 font-medium'
          : 'text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3'
      }`}
    >
      <i className={`ti ${icon} text-base`} />
      {label && <span className="text-[11px]">{label}</span>}
    </button>
  )
}

function BubbleDivider() {
  return <span className="w-px h-5 bg-border mx-0.5 flex-shrink-0" />
}

// ============================================================
// Caret position helper — mirror-div technique
// ============================================================

function caretRect(textarea, position) {
  if (typeof window === 'undefined') return null
  const div = document.createElement('div')
  const style = window.getComputedStyle(textarea)
  const propsToCopy = [
    'boxSizing',
    'width',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'wordSpacing',
    'lineHeight',
    'textTransform',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
  ]
  for (const p of propsToCopy) {
    div.style[p] = style[p]
  }
  div.style.position = 'absolute'
  div.style.visibility = 'hidden'
  div.style.overflow = 'hidden'
  div.style.whiteSpace = 'pre-wrap'
  div.style.overflowWrap = 'break-word'
  div.style.top = '0'
  div.style.left = '0'
  div.textContent = textarea.value.substring(0, position)
  const span = document.createElement('span')
  span.textContent = textarea.value.substring(position) || '.'
  div.appendChild(span)
  document.body.appendChild(div)
  let spanRect, divRect
  try {
    spanRect = span.getBoundingClientRect()
    divRect = div.getBoundingClientRect()
  } finally {
    document.body.removeChild(div)
  }
  const taRect = textarea.getBoundingClientRect()
  const localTop = spanRect.top - divRect.top
  const localLeft = spanRect.left - divRect.left
  return {
    top: taRect.top + localTop - textarea.scrollTop,
    left: taRect.left + localLeft - textarea.scrollLeft,
    height: spanRect.height,
  }
}

// ============================================================
// Save badge
// ============================================================

function SaveBadge({ tone }) {
  if (tone === 'saving') {
    return (
      <span className="text-[11px] text-text-3 inline-flex items-center gap-1">
        <i className="ti ti-loader-2 animate-spin text-sm" />
        Saving…
      </span>
    )
  }
  if (tone === 'saved') {
    return (
      <span className="text-[11px] text-success-text inline-flex items-center gap-1">
        <i className="ti ti-check text-sm" />
        Saved
      </span>
    )
  }
  return null
}
