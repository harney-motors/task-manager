import { useEffect, useMemo, useState } from 'react'
import { useAdminLinkPerson, useAdminUsers } from '../lib/queries'
import { findPersonForEmail } from '../lib/matchPerson'
import { useToast } from './Toast'
import ModalHeader from './ModalHeader'

// Superadmin tool: link an EXISTING auth user to an EXISTING person.
// Complements admin-create-user (which links on create) for the case
// where both already exist.
//
// Lists all users (RLS: superadmin can read get_all_users) with the
// best first-name match for THIS person bubbled to the top.
export default function LinkPersonModal({ person, onClose }) {
  const { data: users = [], isLoading } = useAdminUsers()
  const linkPerson = useAdminLinkPerson()
  const showToast = useToast()
  const [filter, setFilter] = useState('')
  const [pickedId, setPickedId] = useState(null)

  // First-name match using the email→person matcher in reverse:
  // try each user's email against this person's name as the only
  // candidate; if matchPerson returns the person, it's a strong hit.
  const suggestedUserId = useMemo(() => {
    if (!person) return null
    for (const u of users) {
      if (!u.email) continue
      const match = findPersonForEmail(u.email, [person])
      if (match) return u.id
    }
    return null
  }, [users, person])

  useEffect(() => {
    if (!pickedId && suggestedUserId) setPickedId(suggestedUserId)
  }, [suggestedUserId, pickedId])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const base = users
    if (!q) return base
    return base.filter((u) => u.email?.toLowerCase().includes(q))
  }, [users, filter])

  // Bubble the suggested user to the top
  const ordered = useMemo(() => {
    if (!suggestedUserId) return filtered
    const idx = filtered.findIndex((u) => u.id === suggestedUserId)
    if (idx <= 0) return filtered
    const next = [...filtered]
    const [picked] = next.splice(idx, 1)
    next.unshift(picked)
    return next
  }, [filtered, suggestedUserId])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!person) return null

  async function handleSubmit() {
    if (!pickedId) return
    try {
      await linkPerson.mutateAsync({ personId: person.id, userId: pickedId })
      const u = users.find((x) => x.id === pickedId)
      showToast(`Linked ${person.name} to ${u?.email ?? 'user'}.`)
      onClose()
    } catch {
      // toast surfaced by hook
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto tickd-modal-backdrop"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] tickd-modal-content">
        <ModalHeader
          title="Link person to user"
          icon="ti-link"
          onClose={onClose}
        />

        <div className="px-5 py-3 border-b border-border">
          <div className="text-xs text-text-2">Linking:</div>
          <div className="text-sm font-medium mt-0.5">{person.name}</div>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <input
            type="text"
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by email…"
            className="w-full text-sm px-3 py-1.5 border border-border rounded-md bg-surface outline-none focus:border-info"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {isLoading ? (
            <div className="px-3 py-6 text-center text-xs text-text-3">
              Loading users…
            </div>
          ) : ordered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-text-3">
              No users match.
            </div>
          ) : (
            ordered.map((u) => {
              const picked = pickedId === u.id
              const isSuggested = u.id === suggestedUserId
              return (
                <button
                  key={u.id}
                  onClick={() => setPickedId(u.id)}
                  className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-colors ${
                    picked ? 'bg-info-bg/60' : 'hover:bg-surface-2'
                  }`}
                >
                  <input
                    type="radio"
                    checked={picked}
                    onChange={() => setPickedId(u.id)}
                    className="cursor-pointer flex-shrink-0"
                    aria-label={`Pick ${u.email}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{u.email}</div>
                    {isSuggested && (
                      <div className="text-[10px] text-info-text inline-flex items-center gap-0.5 mt-0.5">
                        <i className="ti ti-sparkles text-[10px]" />
                        Suggested · first-name match
                      </div>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="px-4 py-3 bg-surface-2 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!pickedId || linkPerson.isPending}
            className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {linkPerson.isPending ? (
              <>
                <i className="ti ti-loader-2 animate-spin text-sm" />
                Linking…
              </>
            ) : (
              <>
                <i className="ti ti-link text-sm" />
                Link
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
