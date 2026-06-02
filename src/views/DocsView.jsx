import { useEffect, useMemo, useRef, useState } from 'react'
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
// Editor model: a single writing surface (no preview / no split).
// The textarea holds markdown; a sticky toolbar above it provides
// rich-feeling controls (bold/italic/H/list/etc), plus two custom
// commands:
//   • Make task — turns the selected text (or current line) into a
//     new task, with the doc title as the source.
//   • Voice    — live transcript via the Web Speech API; inserts
//     finalized speech chunks at the cursor.
//
// Storage: markdown text in `docs.body`. Output stays plain markdown
// so existing docs render unchanged.
export default function DocsView() {
  const { workspace } = useAuth()
  const { data: docs = [], isLoading, error } = useDocs()
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
// Editor — single writing surface with a markup toolbar
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

  // Guard: don't run auto-save until the local state has been
  // reconciled with the doc on first load. Without this, the auto-
  // save effect fires on the first render (local title still '' vs
  // doc.title 'Untitled') and the badge gets stuck on "saving" while
  // the cleanup phase pre-empts the actual save. See bug: clicking a
  // new doc → spinner spins forever.
  const userDirtyRef = useRef(false)

  // Reset locals when the doc id (or its server-side values) change.
  useEffect(() => {
    if (doc) {
      setTitle(doc.title ?? '')
      setBody(doc.body ?? '')
      setSaveTone('idle')
      userDirtyRef.current = false
    }
  }, [doc?.id, doc?.title, doc?.body])

  // Debounced auto-save — only fires when the user has actually
  // touched the inputs.
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

  // ====== Markup helpers — operate on the textarea selection ======
  // All assume the textarea ref is live. We call after a microtask so
  // React's onChange has applied; otherwise the cursor restore lands
  // on stale content.
  function getSel() {
    const el = textareaRef.current
    if (!el) return null
    return { el, start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 }
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
    })
  }
  function wrap(prefix, suffix = prefix, placeholder = 'text') {
    const sel = getSel()
    if (!sel) return
    const { start, end } = sel
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
  function prefixLine(marker) {
    const sel = getSel()
    if (!sel) return
    const { start, end } = sel
    // Expand to whole lines, then prefix each.
    const lineStart = body.lastIndexOf('\n', start - 1) + 1
    const lineEnd = body.indexOf('\n', end)
    const blockEnd = lineEnd === -1 ? body.length : lineEnd
    const block = body.slice(lineStart, blockEnd)
    const prefixed = block
      .split('\n')
      .map((l) => (l.startsWith(marker) ? l : marker + l))
      .join('\n')
    applyAt(lineStart, blockEnd, prefixed)
  }
  function insertLink() {
    const url = prompt('Link URL', 'https://')
    if (!url) return
    const sel = getSel()
    if (!sel) return
    const { start, end } = sel
    const label = body.slice(start, end) || 'link text'
    const replacement = `[${label}](${url})`
    applyAt(
      start,
      end,
      replacement,
      start + 1,
      start + 1 + label.length,
    )
  }
  function insertHr() {
    const sel = getSel()
    if (!sel) return
    const { start } = sel
    const before = body.slice(0, start)
    const needsLead = before.length > 0 && !before.endsWith('\n')
    const insert = (needsLead ? '\n' : '') + '\n---\n\n'
    applyAt(start, start, insert)
  }

  // ====== Make selected text into a task ======
  function handleMakeTask() {
    const sel = getSel()
    if (!sel) return
    const { start, end } = sel
    let text = body.slice(start, end).trim()
    let lineStart = start
    let lineEnd = end
    if (!text) {
      // Empty selection — use the current line.
      lineStart = body.lastIndexOf('\n', start - 1) + 1
      const next = body.indexOf('\n', start)
      lineEnd = next === -1 ? body.length : next
      text = body.slice(lineStart, lineEnd).trim().replace(/^[-*+]\s+/, '')
    }
    if (!text) {
      showToast('Nothing to make a task from', { type: 'error' })
      return
    }
    createTask.mutate(
      {
        title: text.slice(0, 200),
        source: `Doc: ${doc?.title?.trim() || 'Untitled'}`,
      },
      {
        onSuccess: () => {
          // Convert the selected line in-place to a checked-off
          // markdown task so the doc reflects that it's now a task.
          const inner = body.slice(lineStart, lineEnd)
          const replaced = inner.startsWith('- [ ] ')
            ? inner
            : `- [ ] ${inner.replace(/^[-*+]\s+/, '')}`
          applyAt(lineStart, lineEnd, replaced)
          showToast('Task created from selection')
        },
      },
    )
  }

  // ====== Voice dictation ======
  // Inserts finalized speech at the current cursor position.
  const dict = useDictation({
    onResult: (chunk) => {
      const trimmed = chunk.trim()
      if (!trimmed) return
      const sel = getSel()
      if (!sel) return
      const { start } = sel
      const before = body.slice(0, start)
      const needsSpace = before.length > 0 && !/\s$/.test(before)
      const insert = (needsSpace ? ' ' : '') + trimmed
      applyAt(start, start, insert)
    },
  })

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
      {/* Top bar — back / title breadcrumb / save state / delete */}
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

      {/* Markup toolbar — sticky just under the top bar so it stays
          visible while you scroll a long doc. Only rendered when the
          user can write. */}
      {canWrite && (
        <Toolbar
          onBold={() => wrap('**', '**', 'bold')}
          onItalic={() => wrap('*', '*', 'italic')}
          onH1={() => prefixLine('# ')}
          onH2={() => prefixLine('## ')}
          onBullet={() => prefixLine('- ')}
          onNumbered={() => prefixLine('1. ')}
          onCheck={() => prefixLine('- [ ] ')}
          onCode={() => wrap('`', '`', 'code')}
          onQuote={() => prefixLine('> ')}
          onLink={insertLink}
          onHr={insertHr}
          onMakeTask={handleMakeTask}
          dict={dict}
        />
      )}

      {/* The writing surface */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-6 sm:px-10 lg:px-14 pt-8 pb-10 max-w-3xl w-full mx-auto">
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
            placeholder="Start writing… markdown supported (# heading, **bold**, *italic*, `code`, [link](https://…), - list)"
            spellCheck="true"
            disabled={!canWrite}
            className="w-full mt-5 text-base leading-relaxed bg-transparent outline-none resize-none placeholder:text-text-3 disabled:opacity-80 min-h-[55vh]"
            style={{ fontFamily: 'inherit' }}
          />
        </div>
      </div>
    </article>
  )
}

// ============================================================
// Toolbar
// ============================================================

function Toolbar({
  onBold,
  onItalic,
  onH1,
  onH2,
  onBullet,
  onNumbered,
  onCheck,
  onCode,
  onQuote,
  onLink,
  onHr,
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
        title="Make a task from the selected line"
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
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex items-center gap-1.5 h-8 px-2 rounded-md text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors flex-shrink-0 ${
        active ? 'bg-danger-bg/40 text-danger-text animate-pulse' : ''
      }`}
    >
      <i className={`ti ${icon} text-base`} />
      {label && <span className="text-[11px] font-medium">{label}</span>}
    </button>
  )
}

function Divider() {
  return <span className="w-px h-5 bg-border mx-1 flex-shrink-0" />
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
