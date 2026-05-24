// Shared bulk-action bar used by Grid, List, PIC, and Calendar views.
// Each view passes the handlers it supports; missing handlers hide
// their respective controls so the bar adapts naturally.
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
  return (
    // On phone, the bar becomes a horizontal-scroll row so the action
    // selects don't wrap into multiple lines (they wouldn't fit anyway).
    // The "count + Clear" label stays pinned to the left.
    <div
      className={`bg-info text-white px-3 sm:px-4 py-2 flex items-center gap-1.5 sm:gap-2 sm:flex-wrap text-xs overflow-x-auto sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      <span className="font-medium flex-shrink-0">{count} selected</span>
      <button
        onClick={onClear}
        className="underline opacity-90 hover:opacity-100 active:opacity-100 flex-shrink-0"
      >
        Clear
      </button>
      <div className="hidden sm:block sm:flex-1" />

      {onSetStatus && (
        <BulkSelect onChange={onSetStatus} placeholder="Set status…">
          <option value="Open">Open</option>
          <option value="In progress">In progress</option>
          <option value="Ongoing">Ongoing</option>
          <option value="Done">Done</option>
        </BulkSelect>
      )}

      {onSetPriority && (
        <BulkSelect onChange={onSetPriority} placeholder="Set priority…">
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </BulkSelect>
      )}

      {onSetPic && (
        <BulkSelect onChange={onSetPic} placeholder="Set PIC…">
          <option value="">— Unassign —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </BulkSelect>
      )}

      {onAddWatcher && (
        <BulkSelect onChange={onAddWatcher} placeholder="Add watcher…">
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </BulkSelect>
      )}

      {onSetDept && (
        <BulkSelect onChange={onSetDept} placeholder="Set dept…">
          <option value="">— Clear —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </BulkSelect>
      )}

      {onSetDue && (
        <input
          type="date"
          onChange={(e) => {
            if (e.target.value) {
              onSetDue(e.target.value)
              e.target.value = ''
            }
          }}
          className="text-xs bg-white/15 hover:bg-white/25 rounded px-2 py-1 border border-white/30 text-white cursor-pointer"
          title="Set due date"
        />
      )}

      {onShareSelected && (
        <button
          onClick={onShareSelected}
          className="text-xs bg-white/15 hover:bg-white/25 rounded px-2 py-1 border border-white/30 inline-flex items-center gap-1"
          title="Share selected tasks to WhatsApp"
        >
          <i className="ti ti-brand-whatsapp text-sm" />
          Share
        </button>
      )}

      {onExportCsv && (
        <button
          onClick={onExportCsv}
          className="text-xs bg-white/15 hover:bg-white/25 rounded px-2 py-1 border border-white/30 inline-flex items-center gap-1"
          title="Export selected tasks as CSV"
        >
          <i className="ti ti-file-export text-sm" />
          CSV
        </button>
      )}

      {onDelete && (
        <button
          onClick={onDelete}
          className="text-xs bg-danger-text/30 hover:bg-danger-text/50 rounded px-2 py-1 border border-white/30 font-medium"
        >
          Delete
        </button>
      )}
    </div>
  )
}

function BulkSelect({ onChange, placeholder, children }) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value !== '') {
          onChange(e.target.value)
          e.target.value = ''
        }
      }}
      className="text-xs bg-white/15 hover:bg-white/25 rounded px-2 py-1 border border-white/30 text-white cursor-pointer max-w-[140px] flex-shrink-0"
    >
      <option value="" className="text-text">
        {placeholder}
      </option>
      {children}
    </select>
  )
}
