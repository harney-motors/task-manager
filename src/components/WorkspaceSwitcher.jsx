import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'

const ROLE_LABEL = {
  owner: 'Owner',
  editor: 'Editor',
  pic: 'PIC',
}

export default function WorkspaceSwitcher() {
  const { workspaces, workspace, setActiveWorkspace } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Always render — even with one workspace — so the current context
  // is unambiguously visible. With one workspace the chevron is hidden
  // and the chip becomes non-interactive (click does nothing).
  const single = workspaces.length <= 1
  const initial = (workspace?.name ?? '?').charAt(0).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => (single ? null : setOpen((o) => !o))}
        disabled={single}
        className={`text-xs pl-1 pr-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 min-w-0 max-w-[140px] sm:max-w-[200px] ${
          single
            ? 'border-border cursor-default'
            : 'border-border hover:bg-surface-2'
        }`}
        title={workspace?.name}
      >
        {/* Initial pill so the workspace identity is visible even when
            the name truncates on narrow screens. */}
        <span
          className="flex-shrink-0 w-5 h-5 rounded-full bg-info text-white text-[10px] font-semibold flex items-center justify-center"
          aria-hidden="true"
        >
          {initial}
        </span>
        <span className="truncate text-text-2">
          {workspace?.name ?? 'Pick a workspace'}
        </span>
        {!single && (
          <i className="ti ti-chevron-down text-xs text-text-3 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-lg shadow-xl min-w-[240px] py-1 z-50">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-3 font-medium border-b border-border">
            Workspaces ({workspaces.length})
          </div>
          {workspaces.map((w) => {
            const active = w.id === workspace?.id
            return (
              <button
                key={w.id}
                onClick={() => {
                  setActiveWorkspace(w.id)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-surface-2 ${
                  active ? 'bg-info-bg/40' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {active && (
                    <i className="ti ti-check text-info text-sm flex-shrink-0" />
                  )}
                  <span
                    className={`text-sm truncate ${active ? 'font-medium' : ''}`}
                  >
                    {w.name}
                  </span>
                </div>
                <span className="text-[10px] text-text-3 uppercase tracking-wider flex-shrink-0">
                  {ROLE_LABEL[w.role] ?? w.role}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
