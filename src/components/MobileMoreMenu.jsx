import { useEffect, useRef, useState } from 'react'

// Overflow menu for the mobile topbar. Secondary actions (Meeting,
// Standup, Pulse, Settings, Super admin, Sign out) live behind a
// kebab button so the topbar can stay slim with just the primary
// affordances visible (logo · workspace · nudges · search · more).
//
// Renders as a popover anchored to the kebab. Closes on outside-click,
// Escape, or after any item is tapped.
//
// `items` shape:
//   [{ id, label, icon, onClick, visible?: boolean, destructive?: boolean }]
//
// `visible: false` items are skipped; `destructive: true` items get
// danger-text styling and a top divider so Sign out reads distinctly.
export default function MobileMoreMenu({ items }) {
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
    document.addEventListener('touchstart', onDown, { passive: true })
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const visibleItems = items.filter((i) => i.visible !== false)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More"
        aria-expanded={open}
        className="w-10 h-10 rounded-full inline-flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors"
      >
        <i className="ti ti-dots-vertical text-xl" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1 bg-surface border border-border rounded-xl shadow-xl min-w-[200px] py-1 z-50 tickd-modal-content origin-top-right"
        >
          {visibleItems.map((item, idx) => {
            const showDivider =
              item.destructive &&
              idx > 0 &&
              !visibleItems[idx - 1].destructive
            return (
              <div key={item.id}>
                {showDivider && (
                  <div className="my-1 border-t border-border" />
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    item.onClick()
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-surface-2 active:bg-surface-3 ${
                    item.destructive ? 'text-danger-text' : 'text-text'
                  }`}
                >
                  {item.icon && (
                    <i
                      className={`ti ${item.icon} text-base ${
                        item.destructive ? 'text-danger-text' : 'text-text-2'
                      }`}
                    />
                  )}
                  <span>{item.label}</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
