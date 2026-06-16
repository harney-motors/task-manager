import { useEffect, useMemo, useState } from 'react'
import {
  useAdminCreateUser,
  useAdminWorkspaces,
} from '../lib/queries'
import { useToast } from './Toast'
import { supabase } from '../lib/supabase'
import { findPersonForEmail } from '../lib/matchPerson'

// Shared "Create user" modal used by:
//   - Super Admin → Users panel (no constraints, can pick any
//     workspace + promote to superadmin)
//   - Settings → People (workspace owner) — passes a forcedWorkspaceId
//     so the workspace dropdown disappears, and allowPromote=false so
//     the superadmin checkbox isn't even an option
//
// Props:
//   onClose                — close handler
//   forcedWorkspaceId      — when set, hides the workspace selector
//                            and pins all user creation to this one
//                            workspace (the owner's workspace)
//   forcedWorkspaceName    — display name for the locked workspace
//   allowPromote           — show the "Promote to superadmin" checkbox.
//                            Defaults to true (admin panel); pass false
//                            for the owner path
export default function CreateUserModal({
  onClose,
  forcedWorkspaceId = null,
  forcedWorkspaceName = null,
  allowPromote = true,
}) {
  // `useAdminWorkspaces` is already gated on the caller being a
  // superadmin (returns empty for owners), so the selector is empty
  // for them — but we also hide the selector entirely when a forced
  // workspace is passed, which is what happens for the owner path.
  const { data: workspaces = [] } = useAdminWorkspaces()
  const create = useAdminCreateUser()
  const showToast = useToast()

  const [email, setEmail] = useState('')
  const [sendInvite, setSendInvite] = useState(false)
  const [workspaceId, setWorkspaceId] = useState(forcedWorkspaceId ?? '')
  const [role, setRole] = useState('editor')
  const [promoteSuperadmin, setPromoteSuperadmin] = useState(false)
  const [error, setError] = useState(null)

  // Sync local workspaceId if the prop changes (e.g. user switches
  // workspaces while modal is mounted — rare but cheap to handle).
  useEffect(() => {
    if (forcedWorkspaceId) setWorkspaceId(forcedWorkspaceId)
  }, [forcedWorkspaceId])

  // Fetch the selected workspace's people so we can offer person-linking.
  // Owners can read their own workspace's people via RLS; superadmins
  // can read any workspace.
  const [workspacePeople, setWorkspacePeople] = useState([])
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [linkPersonId, setLinkPersonId] = useState('')
  const [autoMatched, setAutoMatched] = useState(false)

  useEffect(() => {
    if (!workspaceId) {
      setWorkspacePeople([])
      setLinkPersonId('')
      return
    }
    let cancelled = false
    setPeopleLoading(true)
    supabase
      .from('people')
      .select('id, name, title, department, color, user_id')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn('[create-user] people fetch failed', error)
          setWorkspacePeople([])
        } else {
          setWorkspacePeople(data ?? [])
        }
        setPeopleLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const suggestedPerson = useMemo(
    () => findPersonForEmail(email, workspacePeople),
    [email, workspacePeople],
  )

  useEffect(() => {
    if (autoMatched) return
    if (!linkPersonId && suggestedPerson) {
      setLinkPersonId(suggestedPerson.id)
    }
  }, [suggestedPerson, linkPersonId, autoMatched])

  function handleLinkPersonChange(id) {
    setLinkPersonId(id)
    setAutoMatched(true)
  }

  const linkCandidates = workspacePeople.filter((p) => !p.user_id)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setError('Email is required.')
      return
    }
    try {
      const result = await create.mutateAsync({
        email: trimmedEmail,
        sendInvite,
        workspaceId: workspaceId || null,
        role: workspaceId ? role : null,
        promoteSuperadmin: allowPromote ? promoteSuperadmin : false,
        linkPersonId: workspaceId && linkPersonId ? linkPersonId : null,
      })
      if (result.warnings && result.warnings.length > 0) {
        showToast(`Created. ${result.warnings.join(' ')}`, { type: 'error' })
      } else {
        showToast(
          sendInvite
            ? `Invite sent to ${trimmedEmail}`
            : `Created ${trimmedEmail}`,
        )
      }
      onClose()
    } catch (err) {
      setError(err.message ?? 'Could not create')
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto"
    >
      <form
        onSubmit={submit}
        className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-sm font-medium">Create user</div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-3 hover:text-text p-1 rounded hover:bg-surface-2"
          >
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-2 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              autoFocus
              required
              className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-info bg-bg"
            />
          </div>

          <div className="border-t border-border pt-4">
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={sendInvite}
                onChange={(e) => setSendInvite(e.target.checked)}
                className="cursor-pointer mt-0.5"
              />
              <span className="text-text-2">
                Send invite email
                <span className="block text-[11px] text-text-3 mt-0.5">
                  {sendInvite
                    ? 'They get a magic link to sign in. Use when handing the account to someone else.'
                    : 'Auto-confirm without emailing them. They can sign in any time with a magic link to that address.'}
                </span>
              </span>
            </label>
          </div>

          <div className="border-t border-border pt-4">
            <div className="text-xs font-medium text-text-2 mb-1.5">
              {forcedWorkspaceId
                ? 'Workspace assignment'
                : 'Workspace assignment (optional)'}
            </div>
            <div className="flex gap-2">
              {forcedWorkspaceId ? (
                <div className="flex-1 border border-border rounded-md px-2 py-1.5 text-xs bg-surface-2 text-text-2">
                  {forcedWorkspaceName ?? 'Current workspace'}
                </div>
              ) : (
                <select
                  value={workspaceId}
                  onChange={(e) => {
                    setWorkspaceId(e.target.value)
                    setLinkPersonId('')
                    setAutoMatched(false)
                  }}
                  className="flex-1 border border-border rounded-md px-2 py-1.5 text-xs bg-bg"
                >
                  <option value="">— No workspace assignment —</option>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={!workspaceId}
                className="border border-border rounded-md px-2 py-1.5 text-xs bg-bg disabled:opacity-50"
              >
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
                <option value="pic">PIC</option>
              </select>
            </div>

            {workspaceId && (
              <div className="mt-3">
                <label className="block text-[11px] font-medium text-text-2 mb-1.5">
                  Link to existing person record
                  {suggestedPerson && (
                    <span className="ml-1 text-text-3 font-normal">
                      · auto-matched
                      <i className="ti ti-sparkles text-info ml-0.5 text-[10px]" />
                    </span>
                  )}
                </label>
                {peopleLoading ? (
                  <div className="text-[11px] text-text-3">Loading people…</div>
                ) : linkCandidates.length === 0 ? (
                  <div className="text-[11px] text-text-3">
                    No unlinked person records in this workspace.
                  </div>
                ) : (
                  <select
                    value={linkPersonId}
                    onChange={(e) => handleLinkPersonChange(e.target.value)}
                    className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-bg"
                  >
                    <option value="">— Don&rsquo;t link to anyone —</option>
                    {linkCandidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.title ? ` · ${p.title}` : ''}
                        {p.department ? ` · ${p.department}` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-text-3 mt-1">
                  Required for PIC role — without a link, RLS can&rsquo;t
                  figure out which tasks are &ldquo;theirs.&rdquo;
                </p>
              </div>
            )}
          </div>

          {allowPromote && (
            <div className="border-t border-border pt-4">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={promoteSuperadmin}
                  onChange={(e) => setPromoteSuperadmin(e.target.checked)}
                  className="cursor-pointer"
                />
                <span className="text-text-2">
                  Also promote to superadmin
                </span>
              </label>
            </div>
          )}

          {error && <p className="text-xs text-danger-text">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 bg-surface-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {create.isPending
              ? 'Creating…'
              : sendInvite
                ? 'Send invite'
                : 'Create user'}
          </button>
        </div>
      </form>
    </div>
  )
}
