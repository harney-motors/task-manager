import { useEffect, useState } from 'react'
import {
  useCreatePerson,
  useDepartments,
  useUpdatePerson,
} from '../lib/queries'
import ColorPicker from './ColorPicker'

function deriveInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
}

export default function PersonModal({ person, onClose }) {
  const isEdit = !!person
  const { data: departments = [] } = useDepartments()
  const create = useCreatePerson()
  const update = useUpdatePerson()
  const submitting = create.isPending || update.isPending

  const [form, setForm] = useState({
    name: person?.name ?? '',
    title: person?.title ?? '',
    department: person?.department ?? '',
    role: person?.role ?? 'pic',
    color: person?.color ?? 'blue',
  })
  const [error, setError] = useState(null)

  useEffect(() => {
    function handler(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const name = form.name.trim()
    if (!name) {
      setError('Name is required.')
      return
    }
    const fields = {
      name,
      title: form.title.trim() || null,
      department: form.department || null,
      role: form.role,
      color: form.color,
      initials: deriveInitials(name),
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ id: person.id, ...fields })
      } else {
        await create.mutateAsync(fields)
      }
      onClose()
    } catch (err) {
      setError(err?.message ?? 'Could not save. Try again.')
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-sm font-medium">
            {isEdit ? 'Edit person' : 'Add person'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-3 hover:text-text p-1 rounded hover:bg-surface-2"
          >
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              autoFocus
              required
              className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-info bg-bg"
            />
          </Field>

          <Field label="Title">
            <input
              type="text"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Service Manager"
              className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-info bg-bg"
            />
          </Field>

          <Field label="Department">
            <select
              value={form.department}
              onChange={(e) => set('department', e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-bg cursor-pointer"
            >
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Role">
            <div className="flex gap-2 flex-wrap">
              {['owner', 'editor', 'pic'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set('role', r)}
                  className={`text-xs px-3 py-1.5 rounded border ${
                    form.role === r
                      ? 'border-info text-info font-medium bg-info-bg'
                      : 'border-border text-text-2 hover:text-text'
                  }`}
                >
                  {r === 'pic' ? 'PIC' : r[0].toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Color">
            <ColorPicker
              value={form.color}
              onChange={(c) => set('color', c)}
            />
          </Field>

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
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add person'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-2 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}
