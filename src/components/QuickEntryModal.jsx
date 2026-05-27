import { useEffect } from 'react'
import QuickEntry from './QuickEntry'
import ModalHeader from './ModalHeader'

// Thin sheet wrapper around the existing QuickEntry component. Used
// by the mobile FAB to surface task creation in a bottom sheet
// instead of pinning QuickEntry to the top of every view (which ate
// above-the-fold real estate on phones).
export default function QuickEntryModal({ open, onClose }) {
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
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto tickd-modal-backdrop"
    >
      {/* No `overflow-hidden` here — the QuickEntry PIC picker
          renders as `absolute top-full ...` and would get clipped to
          the modal box otherwise (see the cropped-dropdown bug). The
          rounded corners still look right because the only
          edge-touching child is ModalHeader, which carries its own
          bg-surface from the sticky-header rule and a border-b. */}
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md tickd-modal-content">
        <ModalHeader
          title="New task"
          icon="ti-sparkles"
          onClose={onClose}
        />
        <div className="p-3">
          <QuickEntry onSubmitted={onClose} />
        </div>
      </div>
    </div>
  )
}
