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

  // Hide entirely when there's only one workspace — no switcher needed.
  if (workspaces.length <= 1) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs px-2.5 py-1 rounded border border-border hover:bg-surface-2 inline-flex items-center gap-1.5 min-w-0 max-w-[140px] sm:max-w-[200px]"
        title={workspace?.name}
      >
        <span className="truncate text-text-2 hover:text-text">
          {workspace?.name ?? 'Pick a workspace'}
        </span>
        <i className="ti ti-chevron-down text-xs text-text-3 flex-shrink-0" />
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
