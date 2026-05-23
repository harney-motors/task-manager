import { useEffect } from 'react'

// Cheat-sheet modal triggered by `?`. Lists every shortcut grouped by
// context so a new user (or your future self) can see what's wired
// without spelunking through code.
//
// When you add a new shortcut, register it here too so it shows up.

const SECTIONS = [
  {
    title: 'Anywhere',
    rows: [
      { keys: ['/'], or: ['c'], label: 'Focus quick entry' },
      { keys: ['⌘', 'K'], label: 'Open search · Ask Tickd AI' },
      { keys: ['?'], label: 'Show this help' },
    ],
  },
  {
    title: 'Jump to view',
    rows: [
      { keys: ['g', 't'], label: 'Today' },
      { keys: ['g', 'l'], label: 'List' },
      { keys: ['g', 'g'], label: 'Grid' },
      { keys: ['g', 'p'], label: 'By PIC' },
      { keys: ['g', 'c'], label: 'Calendar' },
      { keys: ['g', 's'], label: 'Settings' },
    ],
  },
  {
    title: 'List view',
    rows: [
      { keys: ['j'], label: 'Move focus down' },
      { keys: ['k'], label: 'Move focus up' },
      { keys: ['Enter'], or: ['e'], label: 'Open focused task' },
      { keys: ['x'], label: 'Toggle selection' },
      { keys: ['Esc'], label: 'Clear focus + selection' },
    ],
  },
  {
    title: 'Inside a task',
    rows: [
      { keys: ['Esc'], label: 'Close' },
      { keys: ['⌘', 'Enter'], label: 'Save + close' },
      { keys: ['n'], label: 'Jump to Journal tab + focus composer' },
    ],
  },
]

export default function ShortcutsHelpModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-sm font-medium inline-flex items-center gap-2">
            <i className="ti ti-keyboard text-base text-info" />
            Keyboard shortcuts
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface-2 text-text-3 hover:text-text"
            aria-label="Close"
          >
            <i className="ti ti-x text-sm" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {SECTIONS.map((sec) => (
            <section key={sec.title}>
              <div className="text-[10px] uppercase tracking-wider text-text-3 font-medium mb-2">
                {sec.title}
              </div>
              <ul className="space-y-1.5">
                {sec.rows.map((row, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-text-2">{row.label}</span>
                    <span className="inline-flex items-center gap-1">
                      <KeyCombo keys={row.keys} />
                      {row.or && (
                        <>
                          <span className="text-[10px] text-text-3 mx-1">or</span>
                          <KeyCombo keys={row.or} />
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="px-4 py-3 bg-surface-2 border-t border-border text-[11px] text-text-3 text-center">
          Tip: shortcuts are off while you&rsquo;re typing in a field.
        </div>
      </div>
    </div>
  )
}

function KeyCombo({ keys }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((k, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          <kbd className="text-[11px] px-1.5 py-0.5 rounded border border-border bg-surface-2 font-mono">
            {k}
          </kbd>
          {i < keys.length - 1 && (
            <span className="text-[10px] text-text-3">+</span>
          )}
        </span>
      ))}
    </span>
  )
}
