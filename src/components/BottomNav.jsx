// Mobile-only bottom navigation. Anchored to the screen bottom for
// thumb reach; hidden on sm+.
//
// iOS-feel:
//  - Translucent material via backdrop-blur (1px hairline top border)
//  - Filled-glyph swap on active for the standard iOS tab-bar look
//  - 44pt min tap targets per Apple HIG
//  - Press-down state via active: scale + opacity
//  - Respects iOS safe-area inset so it sits above the home indicator

const NAV = [
  // Active state communicated via colour + a 160ms tab-pop micro-bounce
  // rather than a filled-glyph swap — Tabler's free set doesn't ship a
  // filled variant for every icon we use here (list, users), so the
  // colour-only approach keeps the row visually consistent.
  //
  // picOk: true — view shows up in the PIC-role bar (RLS already
  // restricts data to their own tasks, so Grid + By-PIC are noise).
  { id: 'today',    label: 'Today',  icon: 'ti-sun',      picOk: true  },
  { id: 'list',     label: 'List',   icon: 'ti-list',     picOk: true  },
  { id: 'docs',     label: 'Docs',   icon: 'ti-book-2',   picOk: true  },
  // Grid is a table view that doesn't suit phone widths — moved to
  // the MobileMoreMenu overflow. Kanban removed entirely a few
  // commits back. Docs takes the prime middle spot since it's the
  // most-touched non-task surface on mobile.
  { id: 'pic',      label: 'PIC',    icon: 'ti-users',    picOk: false },
  { id: 'calendar', label: 'Cal',    icon: 'ti-calendar', picOk: true  },
]

export default function BottomNav({ active, onChange, picRole = false }) {
  // PIC role gets a focused subset (today/list/cal). Everyone else
  // gets the full 5-tab bar.
  const items = NAV.filter((n) => (picRole ? n.picOk : true))
  const cols = items.length >= 5 ? 'grid-cols-5' : 'grid-cols-4'
  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-surface/85 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main views"
    >
      <ul className={`grid ${cols}`}>
        {items.map((item) => {
          const isActive = active === item.id
          return (
            <li key={item.id} className="flex">
              <button
                type="button"
                onClick={() => onChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex-1 min-h-[44px] flex flex-col items-center justify-center gap-0.5 py-1.5 transition-all active:scale-95 ${
                  isActive ? 'text-info' : 'text-text-3 active:text-text-2'
                }`}
              >
                {/* Icon column. Active state pops a small accent dot
                    above the glyph — the iOS-tab-bar "you-are-here"
                    marker — and swaps to a filled variant where one
                    exists for extra visual weight. */}
                <span className="relative inline-flex items-center justify-center">
                  <i
                    className={`ti ${item.icon} text-[22px] leading-none ${
                      isActive ? 'tickd-tab-active' : ''
                    }`}
                  />
                </span>
                <span
                  className={`text-[10px] leading-tight tracking-tight ${
                    isActive ? 'font-semibold' : 'font-normal'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
