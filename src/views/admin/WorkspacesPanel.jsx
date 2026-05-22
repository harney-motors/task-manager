import { useState } from 'react'
import {
  useAdminAddMember,
  useAdminCreateWorkspace,
  useAdminDeleteWorkspace,
  useAdminRemoveMember,
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

export default function WorkspacesPanel() {
  const { data: workspaces = [], isLoading } = useAdminWorkspaces()
  const [createOpen, setCreateOpen] = useState(false)
  const [membersFor, setMembersFor] = useState(null) // workspace row

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-sm font-medium">All workspaces</h2>
          <p className="text-xs text-text-2 mt-0.5">
            {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'} across this Tickd deployment.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 inline-flex items-center gap-1.5"
        >
          <i className="ti ti-plus text-sm" />
          Create workspace
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-text-3">Loading…</div>
      ) : workspaces.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-3">No workspaces yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 text-text-2">
              <tr>
                <Th>Name</Th>
                <Th>Created</Th>
                <Th align="right">Members</Th>
                <Th align="right">People</Th>
                <Th align="right">Tasks</Th>
                <Th>Last activity</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((w) => (
                <WorkspaceRow
                  key={w.id}
                  workspace={w}
                  onManageMembers={() => setMembersFor(w)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && <CreateWorkspaceModal onClose={() => setCreateOpen(false)} />}
      {membersFor && (
        <MembersModal workspace={membersFor} onClose={() => setMembersFor(null)} />
      )}
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th
      className={`px-4 py-2 text-[10px] uppercase tracking-wider font-medium border-b border-border ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function WorkspaceRow({ workspace: w, onManageMembers }) {
  const showToast = useToast()
  const remove = useAdminDeleteWorkspace()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (
      !confirm(
        `Delete "${w.name}" and ALL its tasks, members, people, departments? This cannot be undone.`,
      )
    )
      return
    setDeleting(true)
    try {
      await remove.mutateAsync(w.id)
      showToast(`Deleted "${w.name}"`)
    } catch {
      // toast handled by hook
    } finally {
      setDeleting(false)
    }
  }

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface-2">
      <td className="px-4 py-2 font-medium">{w.name}</td>
      <td className="px-4 py-2 text-text-2">{fmtDate(w.created_at)}</td>
      <td className="px-4 py-2 text-right">{w.member_count}</td>
      <td className="px-4 py-2 text-right">{w.people_count}</td>
      <td className="px-4 py-2 text-right">{w.task_count}</td>
      <td className="px-4 py-2 text-text-2">
        {w.last_activity ? fmtDate(w.last_activity) : '—'}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <button
          onClick={onManageMembers}
          className="text-text-2 hover:text-text px-2 py-0.5"
        >
          Members
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-danger-text hover:bg-danger-bg rounded px-2 py-0.5 disabled:opacity-50"
        >
          Delete
        </button>
      </td>
    </tr>
  )
}

function CreateWorkspaceModal({ onClose }) {
  const { data: users = [], isLoading } = useAdminUsers()
  const create = useAdminCreateWorkspace()
  const showToast = useToast()
  const [name, setName] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !ownerId) {
      setError('Name and owner are required.')
      return
    }
    try {
      const id = await create.mutateAsync({ name: name.trim(), ownerId })
      showToast(`Created "${name.trim()}"`)
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
          <div className="text-sm font-medium">Create workspace</div>
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
              Workspace name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              autoFocus
              className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-info bg-bg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-2 mb-1.5">
              Owner
            </label>
            {isLoading ? (
              <div className="text-xs text-text-3">Loading users…</div>
            ) : (
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-bg cursor-pointer"
              >
                <option value="">— Select an owner —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-text-3 mt-1">
              They become the workspace owner immediately. They can sign in
              right after and see it. People + departments are not seeded — run
              the per-customer seed SQL separately if you want a starter set.
            </p>
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
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}

function MembersModal({ workspace, onClose }) {
  const { data: users = [] } = useAdminUsers()
  const add = useAdminAddMember()
  const remove = useAdminRemoveMember()
  const showToast = useToast()
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState('editor')

  const members = users
    .map((u) => {
      const membership = u.workspaces.find((w) => w.id === workspace.id)
      return membership ? { user: u, role: membership.role } : null
    })
    .filter(Boolean)

  const candidates = users.filter((u) => !u.workspaces.some((w) => w.id === workspace.id))

  async function handleAdd() {
    if (!addUserId) return
    try {
      await add.mutateAsync({ workspaceId: workspace.id, userId: addUserId, role: addRole })
      setAddUserId('')
      showToast('Member added')
    } catch {}
  }

  async function handleRemove(userId) {
    if (!confirm('Remove this member?')) return
    try {
      await remove.mutateAsync({ workspaceId: workspace.id, userId })
      showToast('Member removed')
    } catch {}
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="text-sm font-medium">Members of {workspace.name}</div>
            <div className="text-[11px] text-text-3 mt-0.5">{members.length} member{members.length === 1 ? '' : 's'}</div>
          </div>
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text p-1 rounded hover:bg-surface-2"
          >
            <i className="ti ti-x text-sm" />
          </button>
        </div>
        <div className="p-4">
          <div className="space-y-1.5 mb-4">
            {members.map((m) => (
              <div
                key={m.user.id}
                className="flex items-center justify-between px-3 py-2 rounded border border-border"
              >
                <div className="text-xs">
                  <div className="font-medium">{m.user.email}</div>
                  <div className="text-text-3 capitalize">{m.role}</div>
                </div>
                <button
                  onClick={() => handleRemove(m.user.id)}
                  className="text-[11px] text-danger-text hover:bg-danger-bg rounded px-2 py-1"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-4 space-y-2">
            <div className="text-xs font-medium text-text-2">Add a member</div>
            <div className="flex gap-2">
              <select
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                className="flex-1 border border-border rounded-md px-2 py-1.5 text-xs bg-bg"
              >
                <option value="">— Pick a user —</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                className="border border-border rounded-md px-2 py-1.5 text-xs bg-bg"
              >
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
              </select>
              <button
                onClick={handleAdd}
                disabled={!addUserId || add.isPending}
                className="text-xs px-3 py-1 rounded bg-info text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
