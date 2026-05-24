import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  useAdminUnlinkPerson,
  useAdminUsers,
  useDeactivatePerson,
  useDeleteDepartment,
  useDeletePerson,
  useDepartments,
  useIsSuperadmin,
  usePeople,
  useReactivatePerson,
  useTasks,
} from '../lib/queries'
import { useToast } from '../components/Toast'
import { picDot } from '../lib/colors'
import { useTheme } from '../lib/useTheme'
import PersonModal from '../components/PersonModal'
import DepartmentModal from '../components/DepartmentModal'
import LinkPersonModal from '../components/LinkPersonModal'
import PushSettings from '../components/PushSettings'
import Skeleton from '../components/Skeleton'
import {
  calendarFeedUrl,
  createCalendarToken,
  fetchCalendarToken,
  revokeCalendarToken,
  rotateCalendarToken,
  webcalFeedUrl,
} from '../api/calendarFeed'

const TABS = [
  { id: 'people',      label: 'People',      icon: 'ti-users',    minRole: 'editor' },
  { id: 'departments', label: 'Departments', icon: 'ti-building', minRole: 'editor' },
  { id: 'calendar',    label: 'Calendar',    icon: 'ti-calendar' },
  { id: 'profile',     label: 'My profile',  icon: 'ti-user' },
]

// PICs (read-mostly users) shouldn't see workspace-admin tabs. We
// gate by the active workspace's role — non-PIC roles see everything.
function tabsForRole(role) {
  if (role === 'pic') return TABS.filter((t) => !t.minRole)
  return TABS
}

export default function SettingsView({ onBack }) {
  const { workspace } = useAuth()
  const tabs = tabsForRole(workspace?.role)
  const [tab, setTab] = useState(tabs[0]?.id ?? 'profile')

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      {/* Sticky header — back button + title + tab strip all stay
          accessible while you scroll the panel body underneath. */}
      <header
        className="sticky top-0 z-30 bg-bg/85 backdrop-blur-xl border-b border-border/60"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto max-w-4xl px-3 sm:px-6 py-2 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-full inline-flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors flex-shrink-0"
              aria-label="Back"
            >
              <i className="ti ti-arrow-left text-base" />
            </button>
            <h1 className="text-base sm:text-xl font-medium tracking-tight">
              Settings
            </h1>
          </div>

          <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex items-center gap-1 p-1 bg-surface-2 rounded-lg">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 text-xs rounded-md inline-flex items-center gap-1.5 whitespace-nowrap transition-colors active:scale-95 ${
                    tab === t.id
                      ? 'bg-surface text-text font-medium shadow-sm'
                      : 'text-text-2 hover:text-text'
                  }`}
                >
                  <i className={`ti ${t.icon} text-sm`} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-3 sm:px-6 py-4 sm:py-6">
        {tab === 'people' && <PeoplePanel />}
        {tab === 'departments' && <DepartmentsPanel />}
        {tab === 'calendar' && <CalendarSyncPanel />}
        {tab === 'profile' && <ProfilePanel />}
      </div>
    </div>
  )
}

// ============================================================
// People
// ============================================================

function PeoplePanel() {
  const [showInactive, setShowInactive] = useState(false)
  const { data: people = [], isLoading } = usePeople({ includeInactive: showInactive })
  const { data: tasks = [] } = useTasks()
  const { data: isSuperadmin = false } = useIsSuperadmin()
  // Pull users so we can show "Linked · <email>" labels. The query
  // is RLS-gated (superadmin only via get_all_users RPC), so for
  // non-superadmins this returns [] and the label falls back to a
  // generic "Linked" pill — no crash, no leak.
  const { data: adminUsers = [] } = useAdminUsers()
  const usersById = useMemo(() => {
    const m = new Map()
    for (const u of adminUsers) m.set(u.id, u)
    return m
  }, [adminUsers])
  const deactivate = useDeactivatePerson()
  const reactivate = useReactivatePerson()
  const remove = useDeletePerson()
  const unlinkPerson = useAdminUnlinkPerson()
  const showToast = useToast()
  const [editing, setEditing] = useState(null)
  const [linking, setLinking] = useState(null) // person being linked
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  // Compute task involvement per person (PIC + watcher)
  const involvementMap = useMemo(() => {
    const picCount = new Map()
    const watchCount = new Map()
    for (const t of tasks) {
      if (t.pic_id) picCount.set(t.pic_id, (picCount.get(t.pic_id) ?? 0) + 1)
      for (const w of t.watchers ?? []) {
        watchCount.set(w.id, (watchCount.get(w.id) ?? 0) + 1)
      }
    }
    return { picCount, watchCount }
  }, [tasks])

  const visiblePeople = people
  const visibleIds = visiblePeople.map((p) => p.id)
  const visibleSelectedCount = visibleIds.filter((id) => selectedIds.has(id)).length
  const allVisibleSelected =
    visiblePeople.length > 0 && visibleSelectedCount === visiblePeople.length

  function toggleAll() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        for (const id of visibleIds) next.delete(id)
        return next
      }
      const next = new Set(prev)
      for (const id of visibleIds) next.add(id)
      return next
    })
  }

  function toggle(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function runBulk(mutationFn, label) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const results = await Promise.allSettled(
      ids.map(
        (id) =>
          new Promise((resolve, reject) =>
            mutationFn.mutate(id, { onSuccess: resolve, onError: reject }),
          ),
      ),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - ok
    if (failed === 0) {
      showToast(`${label} on ${ok} person${ok === 1 ? '' : 's'}`)
    } else {
      showToast(`${label}: ${ok} ok, ${failed} failed`, { type: 'error' })
    }
    clearSelection()
  }

  async function handleBulkDeactivate() {
    await runBulk(deactivate, 'Deactivated')
  }
  async function handleBulkReactivate() {
    await runBulk(reactivate, 'Reactivated')
  }
  async function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (
      !confirm(
        `Permanently delete ${ids.length} person${ids.length === 1 ? '' : 's'}? ` +
          `Tasks they were assigned to will become unassigned. This cannot be undone.`,
      )
    )
      return
    await runBulk(remove, 'Deleted')
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-medium">People</h2>
          <p className="text-xs text-text-2 mt-0.5">
            {visiblePeople.length} {showInactive ? 'total' : 'active'} ·
            PICs receive tasks. &quot;Unused&quot; means no current tasks and no
            watches.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-text-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="cursor-pointer"
            />
            Show inactive
          </label>
          <button
            onClick={() => setEditing('new')}
            className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 inline-flex items-center gap-1.5"
          >
            <i className="ti ti-plus text-sm" />
            Add person
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-info text-white px-4 py-2 flex items-center gap-2 flex-wrap text-xs">
          <span className="font-medium">{selectedIds.size} selected</span>
          <button
            onClick={clearSelection}
            className="underline opacity-90 hover:opacity-100"
          >
            Clear
          </button>
          <div className="flex-1" />
          {showInactive && (
            <button
              onClick={handleBulkReactivate}
              className="bg-white/15 hover:bg-white/25 rounded px-2 py-1 border border-white/30"
            >
              Reactivate
            </button>
          )}
          <button
            onClick={handleBulkDeactivate}
            className="bg-white/15 hover:bg-white/25 rounded px-2 py-1 border border-white/30"
          >
            Deactivate
          </button>
          <button
            onClick={handleBulkDelete}
            className="bg-danger-text/30 hover:bg-danger-text/50 rounded px-2 py-1 border border-white/30 font-medium"
          >
            Delete permanently
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="px-4 py-4">
          <Skeleton rows={6} height={48} />
        </div>
      ) : visiblePeople.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-3">
          {showInactive ? 'No people.' : 'No active people.'}
        </div>
      ) : (
        <div>
          {visiblePeople.length > 1 && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface-2 text-[11px] text-text-2">
              <input
                type="checkbox"
                ref={(el) => {
                  if (el) {
                    el.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected
                  }
                }}
                checked={allVisibleSelected}
                onChange={toggleAll}
                className="cursor-pointer"
                aria-label="Select all"
              />
              <span>Select all visible</span>
            </div>
          )}
          {visiblePeople.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              picCount={involvementMap.picCount.get(p.id) ?? 0}
              watchCount={involvementMap.watchCount.get(p.id) ?? 0}
              linkedUserEmail={
                p.user_id ? usersById.get(p.user_id)?.email ?? null : null
              }
              canManageLinks={isSuperadmin}
              onLink={() => setLinking(p)}
              onUnlink={() => {
                if (confirm(`Unlink ${p.name} from their user account?`)) {
                  unlinkPerson.mutate(p.id)
                }
              }}
              isSelected={selectedIds.has(p.id)}
              onToggleSelect={() => toggle(p.id)}
              onEdit={() => setEditing(p)}
              onDeactivate={deactivate}
              onReactivate={reactivate}
              onDelete={remove}
            />
          ))}
        </div>
      )}

      {editing && (
        <PersonModal
          person={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {linking && (
        <LinkPersonModal person={linking} onClose={() => setLinking(null)} />
      )}
    </div>
  )
}

function PersonRow({
  person: p,
  picCount,
  watchCount,
  linkedUserEmail,
  canManageLinks,
  onLink,
  onUnlink,
  isSelected,
  onToggleSelect,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
}) {
  const totalInvolvement = picCount + watchCount
  const isActive = p.is_active !== false
  const isUnused = isActive && totalInvolvement === 0

  function handleDeactivate() {
    if (
      confirm(
        `Deactivate ${p.name}? They won't appear in PIC dropdowns until reactivated.`,
      )
    ) {
      onDeactivate.mutate(p.id)
    }
  }
  function handleDelete() {
    const taskWarning =
      picCount > 0
        ? ` They are the PIC on ${picCount} task${picCount === 1 ? '' : 's'} (those will become unassigned).`
        : ''
    if (
      confirm(
        `Permanently delete ${p.name}?${taskWarning} This cannot be undone.`,
      )
    ) {
      onDelete.mutate(p.id)
    }
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 transition-colors ${
        isSelected ? 'bg-info-bg/60' : 'hover:bg-surface-2'
      } ${!isActive ? 'opacity-60' : ''}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className="cursor-pointer flex-shrink-0"
        aria-label={`Select ${p.name}`}
      />
      <span
        className={`w-2.5 h-2.5 rounded-full ${picDot(p.color)} flex-shrink-0`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{p.name}</span>
          {!isActive && (
            <span className="text-[10px] px-1.5 py-px rounded bg-surface-3 text-text-3 uppercase tracking-wider">
              Inactive
            </span>
          )}
          {isUnused && (
            <span className="text-[10px] px-1.5 py-px rounded bg-warning-bg text-warning-text">
              Unused
            </span>
          )}
          {p.user_id && (
            <span
              className="text-[10px] px-1.5 py-px rounded bg-info-bg text-info-text inline-flex items-center gap-1"
              title={linkedUserEmail ?? 'Linked to a user account'}
            >
              <i className="ti ti-link text-[10px]" />
              {linkedUserEmail ?? 'Linked'}
            </span>
          )}
        </div>
        <div className="text-xs text-text-2 truncate flex items-center gap-2 mt-0.5">
          <span>
            {p.title || '—'}
            {p.department && ` · ${p.department}`}
            {' · '}
            {p.role === 'pic' ? 'PIC' : p.role}
          </span>
          {picCount > 0 && (
            <span className="text-text-3">
              · {picCount} task{picCount === 1 ? '' : 's'}
            </span>
          )}
          {watchCount > 0 && (
            <span className="text-text-3">· watching {watchCount}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {canManageLinks &&
          (p.user_id ? (
            <button
              onClick={onUnlink}
              className="text-xs px-2 py-1 rounded text-text-3 hover:text-text hover:bg-surface inline-flex items-center gap-1"
              title="Unlink from user account"
            >
              <i className="ti ti-unlink text-sm" />
              Unlink
            </button>
          ) : (
            <button
              onClick={onLink}
              className="text-xs px-2 py-1 rounded text-info hover:bg-info-bg/40 inline-flex items-center gap-1"
              title="Link to an existing user account"
            >
              <i className="ti ti-link text-sm" />
              Link
            </button>
          ))}
        <button
          onClick={onEdit}
          className="text-xs px-2 py-1 rounded hover:bg-surface text-text-2 hover:text-text"
        >
          Edit
        </button>
        {isActive ? (
          <button
            onClick={handleDeactivate}
            className="text-xs px-2 py-1 rounded text-text-3 hover:text-text hover:bg-surface"
            title="Soft-hide from dropdowns"
          >
            Deactivate
          </button>
        ) : (
          <button
            onClick={() => onReactivate.mutate(p.id)}
            className="text-xs px-2 py-1 rounded text-info hover:bg-info-bg/40"
          >
            Reactivate
          </button>
        )}
        <button
          onClick={handleDelete}
          className="text-xs px-2 py-1 rounded text-text-3 hover:text-danger-text hover:bg-danger-bg"
          title="Permanently delete (unassigns their tasks)"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Departments
// ============================================================

function DepartmentsPanel() {
  const { data: departments = [], isLoading } = useDepartments()
  const { data: tasks = [] } = useTasks()
  const remove = useDeleteDepartment()
  const [editing, setEditing] = useState(null)

  const usageMap = useMemo(() => {
    const m = new Map()
    for (const t of tasks) {
      if (t.department_id) m.set(t.department_id, (m.get(t.department_id) ?? 0) + 1)
    }
    return m
  }, [tasks])

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-sm font-medium">Departments</h2>
          <p className="text-xs text-text-2 mt-0.5">
            {departments.length} department{departments.length === 1 ? '' : 's'} ·
            Deleting one unassigns its tasks.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 inline-flex items-center gap-1.5"
        >
          <i className="ti ti-plus text-sm" />
          Add department
        </button>
      </div>

      {isLoading ? (
        <div className="px-4 py-4">
          <Skeleton rows={4} height={48} />
        </div>
      ) : departments.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-3">
          No departments yet. Add the first one.
        </div>
      ) : (
        <div>
          {departments.map((d) => {
            const count = usageMap.get(d.id) ?? 0
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${picDot(d.color)} flex-shrink-0`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {d.name}
                    {count === 0 && (
                      <span className="text-[10px] px-1.5 py-px rounded bg-warning-bg text-warning-text">
                        Unused
                      </span>
                    )}
                  </div>
                  {count > 0 && (
                    <div className="text-[11px] text-text-3 mt-0.5">
                      {count} task{count === 1 ? '' : 's'} assigned
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(d)}
                    className="text-xs px-2 py-1 rounded hover:bg-surface text-text-2 hover:text-text"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Delete "${d.name}"? ${count > 0 ? `${count} task${count === 1 ? '' : 's'} will become unassigned.` : ''}`,
                        )
                      ) {
                        remove.mutate(d.id)
                      }
                    }}
                    className="text-xs px-2 py-1 rounded text-text-3 hover:text-danger-text hover:bg-danger-bg"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <DepartmentModal
          department={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ============================================================
// Calendar sync
// ============================================================

function CalendarSyncPanel() {
  const { workspace, workspaces } = useAuth()
  return (
    <div className="space-y-3">
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium">Calendar sync</h2>
        <p className="text-xs text-text-2 mt-1 leading-relaxed">
          Subscribe to your tasks in Apple Calendar, Google Calendar, or
          Outlook. Tasks with a due date show as all-day events; your
          calendar app refreshes the feed automatically every ~hour.
          Each workspace gets its own subscription URL so you can
          add only the ones you want to see.
        </p>
      </div>
      {workspaces.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-5 text-xs text-text-3">
          You aren&rsquo;t a member of any workspace yet.
        </div>
      ) : (
        workspaces.map((w) => (
          <WorkspaceCalendarRow
            key={w.id}
            workspace={w}
            isActive={w.id === workspace?.id}
          />
        ))
      )}
    </div>
  )
}

function WorkspaceCalendarRow({ workspace, isActive }) {
  const showToast = useToast()
  const [tokenRow, setTokenRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchCalendarToken(workspace.id)
      .then((row) => {
        if (!cancelled) setTokenRow(row)
      })
      .catch(() => {
        if (!cancelled) setTokenRow(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspace.id])

  async function handleEnable() {
    setBusy(true)
    try {
      const row = await createCalendarToken(workspace.id)
      setTokenRow(row)
      showToast('Subscription enabled.')
    } catch (err) {
      showToast(err.message ?? 'Could not enable subscription', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleRotate() {
    if (
      !confirm(
        `Rotate the subscription URL for "${workspace.name}"? The old URL will stop working immediately and you'll need to re-add the new one in your calendar app.`,
      )
    )
      return
    setBusy(true)
    try {
      const row = await rotateCalendarToken(workspace.id)
      setTokenRow(row)
      showToast('Subscription URL rotated.')
    } catch (err) {
      showToast(err.message ?? 'Could not rotate', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke() {
    if (
      !confirm(
        `Disable calendar sync for "${workspace.name}"? Your calendar app will stop seeing updates on the next refresh.`,
      )
    )
      return
    setBusy(true)
    try {
      await revokeCalendarToken(workspace.id)
      setTokenRow(null)
      showToast('Subscription disabled.')
    } catch (err) {
      showToast(err.message ?? 'Could not disable', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  function handleCopy() {
    if (!tokenRow) return
    navigator.clipboard.writeText(calendarFeedUrl(tokenRow.token)).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => showToast('Copy failed — long-press the URL to copy', { type: 'error' }),
    )
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-medium">{workspace.name}</h3>
        {isActive && (
          <span className="text-[10px] uppercase tracking-wider text-text-3 bg-surface-2 rounded px-1.5 py-0.5">
            Active
          </span>
        )}
        <span className="text-[10px] uppercase tracking-wider text-text-3">
          {workspace.role}
        </span>
      </div>

      {loading ? (
        <div className="text-xs text-text-3 mt-3">Loading…</div>
      ) : !tokenRow ? (
        <div className="mt-3">
          <p className="text-xs text-text-2 mb-3">
            Not subscribed yet. Enable to get a private URL you can paste
            into your calendar app.
          </p>
          <button
            onClick={handleEnable}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <i className="ti ti-calendar-plus text-sm" />
            Enable subscription
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-3 mb-1">
              Subscription URL
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <code className="text-[11px] bg-surface-2 border border-border rounded px-2 py-1 break-all font-mono flex-1 min-w-0">
                {calendarFeedUrl(tokenRow.token)}
              </code>
              <button
                onClick={handleCopy}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-surface-2 text-text-2 hover:text-text inline-flex items-center gap-1"
              >
                <i className={`ti ${copied ? 'ti-check' : 'ti-copy'} text-sm`} />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <a
              href={webcalFeedUrl(tokenRow.token)}
              className="text-[11px] text-info hover:underline mt-1 inline-flex items-center gap-1"
            >
              <i className="ti ti-external-link text-xs" />
              Open in Apple Calendar (webcal://)
            </a>
          </div>

          <details className="text-xs text-text-2">
            <summary className="cursor-pointer hover:text-text">
              How to subscribe
            </summary>
            <div className="mt-2 space-y-2 pl-3 border-l-2 border-border">
              <div>
                <span className="font-medium text-text">iPhone / iPad:</span>{' '}
                Settings → Calendar → Accounts → Add Account → Other → Add
                Subscribed Calendar → paste URL.
              </div>
              <div>
                <span className="font-medium text-text">Mac (Calendar app):</span>{' '}
                File → New Calendar Subscription → paste URL → set
                auto-refresh to Every hour.
              </div>
              <div>
                <span className="font-medium text-text">Google Calendar:</span>{' '}
                Settings → Add calendar → From URL → paste URL.
              </div>
              <div>
                <span className="font-medium text-text">Outlook:</span> Add
                calendar → Subscribe from web → paste URL.
              </div>
            </div>
          </details>

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <button
              onClick={handleRotate}
              disabled={busy}
              className="text-xs px-2.5 py-1 rounded border border-border hover:bg-surface-2 text-text-2 hover:text-text disabled:opacity-50"
              title="Replace this URL with a new one. Old URL stops working immediately."
            >
              Rotate URL
            </button>
            <button
              onClick={handleRevoke}
              disabled={busy}
              className="text-xs px-2.5 py-1 rounded text-text-3 hover:text-danger-text hover:bg-danger-bg disabled:opacity-50"
            >
              Disable
            </button>
            <span className="text-[11px] text-text-3 ml-auto">
              {tokenRow.last_accessed_at
                ? `Last fetched ${formatRelativeTime(tokenRow.last_accessed_at)}`
                : 'Never fetched yet'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function formatRelativeTime(iso) {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const sec = Math.round((now - then) / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  return `${day}d ago`
}

// ============================================================
// Profile
// ============================================================

function ProfilePanel() {
  const { user, workspace, signOut } = useAuth()
  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
        <div>
          <div className="text-xs text-text-2 mb-1">Signed in as</div>
          <div className="text-sm font-medium">{user.email}</div>
        </div>
        <div>
          <div className="text-xs text-text-2 mb-1">Workspace</div>
          <div className="text-sm font-medium">{workspace?.name ?? '—'}</div>
        </div>
        <ThemeSetting />
        <div className="pt-3 border-t border-border">
          <button
            onClick={signOut}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface-2 text-text-2 hover:text-text inline-flex items-center gap-1.5"
          >
            <i className="ti ti-logout text-sm" />
            Sign out
          </button>
        </div>
      </div>
      <PushSettings />
    </div>
  )
}

function ThemeSetting() {
  const { preference, setPreference, resolved } = useTheme()
  const options = [
    { id: 'light',  label: 'Light',  icon: 'ti-sun' },
    { id: 'dark',   label: 'Dark',   icon: 'ti-moon' },
    { id: 'system', label: 'System', icon: 'ti-device-laptop' },
  ]
  return (
    <div className="pt-3 border-t border-border">
      <div className="text-xs text-text-2 mb-2">Appearance</div>
      <div className="inline-flex p-0.5 bg-surface-2 rounded-md">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setPreference(opt.id)}
            className={`text-xs px-3 py-1.5 rounded inline-flex items-center gap-1.5 ${
              preference === opt.id
                ? 'bg-surface text-text font-medium shadow-sm'
                : 'text-text-2 hover:text-text'
            }`}
          >
            <i className={`ti ${opt.icon} text-sm`} />
            {opt.label}
          </button>
        ))}
      </div>
      {preference === 'system' && (
        <div className="text-[11px] text-text-3 mt-1.5">
          Following your device — currently {resolved}.
        </div>
      )}
    </div>
  )
}
