// Standard modal header: optional leading icon + title on the left,
// an optional right-side slot for status/badges, then a single
// macOS-style red close "dot" on the far right (X glyph appears
// inside on hover).
//
// We dropped the yellow + green dots because in-page modals don't
// minimise or maximise — only the close affordance carries meaning.

export default function ModalHeader({
  title,
  icon,
  onClose,
  rightSlot = null,
  className = '',
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-border ${className}`}
    >
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {icon && <i className={`ti ${icon} text-info text-base flex-shrink-0`} />}
        <span className="text-sm font-medium truncate">{title}</span>
      </div>
      {rightSlot}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        title="Close"
        className="group/close relative w-3 h-3 rounded-full bg-[#FF5F57] hover:opacity-90 inline-flex items-center justify-center flex-shrink-0"
      >
        <i
          className="ti ti-x text-[#7B0008] opacity-0 group-hover/close:opacity-100 transition-opacity"
          style={{ fontSize: '8px', lineHeight: 1 }}
        />
      </button>
    </div>
  )
}
