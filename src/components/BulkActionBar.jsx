import { useEffect, useRef, useState } from 'react'

// Shared bulk-action bar used by Grid, List, PIC, and Calendar views.
//
// Layout: a thin sticky bar showing "{count} selected" + Clear, and a
// single "Actions" button that opens a sheet/popover with every bulk
// operation the parent supports. Avoids the previous horizontal-scroll
// row of inline selects (cramped on mobile, untidy on desktop).
//
// Each view passes the handlers it supports; missing handlers hide
// their respective entries so the sheet adapts naturally.
//
// Props:
//   count            — number selected (≥1)
//   onClear          — clear selection
//   onSetStatus      — (value) => void   "Open"|"In progress"|"Ongoing"|"Done"
//   onSetPic         — (picId | '') => void
//   onSetDept        — (deptId | '') => void
//   onSetDue         — (yyyy-mm-dd | '') => void
//   onSetPriority    — (value) => void   "High"|"Medium"|"Low"
//   onAddWatcher     — (picId) => void   appends a watcher to each task
//   onExportCsv      — () => void        triggers download
//   onShareSelected  — () => void        opens the share-selection modal
//   onDelete         — () => void
//   people, departments — for select options
//   className        — outer class overrides
export default function BulkActionBar({
  count,
  onClear,
  onSetStatus,
  onSetPic,
  onSetDept,
  onSetDue,
  onSetPriority,
  onAddWatcher,
  onExportCsv,
  onShareSelected,
  onDelete,
  people = [],
  departments = [],
  className = '',
}) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className={`bg-info text-white px-3 sm:px-4 py-2 flex items-center gap-2 text-xs ${className}`}
    >
      <span className="font-semibold flex-shrink-0">{count} selected</span>
      <button
        onClick={onClear}
        className="underline opacity-90 hover:opacity-100 active:opacity-100 flex-shrink-0"
      >
        Clear
      </button>
      <div className="flex-1" />

      {/* Quick-access: Delete is the only inline action because it's
          most-used and recovery is easy (undo toast). Everything else
          lives behind the Actions sheet so the bar stays slim. */}
      {onDelete && (
        <button
          onClick={onDelete}
          className="px-2.5 py-1 rounded-md bg-danger-text/30 hover:bg-danger-text/50 border border-white/30 font-medium inline-flex items-center gap-1 flex-shrink-0 active:scale-95 transition-transform"
          aria-label="Delete selected"
        >
          <i className="ti ti-trash text-sm" />
          <span className="hidden sm:inline">Delete</span>
        </button>
      )}
      <button
        onClick={() => setOpen(true)}
        className="px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 border border-white/30 inline-flex items-center gap-1 flex-shrink-0 font-medium active:scale-95 transition-transform"
      >
        <i className="ti ti-dots text-sm" />
        Actions
      </button>

      {open && (
        <BulkActionSheet
          onClose={() => setOpen(false)}
          onSetStatus={onSetStatus}
          onSetPic={onSetPic}
          onSetDept={onSetDept}
          onSetDue={onSetDue}
          onSetPriority={onSetPriority}
          onAddWatcher={onAddWatcher}
          onExportCsv={onExportCsv}
          onShareSelected={onShareSelected}
          people={people}
          departments={departments}
          count={count}
        />
      )}
    </div>
  )
}

// Sheet that bundles all bulk actions. On mobile slides up from the
// bottom (via the existing .tickd-modal-content sheet CSS); on desktop
// centers as a modal. Each row is a self-contained action: a label
// plus the right control (select / date input / button).
function BulkActionSheet({
  onClose,
  onSetStatus,
  onSetPic,
  onSetDept,
  onSetDue,
  onSetPriority,
  onAddWatcher,
  onExportCsv,
  onShareSelected,
  people,
  departments,
  count,
}) {
  const sheetRef = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Wrap any handler so it closes the sheet after firing.
  const wrap = (handler) => (value) => {
    handler(value)
    onClose()
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-[60] flex items-start justify-center p-2 sm:p-10 overflow-y-auto tickd-modal-backdrop"
    >
      <div
        ref={sheetRef}
        className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] tickd-modal-content"
      >
        <div className="tickd-sheet-header flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <i className="ti ti-list-check text-info text-base flex-shrink-0" />
            <span className="text-sm font-medium">
              Actions on {count} task{count === 1 ? '' : 's'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full inline-flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors flex-shrink-0"
          >
            <i className="ti ti-x text-base" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {onSetStatus && (
            <SheetSelect
              icon="ti-progress"
              label="Set status"
              placeholder="Pick a status"
              onChange={wrap(onSetStatus)}
            >
              <option value="Open">Open</option>
              <option value="In progress">In progress</option>
              <option value="Ongoing">Ongoing</option>
              <option value="Done">Done</option>
            </SheetSelect>
          )}

          {onSetPriority && (
            <SheetSelect
              icon="ti-flame"
              label="Set priority"
              placeholder="Pick a priority"
              onChange={wrap(onSetPriority)}
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </SheetSelect>
          )}

          {onSetPic && (
            <SheetSelect
              icon="ti-user"
              label="Reassign PIC"
              placeholder="Pick a person"
              onChange={wrap(onSetPic)}
            >
              <option value="">— Unassign —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SheetSelect>
          )}

          {onAddWatcher && (
            <SheetSelect
              icon="ti-eye"
              label="Add watcher"
              placeholder="Pick a person"
              onChange={wrap(onAddWatcher)}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SheetSelect>
          )}

          {onSetDept && (
            <SheetSelect
              icon="ti-tag"
              label="Set department"
              placeholder="Pick a department"
              onChange={wrap(onSetDept)}
            >
              <option value="">— Clear —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SheetSelect>
          )}

          {onSetDue && (
            <SheetRow icon="ti-calendar" label="Set due date">
              <input
                type="date"
                onChange={(e) => {
                  if (e.target.value) {
                    onSetDue(e.target.value)
                    onClose()
                  }
                }}
                className="min-h-[40px] text-sm border border-border rounded-md px-3 py-2 bg-bg cursor-pointer outline-none focus:border-info"
              />
            </SheetRow>
          )}

          {onShareSelected && (
            <SheetButton
              icon="ti-brand-whatsapp"
              label="Share to WhatsApp"
              onClick={() => {
                onShareSelected()
                onClose()
              }}
            />
          )}

          {onExportCsv && (
            <SheetButton
              icon="ti-file-export"
              label="Export as CSV"
              onClick={() => {
                onExportCsv()
                onClose()
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// Row in the sheet — left icon + label, right slot for the control.
function SheetRow({ icon, label, children }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <i className={`ti ${icon} text-text-2 text-base flex-shrink-0`} />
      <div className="text-sm flex-1 min-w-0">{label}</div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// Pre-wired select row.
function SheetSelect({ icon, label, placeholder, onChange, children }) {
  return (
    <SheetRow icon={icon} label={label}>
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value !== '') onChange(e.target.value)
        }}
        className="min-h-[40px] text-sm border border-border rounded-md px-3 py-2 bg-bg cursor-pointer outline-none focus:border-info max-w-[180px]"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {children}
      </select>
    </SheetRow>
  )
}

// Full-row action button (no select).
function SheetButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-surface-2 active:bg-surface-3 transition-colors"
    >
      <i className={`ti ${icon} text-text-2 text-base flex-shrink-0`} />
      <span className="text-sm flex-1">{label}</span>
      <i className="ti ti-chevron-right text-text-3 text-sm" />
    </button>
  )
}
