import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import {
  useAdminCreateUser,
  useAdminDemoteUser,
  useAdminPromoteUser,
  useAdminUsers,
  useAdminWorkspaces,
} from '../../lib/queries'
import { useToast } from '../../components/Toast'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function UsersPanel() {
  const { data: users = [], isLoading } = useAdminUsers()
  const { user: currentUser } = useAuth()
  const promote = useAdminPromoteUser()
  const demote = useAdminDemoteUser()
  const showToast = useToast()
  const [createOpen, setCreateOpen] = useState(false)

  async function handlePromote(u) {
    try {
      await promote.mutateAsync({ userId: u.id })
      showToast(`${u.email} is now a superadmin`)
    } catch {}
  }
  async function handleDemote(u) {
    if (!confirm(`Demote ${u.email} from superadmin?`)) return
    try {
      await demote.mutateAsync(u.id)
      showToast(`${u.email} demoted`)
    } catch {}
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-sm font-medium">All users</h2>
          <p className="text-xs text-text-2 mt-0.5">
            {users.length} signed-up user{users.length === 1 ? '' : 's'}.
            Promote to superadmin gives full cross-tenant access.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 inline-flex items-center gap-1.5"
        >
          <i className="ti ti-user-plus text-sm" />
          Create user
        </button>
      </div>

      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} />}

      {isLoading ? (
        <div className="p-8 text-center text-xs text-text-3">Loading…</div>
      ) : users.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-3">No users.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 text-text-2">
              <tr>
                <Th>Email</Th>
                <Th>Signed up</Th>
                <Th>Last sign-in</Th>
                <Th>Workspaces</Th>
                <Th>Role</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-border last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-2">
                    <div className="font-medium">{u.email}</div>
                    {u.id === currentUser?.id && (
                      <div className="text-[10px] text-text-3">you</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-text-2">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-2 text-text-2">{fmtDate(u.last_sign_in_at)}</td>
                  <td className="px-4 py-2">
                    {u.workspaces.length === 0 ? (
                      <span className="text-text-3 italic">none</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.workspaces.map((w) => (
                          <span
                            key={w.id}
                            className="text-[10px] px-1.5 py-px rounded bg-surface text-text-2 border border-border"
                            title={`role: ${w.role}`}
                          >
                            {w.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {u.is_superadmin ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-info-bg text-info-text font-medium">
                        Superadmin
                      </span>
                    ) : (
                      <span className="text-text-3 text-[10px]">User</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {u.is_superadmin ? (
                      <button
                        onClick={() => handleDemote(u)}
                        disabled={u.id === currentUser?.id}
                        className="text-text-2 hover:text-danger-text px-2 py-0.5 disabled:opacity-50"
                        title={u.id === currentUser?.id ? "Can't demote yourself" : ''}
                      >
                        Demote
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePromote(u)}
                        className="text-info hover:bg-info-bg/40 rounded px-2 py-0.5"
                      >
                        Promote
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Th({ children }) {
  return (
    <th className="px-4 py-2 text-[10px] uppercase tracking-wider font-medium border-b border-border text-left">
      {children}
    </th>
  )
}

function CreateUserModal({ onClose }) {
  const { data: workspaces = [] } = useAdminWorkspaces()
  const create = useAdminCreateUser()
  const showToast = useToast()

  const [email, setEmail] = useState('')
  const [sendInvite, setSendInvite] = useState(false)
  const [workspaceId, setWorkspaceId] = useState('')
  const [role, setRole] = useState('editor')
  const [promoteSuperadmin, setPromoteSuperadmin] = useState(false)
  const [error, setError] = useState(null)

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
        promoteSuperadmin,
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
              Workspace assignment (optional)
            </div>
            <div className="flex gap-2">
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className="flex-1 border border-border rounded-md px-2 py-1.5 text-xs bg-bg"
              >
                <option value="">— No workspace assignment —</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
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
          </div>

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
