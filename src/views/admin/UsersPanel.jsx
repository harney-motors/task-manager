import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import {
  useAdminDeleteUser,
  useAdminDemoteUser,
  useAdminPromoteUser,
  useAdminUsers,
} from '../../lib/queries'
import { useToast } from '../../components/Toast'
import CreateUserModal from '../../components/CreateUserModal'

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
  const remove = useAdminDeleteUser()
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

  async function handleDelete(u) {
    const wsLabel =
      u.workspaces.length > 0
        ? `\n\nThey are a member of: ${u.workspaces.map((w) => w.name).join(', ')}. Those memberships will be removed; their workspaces will remain.`
        : ''
    const contentLabel =
      `\n\nTheir created tasks, journal notes, and activity history will stay but lose attribution (shown as "Unknown" or unattributed).`
    if (
      !confirm(
        `Permanently delete ${u.email}?${wsLabel}${contentLabel}\n\nThis cannot be undone.`,
      )
    )
      return
    try {
      await remove.mutateAsync(u.id)
      showToast(`Deleted ${u.email}`)
    } catch {}
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 sm:px-4 py-3 sm:py-4 border-b border-border gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">All users</h2>
          <p className="text-[11px] sm:text-xs text-text-2 mt-0.5 truncate">
            {users.length} signed-up user{users.length === 1 ? '' : 's'}
            <span className="hidden sm:inline">. Promote to superadmin gives full cross-tenant access.</span>
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="text-xs px-2.5 sm:px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 active:scale-95 transition-transform inline-flex items-center gap-1 sm:gap-1.5 flex-shrink-0"
        >
          <i className="ti ti-user-plus text-sm" />
          <span className="hidden sm:inline">Create user</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} />}

      {isLoading ? (
        <div className="p-8 text-center text-xs text-text-3">Loading…</div>
      ) : users.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-3">No users.</div>
      ) : (
        <>
          {/* Desktop: table layout */}
          <div className="hidden sm:block overflow-x-auto">
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
                      <button
                        onClick={() => handleDelete(u)}
                        disabled={u.id === currentUser?.id}
                        className="text-text-3 hover:text-danger-text hover:bg-danger-bg rounded px-2 py-0.5 ml-1 disabled:opacity-50"
                        title={
                          u.id === currentUser?.id
                            ? "Can't delete yourself"
                            : 'Permanently delete this user'
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards */}
          <div className="sm:hidden divide-y divide-border">
            {users.map((u) => {
              const isMe = u.id === currentUser?.id
              return (
                <div key={u.id} className="px-3 py-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.email}</div>
                      <div className="text-[10px] text-text-3 mt-0.5">
                        {isMe && 'you · '}
                        joined {fmtDate(u.created_at)}
                        {u.last_sign_in_at && ` · last in ${fmtDate(u.last_sign_in_at)}`}
                      </div>
                    </div>
                    {u.is_superadmin && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-info-bg text-info-text font-medium flex-shrink-0">
                        Superadmin
                      </span>
                    )}
                  </div>
                  {u.workspaces.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {u.workspaces.map((w) => (
                        <span
                          key={w.id}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-2 border border-border max-w-[120px] truncate"
                          title={`role: ${w.role}`}
                        >
                          {w.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {u.is_superadmin ? (
                      <button
                        onClick={() => handleDemote(u)}
                        disabled={isMe}
                        className="flex-1 min-h-[36px] text-xs px-3 rounded-md border border-border text-text-2 hover:text-danger-text active:bg-surface-2 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                        title={isMe ? "Can't demote yourself" : ''}
                      >
                        <i className="ti ti-arrow-down text-sm" />
                        Demote
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePromote(u)}
                        className="flex-1 min-h-[36px] text-xs px-3 rounded-md border border-info text-info active:bg-info-bg/40 inline-flex items-center justify-center gap-1.5"
                      >
                        <i className="ti ti-arrow-up text-sm" />
                        Promote
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(u)}
                      disabled={isMe}
                      className="min-h-[36px] text-xs px-3 rounded-md text-danger-text border border-danger-bg active:bg-danger-bg/30 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                      title={isMe ? "Can't delete yourself" : 'Permanently delete'}
                      aria-label="Delete user"
                    >
                      <i className="ti ti-trash text-sm" />
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
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

