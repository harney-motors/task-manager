import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useCreateDoc,
  useDeleteDoc,
  useDoc,
  useDocs,
  useUpdateDoc,
} from '../lib/queries'
import { useAuth } from '../auth/AuthProvider'
import { useToast } from '../components/Toast'
import { formatTimeAgo } from '../lib/dates'
import { renderMarkdown } from '../lib/markdown.jsx'
import Skeleton from '../components/Skeleton'

// DocsView — flat list of markdown documents in the active workspace,
// with a Notion-/Linear-style editor.
//
// Layout:
//   Desktop: 280px sidebar with the doc list + a generous editor pane.
//   Mobile:  two screens — list, or editor (full screen).
//
// Editor strategy: sans-serif body (not mono), live preview side-by-
// side or toggled. Debounced auto-save at 600ms with Cmd+S to flush.
export default function DocsView() {
  const { workspace } = useAuth()
  const { data: docs = [], isLoading, error } = useDocs()
  const createDoc = useCreateDoc()
  const showToast = useToast()
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  // RLS gates writes to editor + owner roles; PICs are read-only.
  const canWrite = workspace?.role === 'editor' || workspace?.role === 'owner'

  // Detect the "table doesn't exist" error PostgREST returns when the
  // phase-21 migration hasn't been run yet. Show a setup guide.
  const needsMigration = !!(
    error &&
    (String(error?.message ?? '').includes("table 'public.docs'") ||
      String(error?.code ?? '') === 'PGRST205' ||
      String(error?.code ?? '') === '42P01')
  )
  if (needsMigration) {
    return <DocsSetupGuide />
  }

  // Auto-select the first doc on load. Triggers once per workspace
  // and respects the user's later manual selection.
  const autoSelectedRef = useRef(false)
  useEffect(() => {
    if (autoSelectedRef.current) return
    if (isLoading) return
    if (selectedId) {
      autoSelectedRef.current = true
      return
    }
    if (docs.length > 0) {
      setSelectedId(docs[0].id)
    }
    autoSelectedRef.current = true
  }, [docs, isLoading, selectedId])

  // Restart auto-selection logic when switching workspaces.
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
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 lg:min-h-[calc(100vh-9rem)]">
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
        <DocEmpty onCreate={handleCreate} canWrite={canWrite} hasDocs={docs.length > 0} />
      )}
    </div>
  )
}

// ============================================================
// Doc list — left sidebar on desktop, full-width screen on mobile
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
      {/* Header: doc count + prominent New button.  Bigger, friendlier
          than the old "DOCS" eyebrow + plus icon. */}
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
        {/* Search — soft pill, sits between the header and the list. */}
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

      {/* List body */}
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
  // Body preview — first non-empty line, stripped of markdown markers.
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
            will be ready — your existing tasks, people, and history are
            unaffected.
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
// Empty state — shown when no doc is selected
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
            ? 'Capture meeting summaries, decisions, processes — anything that would otherwise live in a scattered email thread. Markdown supported.'
            : 'Your team’s shared markdown docs land here. Pick one from the list to read; ask an admin if you need to create or edit one.'}
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
// Editor — title + body + live preview
// ============================================================

function DocEditor({ id, onBack, onDeleted, canWrite }) {
  const { data: doc, isLoading } = useDoc(id)
  const update = useUpdateDoc()
  const remove = useDeleteDoc()
  const showToast = useToast()

  // Local mirror of title/body so typing isn't latency-bound.
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  // Default mode: 'split' for writers, 'preview' for read-only viewers.
  const [previewMode, setPreviewMode] = useState(canWrite ? 'split' : 'preview')
  const [saveTone, setSaveTone] = useState('idle')
  const [deleting, setDeleting] = useState(false)

  // Reset locals when the doc id changes.
  useEffect(() => {
    if (doc) {
      setTitle(doc.title ?? '')
      setBody(doc.body ?? '')
      setSaveTone('idle')
    }
  }, [doc?.id, doc?.title, doc?.body])

  // Debounced auto-save.
  useEffect(() => {
    if (!doc) return
    if (!canWrite) return
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

  // Cmd+S / Ctrl+S — force-flush the save.
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
      onSettled: () => setDeleting(false),
    })
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
      {/* Toolbar — back, save state, mode toggle, delete. Sits at the
          top with a subtle bottom border so the editor body feels like
          a page underneath. */}
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
          <div className="inline-flex p-0.5 bg-surface-2 rounded-md">
            <ModeButton
              active={previewMode === 'edit'}
              icon="ti-pencil"
              label="Write"
              onClick={() => setPreviewMode('edit')}
            />
            <ModeButton
              active={previewMode === 'split'}
              icon="ti-layout-columns"
              label="Split"
              onClick={() => setPreviewMode('split')}
              hideOnMobile
            />
            <ModeButton
              active={previewMode === 'preview'}
              icon="ti-eye"
              label="Preview"
              onClick={() => setPreviewMode('preview')}
            />
          </div>
        )}
        {canWrite && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-9 h-9 rounded-full inline-flex items-center justify-center text-text-3 hover:text-danger-text hover:bg-danger-bg active:scale-95 transition-all flex-shrink-0 disabled:opacity-50"
            aria-label="Delete doc"
            title="Delete doc"
          >
            <i className={`ti ${deleting ? 'ti-loader-2 animate-spin' : 'ti-trash'} text-base`} />
          </button>
        )}
      </div>

      {/* Body — title (big), then editor / preview. The body sits on
          surface, no inner borders, plenty of horizontal padding so it
          reads like a document page. */}
      <div
        className={`flex-1 min-h-0 flex ${
          previewMode === 'split' ? 'flex-col lg:flex-row' : 'flex-col'
        }`}
      >
        {/* Editor pane */}
        {previewMode !== 'preview' && (
          <div
            className={`flex flex-col overflow-y-auto ${
              previewMode === 'split'
                ? 'lg:flex-1 lg:border-r lg:border-border min-h-[300px] lg:min-h-0'
                : 'flex-1'
            }`}
          >
            <div className="px-6 sm:px-10 pt-8 pb-6 max-w-3xl w-full mx-auto">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled"
                disabled={!canWrite}
                className="w-full text-2xl sm:text-3xl font-semibold tracking-tight bg-transparent outline-none placeholder:text-text-3 disabled:opacity-80"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Start writing… markdown supported (# heading, **bold**, *italic*, `code`, [link](https://…), - list)"
                spellCheck="true"
                disabled={!canWrite}
                className="w-full mt-5 text-base leading-relaxed bg-transparent outline-none resize-none placeholder:text-text-3 disabled:opacity-80 min-h-[55vh]"
                style={{ fontFamily: 'inherit' }}
              />
            </div>
          </div>
        )}
        {/* Preview pane */}
        {previewMode !== 'edit' && (
          <div
            className={`overflow-y-auto ${
              previewMode === 'split'
                ? 'lg:flex-1 border-t lg:border-t-0 border-border bg-surface-2/30'
                : 'flex-1'
            }`}
          >
            <div className="px-6 sm:px-10 pt-8 pb-6 max-w-3xl w-full mx-auto">
              {/* Title mirror — preview shows the live title so the
                  user sees what the document looks like as a whole. */}
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                {title?.trim() || 'Untitled'}
              </h1>
              <div className="mt-5">
                {body ? (
                  <div className="prose-tickd max-w-none">
                    {renderMarkdown(body)}
                  </div>
                ) : (
                  <div className="text-sm text-text-3 italic">
                    Preview will appear here as you type.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function ModeButton({ active, icon, label, onClick, hideOnMobile = false }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1 transition-colors ${
        hideOnMobile ? 'hidden lg:inline-flex' : ''
      } ${
        active
          ? 'bg-surface text-text font-medium shadow-sm'
          : 'text-text-2 hover:text-text'
      }`}
      title={label}
      aria-label={label}
    >
      <i className={`ti ${icon} text-sm`} />
      <span className="hidden xl:inline">{label}</span>
    </button>
  )
}

// Subtle indicator next to the title — telegraphs auto-save state.
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
