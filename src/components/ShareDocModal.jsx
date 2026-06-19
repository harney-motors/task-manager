import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  useAdminUsers,
  useDocShares,
  usePeople,
  useRemoveDocShare,
  useSetDocShare,
  useUpdateDoc,
} from '../lib/queries'
import { picPill } from '../lib/colors'

// Author-only sharing modal for docs. Two controls:
//
//   1. Workspace-visible toggle — flip ON to let every workspace
//      member read the doc (the old default). OFF means strictly
//      author + explicitly invited users.
//   2. Per-user invites — pick anyone from the workspace people list
//      and give them 'view' or 'edit' permission. Author is implicit;
//      they always have full access and are shown for context.
//
// RLS guarantees that only the doc's author sees this modal's data —
// non-authors hit a denied state. We also gate the modal entirely on
// `doc.created_by === user.id` at the caller (DocsView).
export default function ShareDocModal({ doc, onClose }) {
  const { user } = useAuth()
  const { data: people = [] } = usePeople()
  const { data: adminUsers = [] } = useAdminUsers()
  const { data: shares = [], isLoading: sharesLoading } = useDocShares(doc?.id)
  const updateDoc = useUpdateDoc()
  const setShare = useSetDocShare(doc?.id)
  const removeShare = useRemoveDocShare(doc?.id)

  const [picker, setPicker] = useState('')

  // Build a user_id → person lookup so we can render names/avatars
  // for each share recipient. The people table is the source of
  // truth for display info; we only fall back to adminUsers for the
  // raw email when a person has no link.
  const personByUser = useMemo(() => {
    const map = new Map()
    for (const p of people) if (p.user_id) map.set(p.user_id, p)
    return map
  }, [people])
  const emailByUser = useMemo(() => {
    const map = new Map()
    for (const u of adminUsers) map.set(u.id, u.email)
    return map
  }, [adminUsers])

  // Candidate list = workspace people with a linked user account,
  // minus the author, minus anyone already invited. PIC role isn't
  // filtered — even a PIC can be granted view access to a doc.
  const linkedPeople = useMemo(
    () => people.filter((p) => p.user_id && p.user_id !== user?.id),
    [people, user?.id],
  )
  const shareUserIds = new Set(shares.map((s) => s.user_id))
  const candidates = linkedPeople.filter((p) => !shareUserIds.has(p.user_id))

  function addRecipient() {
    if (!picker) return
    const p = candidates.find((x) => x.id === picker)
    if (!p?.user_id) return
    setShare.mutate({ userId: p.user_id, permission: 'view' })
    setPicker('')
  }

  function isAuthor() {
    return doc?.created_by === user?.id
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto tickd-modal-backdrop"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden tickd-modal-content">
        <div className="flex items-center justify-between p-4 border-b border-border tickd-sheet-header">
          <div>
            <div className="text-sm font-medium">Share doc</div>
            <div className="text-[11px] text-text-3 mt-0.5 line-clamp-1">
              {doc?.title || 'Untitled'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-3 hover:text-text p-1 rounded hover:bg-surface-2"
            aria-label="Close"
          >
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Workspace-visible toggle */}
          <label
            className={`flex items-start gap-2 text-xs cursor-pointer ${
              isAuthor() ? '' : 'opacity-60 cursor-not-allowed'
            }`}
          >
            <input
              type="checkbox"
              checked={!!doc?.is_workspace_visible}
              onChange={(e) =>
                isAuthor() &&
                updateDoc.mutate({
                  id: doc.id,
                  isWorkspaceVisible: e.target.checked,
                })
              }
              disabled={!isAuthor() || updateDoc.isPending}
              className="cursor-pointer mt-0.5"
            />
            <span className="text-text-2">
              <span className="font-medium text-text">
                Anyone in this workspace can read
              </span>
              <span className="block text-[11px] text-text-3 mt-0.5">
                Off by default — your doc stays private unless you flip this
                on or invite specific people below.
              </span>
            </span>
          </label>

          {/* People section */}
          <div className="border-t border-border pt-4">
            <div className="text-xs font-medium text-text-2 mb-2">
              Shared with
            </div>
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {/* Author row — always first, never removable */}
              <li className="flex items-center gap-2 px-3 py-2 bg-surface-2">
                <span
                  className={`text-[10px] px-1.5 py-px rounded font-medium ${picPill(personByUser.get(doc?.created_by)?.color ?? 'gray')}`}
                >
                  {(personByUser.get(doc?.created_by)?.name ??
                    emailByUser.get(doc?.created_by) ??
                    'Owner').split(' ')[0]}
                </span>
                <span className="text-xs text-text flex-1 truncate">
                  {personByUser.get(doc?.created_by)?.name ??
                    emailByUser.get(doc?.created_by) ??
                    'Author'}
                </span>
                <span className="text-[10px] text-text-3">Author</span>
              </li>
              {sharesLoading ? (
                <li className="px-3 py-2 text-[11px] text-text-3">Loading…</li>
              ) : shares.length === 0 ? (
                <li className="px-3 py-2 text-[11px] text-text-3">
                  No one else yet.
                </li>
              ) : (
                shares.map((s) => {
                  const person = personByUser.get(s.user_id)
                  const label = person?.name ?? emailByUser.get(s.user_id) ?? '(user)'
                  return (
                    <li
                      key={s.user_id}
                      className="flex items-center gap-2 px-3 py-2"
                    >
                      {person && (
                        <span
                          className={`text-[10px] px-1.5 py-px rounded font-medium ${picPill(person.color)}`}
                        >
                          {person.name.split(' ')[0]}
                        </span>
                      )}
                      <span className="text-xs text-text flex-1 truncate">
                        {label}
                      </span>
                      <select
                        value={s.permission}
                        onChange={(e) =>
                          setShare.mutate({
                            userId: s.user_id,
                            permission: e.target.value,
                          })
                        }
                        disabled={!isAuthor() || setShare.isPending}
                        className="text-[11px] border border-border rounded px-1.5 py-0.5 bg-surface"
                      >
                        <option value="view">Can view</option>
                        <option value="edit">Can edit</option>
                      </select>
                      {isAuthor() && (
                        <button
                          type="button"
                          onClick={() => removeShare.mutate(s.user_id)}
                          disabled={removeShare.isPending}
                          className="text-text-3 hover:text-danger-text p-1"
                          aria-label={`Remove ${label}`}
                          title="Revoke"
                        >
                          <i className="ti ti-x text-xs" />
                        </button>
                      )}
                    </li>
                  )
                })
              )}
            </ul>
          </div>

          {/* Add-recipient picker */}
          {isAuthor() && candidates.length > 0 && (
            <div className="border-t border-border pt-4">
              <div className="text-xs font-medium text-text-2 mb-1.5">
                Invite someone
              </div>
              <div className="flex gap-2">
                <select
                  value={picker}
                  onChange={(e) => setPicker(e.target.value)}
                  className="flex-1 border border-border rounded px-2 py-1.5 text-xs bg-bg"
                >
                  <option value="">— Pick a workspace member —</option>
                  {candidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.title ? ` · ${p.title}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addRecipient}
                  disabled={!picker || setShare.isPending}
                  className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <p className="text-[10px] text-text-3 mt-1.5">
                Recipients get view access by default — flip them to &ldquo;Can
                edit&rdquo; above to grant co-author rights.
              </p>
            </div>
          )}

          {!isAuthor() && (
            <p className="text-[11px] text-text-3 italic border-t border-border pt-4">
              Only the doc&rsquo;s author can change sharing.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 bg-surface-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
