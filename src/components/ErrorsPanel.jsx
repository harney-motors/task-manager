import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import Skeleton from './Skeleton'

// Settings → Errors. Lists the most recent rows from error_log scoped
// to what the caller can see (RLS handles that — owners see their
// workspace; superadmins see everything including null-workspace rows).
//
// Filters: source contains, level. Sort: newest first.
// Realtime: subscribes to error_log inserts and re-fetches on change
// so the panel stays current while you're watching it.
export default function ErrorsPanel() {
  const { workspace } = useAuth()
  const qc = useQueryClient()
  const [sourceFilter, setSourceFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const [expanded, setExpanded] = useState(() => new Set())

  const queryKey = ['error_log', workspace?.id ?? 'all']

  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('error_log')
        .select('id, workspace_id, source, level, message, context, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })

  // Realtime — re-fetch on any insert so live errors appear without
  // a manual refresh. Filter is workspace-agnostic; RLS handles
  // visibility, so subscribing to the whole table is fine.
  useEffect(() => {
    const channel = supabase
      .channel('error_log:settings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'error_log' },
        () => qc.invalidateQueries({ queryKey }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id])

  const filtered = useMemo(() => {
    let pool = rows
    if (sourceFilter.trim()) {
      const q = sourceFilter.trim().toLowerCase()
      pool = pool.filter((r) => r.source.toLowerCase().includes(q))
    }
    if (levelFilter !== 'all') {
      pool = pool.filter((r) => r.level === levelFilter)
    }
    return pool
  }, [rows, sourceFilter, levelFilter])

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Distinct source list for quick-filter chips.
  const sources = useMemo(() => {
    const s = new Set()
    for (const r of rows) s.add(r.source)
    return Array.from(s).sort()
  }, [rows])

  const errorCount = rows.filter((r) => r.level === 'error').length
  const fatalCount = rows.filter((r) => r.level === 'fatal').length

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-3 sm:px-4 py-3 sm:py-4 border-b border-border flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Error log</h2>
          <p className="text-[11px] sm:text-xs text-text-2 mt-0.5">
            {rows.length} recent · {fatalCount > 0 && `${fatalCount} fatal · `}
            {errorCount} errors. Live — new entries arrive without refresh.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-3 sm:px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
        <input
          type="search"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          placeholder="Filter by source… e.g. notify-mention"
          className="flex-1 min-w-[150px] text-xs px-3 py-1.5 rounded border border-border bg-bg outline-none focus:border-info"
        />
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="text-xs px-2 py-1.5 rounded border border-border bg-bg"
        >
          <option value="all">All levels</option>
          <option value="fatal">Fatal</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
        </select>
      </div>

      {/* Source quick-chips */}
      {sources.length > 0 && (
        <div className="px-3 sm:px-4 py-2 border-b border-border flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-text-3 mr-1">Sources:</span>
          {sources.map((s) => (
            <button
              key={s}
              onClick={() =>
                setSourceFilter((cur) => (cur === s ? '' : s))
              }
              className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
                sourceFilter === s
                  ? 'border-info bg-info-bg text-info-text font-medium'
                  : 'border-border bg-surface hover:bg-surface-2 text-text-2'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="p-4">
          <Skeleton rows={6} height={40} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-xs text-text-3">
          {rows.length === 0
            ? "No errors logged. That's good news."
            : 'No errors match the current filter.'}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((row) => (
            <ErrorRow
              key={row.id}
              row={row}
              expanded={expanded.has(row.id)}
              onToggle={() => toggle(row.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

const LEVEL_PILL = {
  fatal: 'bg-danger-text/10 text-danger-text border-danger-text/30',
  error: 'bg-danger-bg text-danger-text border-danger-bg',
  warn: 'bg-warning-bg text-warning-text border-warning-bg',
}

function ErrorRow({ row, expanded, onToggle }) {
  const tone = LEVEL_PILL[row.level] || LEVEL_PILL.error
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-3 sm:px-4 py-3 hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-start gap-2 flex-wrap">
          <span
            className={`text-[10px] px-1.5 py-px rounded border ${tone} uppercase tracking-wider font-semibold flex-shrink-0`}
          >
            {row.level}
          </span>
          <span className="text-[11px] text-text-3 font-mono flex-shrink-0">
            {row.source}
          </span>
          <span className="text-[11px] text-text-3 flex-shrink-0">
            {formatTime(row.created_at)}
          </span>
        </div>
        <div className="text-xs text-text mt-1 font-medium break-words">
          {row.message}
        </div>
        {expanded && (
          <div className="mt-2 space-y-2">
            {row.context && (
              <pre className="text-[10px] leading-snug bg-surface-2 border border-border rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-text-2">
                {JSON.stringify(row.context, null, 2)}
              </pre>
            )}
            <div className="text-[10px] text-text-3 flex flex-wrap gap-3">
              {row.workspace_id && <span>workspace: {row.workspace_id}</span>}
              {row.user_id && <span>user: {row.user_id}</span>}
              <span>id: {row.id}</span>
            </div>
          </div>
        )}
      </button>
    </li>
  )
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = Date.now()
  const ageMs = now - d.getTime()
  if (ageMs < 60_000) return 'just now'
  if (ageMs < 60 * 60_000) {
    const m = Math.round(ageMs / 60_000)
    return `${m}m ago`
  }
  if (ageMs < 24 * 60 * 60_000) {
    const h = Math.round(ageMs / (60 * 60_000))
    return `${h}h ago`
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
