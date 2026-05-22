const TABS = [
  { id: 'today',    label: 'Today',    icon: 'ti-sun' },
  { id: 'list',     label: 'List',     icon: 'ti-list' },
  { id: 'grid',     label: 'Grid',     icon: 'ti-table' },
  { id: 'pic',      label: 'By PIC',   icon: 'ti-users' },
  { id: 'calendar', label: 'Calendar', icon: 'ti-calendar' },
]

export default function ViewTabs({ active, onChange }) {
  return (
    // Horizontal-scroll wrapper so 4 tabs always fit on narrow phones
    // without wrapping or shrinking text.
    <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex items-center gap-1 p-1 bg-surface-2 rounded-lg">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-3 py-1.5 text-xs rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              active === tab.id
                ? 'bg-surface text-text font-medium shadow-sm'
                : 'text-text-2 hover:text-text'
            }`}
          >
            <i className={`ti ${tab.icon} text-sm`} />
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
