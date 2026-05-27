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

// DocsView — flat list of markdown docs in the active workspace, with
// a side-by-side editor + preview. ClickUp / Notion / Linear all ship
// a docs surface alongside tasks; this is our v1.
//
// Layout:
//   Desktop: left sidebar with doc list, right pane is editor+preview.
//   Mobile:  two states — list, or editor (full screen).
//
// Editor strategy: textarea with debounced auto-save (no manual save
// button). Title edits in place. Preview can be toggled per-view.
export default function DocsView() {
  const { workspace } = useAuth()
  const { data: docs = [], isLoading, error } = useDocs()
  const createDoc = useCreateDoc()
  const showToast = useToast()
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')

  // Detect the "table doesn't exist" error PostgREST returns when the
  // phase-21 migration hasn't been run yet. Surface a setup guide
  // instead of just bubbling the raw error through a toast — most
  // common when someone deploys the app code before applying the SQL.
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

  // Restart auto-selection logic when switching workspaces — so the
  // first doc of the new workspace gets selected too.
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
    <div className="space-y-3">
      {/* Mobile: switch between list and editor view. Desktop renders
          them side-by-side. */}
      <div
        className={`flex flex-col lg:flex-row gap-3 ${
          selectedId ? '' : 'lg:flex-row'
        }`}
      >
        <DocList
          docs={filtered}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={handleCreate}
          isLoading={isLoading}
          search={search}
          setSearch={setSearch}
          // Hide the list on mobile when a doc is open — the editor
          // takes the full viewport; a back button returns to the list.
          hideOnMobile={!!selectedId}
        />
        {selectedId ? (
          <DocEditor
            id={selectedId}
            onBack={() => setSelectedId(null)}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <DocEmpty onCreate={handleCreate} />
        )}
      </div>
    </div>
  )
}

// ============================================================
// Doc list (sidebar on desktop, full-width on mobile until you open one)
// ============================================================

function DocList({
  docs,
  selectedId,
  onSelect,
  onCreate,
  isLoading,
  search,
  setSearch,
  hideOnMobile,
}) {
  return (
    <div
      className={`bg-surface border border-border rounded-xl overflow-hidden flex flex-col w-full lg:w-72 flex-shrink-0 ${
        hideOnMobile ? 'hidden lg:flex' : ''
      }`}
    >
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-text-2 flex-1">
          Docs
        </h3>
        <button
          onClick={onCreate}
          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors"
          aria-label="New doc"
          title="New doc"
        >
          <i className="ti ti-plus text-base" />
        </button>
      </div>
      <div className="px-2 pt-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search docs…"
          className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border bg-surface-2 outline-none focus:border-info"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 max-h-[60vh] lg:max-h-[calc(100vh-12rem)]">
        {isLoading ? (
          <div className="p-2">
            <Skeleton.TaskRows rows={4} />
          </div>
        ) : docs.length === 0 ? (
          <div className="px-2 py-8 text-center text-xs text-text-3">
            {search ? 'No matching docs.' : 'No docs yet — create your first.'}
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
    </div>
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
      .slice(0, 80)
  }, [doc.body])
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2.5 py-2 rounded-md transition-colors ${
        selected
          ? 'bg-info-bg/60 border border-info'
          : 'hover:bg-surface-2 border border-transparent'
      }`}
    >
      <div
        className={`text-sm truncate ${selected ? 'font-semibold' : 'font-medium'}`}
      >
        {doc.title || 'Untitled'}
      </div>
      {preview && (
        <div className="text-[11px] text-text-3 truncate mt-0.5">
          {preview}
        </div>
      )}
      <div className="text-[10px] text-text-3 mt-1">
        {formatTimeAgo(doc.updated_at)}
      </div>
    </button>
  )
}

// ============================================================
// Migration-needed state — surfaced when the docs table doesn't exist
// ============================================================

function DocsSetupGuide() {
  return (
    <div className="bg-surface border border-border rounded-xl p-6 sm:p-10 max-w-2xl">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-warning-bg text-warning-text inline-flex items-center justify-center">
          <i className="ti ti-database-off text-lg" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-medium">Docs needs a one-time setup</h2>
          <p className="text-xs text-text-2 mt-1 leading-relaxed">
            The <code>docs</code> table hasn&rsquo;t been created in this
            Supabase project yet. Run the migration once and the Docs view
            will be ready — your existing tasks, people, and history are
            unaffected.
          </p>
          <ol className="mt-3 text-xs text-text-2 space-y-1.5 list-decimal pl-4 leading-relaxed">
            <li>Open your Supabase project &rarr; SQL Editor.</li>
            <li>
              Paste the contents of{' '}
              <code className="px-1 py-0.5 rounded bg-surface-2 border border-border font-mono text-[11px]">
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

function DocEmpty({ onCreate }) {
  return (
    <div className="hidden lg:flex flex-1 bg-surface border border-border rounded-xl items-center justify-center p-10">
      <div className="text-center max-w-md">
        <i className="ti ti-book-2 text-4xl text-text-3" />
        <h2 className="text-base font-medium mt-3">Docs for {''}your team</h2>
        <p className="text-xs text-text-2 mt-1">
          Capture meeting summaries, decisions, processes — anything that
          would otherwise live in a scattered email thread. Markdown
          supported.
        </p>
        <button
          onClick={onCreate}
          className="mt-4 text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 inline-flex items-center gap-1.5"
        >
          <i className="ti ti-plus text-sm" />
          New doc
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Editor — title + body textarea with live preview toggle
// ============================================================

function DocEditor({ id, onBack, onDeleted }) {
  const { data: doc, isLoading } = useDoc(id)
  const update = useUpdateDoc()
  const remove = useDeleteDoc()
  const showToast = useToast()

  // Local mirror of title/body so typing isn't latency-bound. We push
  // changes to the server via a debounced effect — 600ms idle is the
  // sweet spot (long enough that we batch keystrokes, short enough
  // that auto-save still feels live).
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [previewMode, setPreviewMode] = useState('split') // 'split' | 'edit' | 'preview'
  const [saveTone, setSaveTone] = useState('idle') // 'idle' | 'saving' | 'saved'

  // Reset locals when the doc id changes.
  useEffect(() => {
    if (doc) {
      setTitle(doc.title ?? '')
      setBody(doc.body ?? '')
      setSaveTone('idle')
    }
  }, [doc?.id, doc?.title, doc?.body])

  // Debounced auto-save. We only push when the local values actually
  // differ from the cached doc (avoids loop with the onMutate update).
  useEffect(() => {
    if (!doc) return
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

  function handleDelete() {
    if (!doc) return
    if (
      !confirm(
        `Delete "${doc.title || 'Untitled'}"? This cannot be undone.`,
      )
    )
      return
    remove.mutate(doc.id, {
      onSuccess: () => {
        showToast('Doc deleted')
        onDeleted?.()
      },
    })
  }

  if (isLoading || !doc) {
    return (
      <div className="flex-1 bg-surface border border-border rounded-xl p-6">
        <Skeleton.Block className="h-6 w-48 mb-3" />
        <Skeleton.Block className="h-3 w-full mb-2" />
        <Skeleton.Block className="h-3 w-4/5 mb-2" />
        <Skeleton.Block className="h-3 w-3/4" />
      </div>
    )
  }

  return (
    <div className="flex-1 bg-surface border border-border rounded-xl flex flex-col min-w-0">
      {/* Header — back button (mobile), title, save indicator, controls */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
        <button
          onClick={onBack}
          className="lg:hidden w-9 h-9 rounded-full inline-flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors flex-shrink-0"
          aria-label="Back to list"
        >
          <i className="ti ti-arrow-left text-base" />
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          className="flex-1 min-w-0 text-base sm:text-lg font-semibold bg-transparent outline-none placeholder:text-text-3"
        />
        <SaveBadge tone={saveTone} />
        {/* Preview mode segmented control. Three states: edit-only,
            split (default), preview-only. Mobile collapses to edit/preview
            toggle only since split would cramp. */}
        <div className="inline-flex p-0.5 bg-surface-2 rounded-md">
          <ModeButton
            active={previewMode === 'edit'}
            icon="ti-pencil"
            label="Edit"
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
        <button
          onClick={handleDelete}
          className="w-9 h-9 rounded-full inline-flex items-center justify-center text-text-3 hover:text-danger-text hover:bg-danger-bg active:bg-danger-bg transition-colors flex-shrink-0"
          aria-label="Delete doc"
          title="Delete"
        >
          <i className="ti ti-trash text-base" />
        </button>
      </div>

      <div
        className={`flex-1 min-h-0 flex ${
          previewMode === 'split' ? 'flex-col lg:flex-row' : 'flex-col'
        }`}
      >
        {previewMode !== 'preview' && (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Start writing… markdown supported (# headings, **bold**, *italic*, `code`, [links](https://...), - lists)"
            spellCheck="true"
            className={`p-4 sm:p-5 text-sm font-mono leading-relaxed bg-transparent outline-none resize-none placeholder:text-text-3 min-h-[300px] lg:min-h-[480px] ${
              previewMode === 'split' ? 'lg:flex-1 lg:border-r lg:border-border' : 'flex-1'
            }`}
          />
        )}
        {previewMode !== 'edit' && (
          <div
            className={`p-4 sm:p-5 overflow-y-auto max-h-[80vh] ${
              previewMode === 'split' ? 'lg:flex-1' : 'flex-1'
            } ${previewMode === 'preview' ? '' : 'border-t lg:border-t-0 border-border bg-surface-2/30'}`}
          >
            {body ? (
              <div className="prose-tickd max-w-none">{renderMarkdown(body)}</div>
            ) : (
              <div className="text-xs text-text-3 italic">
                Preview will appear here as you type.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ModeButton({ active, icon, label, onClick, hideOnMobile = false }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2 py-1 rounded inline-flex items-center gap-1 ${
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

// Subtle indicator next to the title — telegraphs auto-save state so
// users know their work is captured without having to look for a save
// button. Idle = nothing visible, saving = spinner, saved = check.
function SaveBadge({ tone }) {
  if (tone === 'saving') {
    return (
      <span className="text-[10px] text-text-3 inline-flex items-center gap-1">
        <i className="ti ti-loader-2 animate-spin text-sm" />
        Saving…
      </span>
    )
  }
  if (tone === 'saved') {
    return (
      <span className="text-[10px] text-success-text inline-flex items-center gap-1">
        <i className="ti ti-check text-sm" />
        Saved
      </span>
    )
  }
  return null
}
