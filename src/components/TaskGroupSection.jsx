import { useState } from 'react'

// Collapsible group header used in Grid + PIC views when tasks are
// grouped (status / pic / dept / priority / due / tag). Tap the
// header to expand/collapse; defaults to collapsed so a long list
// of groups doesn't dump every task on the page at once.
//
// Props:
//  - label    : group title; if falsy, renders children with no
//               header (single ungrouped bucket).
//  - count    : displayed next to the label.
//  - padded   : wrap children in px-3/sm:px-4 padding. Grid view
//               passes `false` because <GridRow> owns its own
//               horizontal padding via the COLS template.
//  - defaultOpen : start expanded. Defaults to false (collapsed).
//  - children : the rows to render when expanded.
export default function TaskGroupSection({
  label,
  count,
  padded = true,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (!label) {
    return padded ? (
      <div className="px-3 sm:px-4">{children}</div>
    ) : (
      <>{children}</>
    )
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="tickd-stick-below-topbar w-full flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-left bg-surface-2/95 backdrop-blur-sm hover:bg-surface-2 border-b border-border"
      >
        <i
          className={`ti ${open ? 'ti-chevron-down' : 'ti-chevron-right'} text-xs text-text-3`}
        />
        <span className="text-[11px] uppercase tracking-wider text-text-2 font-medium">
          {label}
        </span>
        <span className="text-[11px] text-text-3">· {count}</span>
      </button>
      {open &&
        (padded ? (
          <div className="px-3 sm:px-4">{children}</div>
        ) : (
          <>{children}</>
        ))}
    </div>
  )
}
