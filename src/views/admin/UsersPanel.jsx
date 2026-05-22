import { useAuth } from '../../auth/AuthProvider'
import {
  useAdminDemoteUser,
  useAdminPromoteUser,
  useAdminUsers,
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
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-medium">All users</h2>
        <p className="text-xs text-text-2 mt-0.5">
          {users.length} signed-up user{users.length === 1 ? '' : 's'}.
          Promote to superadmin gives full cross-tenant access.
        </p>
      </div>

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
