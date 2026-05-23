// Mobile-only bottom navigation strip. Mirrors ViewTabs but anchored
// to the screen bottom for thumb reach. Hidden on sm+ where the
// in-page ViewTabs strip is already visible.
//
// Respects iOS safe-area inset so the bar sits above the home
// indicator on notched phones.

const NAV = [
  { id: 'today',    label: 'Today',  icon: 'ti-sun' },
  { id: 'list',     label: 'List',   icon: 'ti-list' },
  { id: 'grid',     label: 'Grid',   icon: 'ti-table' },
  { id: 'pic',      label: 'PIC',    icon: 'ti-users' },
  { id: 'calendar', label: 'Cal',    icon: 'ti-calendar' },
]

export default function BottomNav({ active, onChange }) {
  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main views"
    >
      <ul className="grid grid-cols-5">
        {NAV.map((item) => {
          const isActive = active === item.id
          return (
            <li key={item.id} className="flex">
              <button
                type="button"
                onClick={() => onChange(item.id)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 ${
                  isActive
                    ? 'text-info'
                    : 'text-text-3 hover:text-text-2'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <i className={`ti ${item.icon} text-lg`} />
                <span className="text-[10px]">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
