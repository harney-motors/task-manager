import { useEffect, useState } from 'react'
import { useCreateDepartment, useUpdateDepartment } from '../lib/queries'
import ColorPicker from './ColorPicker'
import ModalHeader from './ModalHeader'

export default function DepartmentModal({ department, onClose }) {
  const isEdit = !!department
  const create = useCreateDepartment()
  const update = useUpdateDepartment()
  const submitting = create.isPending || update.isPending

  const [form, setForm] = useState({
    name: department?.name ?? '',
    color: department?.color ?? 'blue',
  })
  const [error, setError] = useState(null)

  useEffect(() => {
    function handler(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const name = form.name.trim()
    if (!name) {
      setError('Name is required.')
      return
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ id: department.id, name, color: form.color })
      } else {
        await create.mutateAsync({ name, color: form.color })
      }
      onClose()
    } catch (err) {
      setError(err?.message ?? 'Could not save. Try again.')
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto tickd-modal-backdrop"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden tickd-modal-content"
      >
        <ModalHeader
          title={isEdit ? 'Edit department' : 'Add department'}
          icon="ti-tag"
          onClose={onClose}
        />

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-2 mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
              required
              placeholder="e.g. Strategy"
              className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-info bg-bg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-2 mb-1.5">
              Color
            </label>
            <ColorPicker
              value={form.color}
              onChange={(c) => setForm((f) => ({ ...f, color: c }))}
            />
          </div>
          {error && <p className="text-xs text-danger-text">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 bg-surface-2 border-t border-border rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add department'}
          </button>
        </div>
      </form>
    </div>
  )
}
