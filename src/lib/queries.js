import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { useToast } from '../components/Toast'
import { createTask, fetchTasks, updateTask, deleteTask } from '../api/tasks'
import { addWatcher, removeWatcher } from '../api/watchers'
import { fetchJournalEntries, createJournalEntry } from '../api/journal'
import { fetchRecentActivity } from '../api/activity'
import { notifyTaskEvent } from '../api/notify'
import { fetchActiveNudges, dismissNudge } from '../api/nudges'
import {
  createSavedCommand,
  deleteSavedCommand,
  fetchSavedCommands,
} from '../api/savedCommands'
import {
  addDependency,
  fetchTaskDependencies,
  fetchWorkspaceBlockerMap,
  removeDependency,
} from '../api/dependencies'
import {
  createSavedFilter,
  deleteSavedFilter,
  fetchSavedFilters,
} from '../api/savedFilters'
import {
  adminAddMember,
  adminCreateUser,
  adminCreateWorkspace,
  adminDeleteUser,
  adminDeleteWorkspace,
  adminDemoteUser,
  adminLinkPerson,
  adminPromoteUser,
  adminRemoveMember,
  adminUnlinkPerson,
  fetchAdminActivity,
  fetchAdminSystemStats,
  fetchAdminUsers,
  fetchAdminWorkspaces,
} from '../api/admin'
import { supabase } from './supabase'
import {
  createPerson,
  deactivatePerson,
  deletePerson,
  fetchPeople,
  reactivatePerson,
  updatePerson,
} from '../api/people'
import {
  createDepartment,
  deleteDepartment,
  fetchDepartments,
  updateDepartment,
} from '../api/departments'
import { logActivity } from '../api/activity'

function errMsg(err, fallback) {
  return err?.message ?? fallback
}

export const queryKeys = {
  tasks:         (workspaceId) => ['tasks', workspaceId],
  people:        (workspaceId) => ['people', workspaceId],
  departments:   (workspaceId) => ['departments', workspaceId],
  journal:       (taskId)      => ['journal', taskId],
  activity:      (workspaceId, limit) => ['activity', workspaceId, limit],
  savedFilters:  (workspaceId) => ['savedFilters', workspaceId],
  nudges:        (workspaceId) => ['nudges', workspaceId],
  savedCommands: (workspaceId) => ['savedCommands', workspaceId],
  taskDeps:      (taskId)      => ['taskDeps', taskId],
  workspaceBlockers: (workspaceId) => ['workspaceBlockers', workspaceId],
}

// ---------- Dependencies ----------

export function useTaskDependencies(taskId) {
  return useQuery({
    queryKey: queryKeys.taskDeps(taskId),
    queryFn: () => fetchTaskDependencies(taskId),
    enabled: !!taskId && !String(taskId).startsWith('temp-'),
  })
}

export function useWorkspaceBlockerMap() {
  const { workspace } = useAuth()
  return useQuery({
    queryKey: queryKeys.workspaceBlockers(workspace?.id),
    queryFn: () => fetchWorkspaceBlockerMap(workspace.id),
    enabled: !!workspace,
    // Refresh whenever tasks change (cheap — single table scan).
    staleTime: 30 * 1000,
  })
}

export function useAddDependency() {
  const { workspace } = useAuth()
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: ({ blockerId, blockedId }) =>
      addDependency(blockerId, blockedId),
    onError: (err) =>
      showToast(errMsg(err, 'Could not add dependency'), { type: 'error' }),
    onSettled: (_d, _e, { blockerId, blockedId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.taskDeps(blockerId) })
      qc.invalidateQueries({ queryKey: queryKeys.taskDeps(blockedId) })
      qc.invalidateQueries({
        queryKey: queryKeys.workspaceBlockers(workspace?.id),
      })
    },
  })
}

export function useRemoveDependency() {
  const { workspace } = useAuth()
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: ({ blockerId, blockedId }) =>
      removeDependency(blockerId, blockedId),
    onError: (err) =>
      showToast(errMsg(err, 'Could not remove dependency'), { type: 'error' }),
    onSettled: (_d, _e, { blockerId, blockedId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.taskDeps(blockerId) })
      qc.invalidateQueries({ queryKey: queryKeys.taskDeps(blockedId) })
      qc.invalidateQueries({
        queryKey: queryKeys.workspaceBlockers(workspace?.id),
      })
    },
  })
}

// ---------- Saved AI commands (automations) ----------

export function useSavedCommands() {
  const { workspace } = useAuth()
  return useQuery({
    queryKey: queryKeys.savedCommands(workspace?.id),
    queryFn: () => fetchSavedCommands(workspace?.id),
    enabled: !!workspace,
  })
}

export function useCreateSavedCommand() {
  const { workspace } = useAuth()
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: ({ name, plan, scopeWorkspace }) =>
      createSavedCommand({
        name,
        plan,
        workspaceId: scopeWorkspace ? workspace?.id : null,
      }),
    onError: (err) =>
      showToast(errMsg(err, 'Could not save automation'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.savedCommands(workspace?.id) }),
  })
}

export function useDeleteSavedCommand() {
  const { workspace } = useAuth()
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: (id) => deleteSavedCommand(id),
    onError: (err) =>
      showToast(errMsg(err, 'Could not delete automation'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.savedCommands(workspace?.id) }),
  })
}

export function useActiveNudges() {
  const { workspace } = useAuth()
  return useQuery({
    queryKey: queryKeys.nudges(workspace?.id),
    queryFn: () => fetchActiveNudges(workspace.id),
    enabled: !!workspace,
    // Refetch every 5 minutes so a scheduled run that lands while
    // someone's already on Today surfaces without a manual refresh.
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  })
}

export function useDismissNudge() {
  const { workspace } = useAuth()
  const qc = useQueryClient()
  const key = queryKeys.nudges(workspace?.id)
  return useMutation({
    mutationFn: (id) => dismissNudge(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      qc.setQueryData(key, (old) => (old ?? []).filter((n) => n.id !== id))
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

// ---------- Tasks ----------

export function useTasks() {
  const { workspace } = useAuth()
  return useQuery({
    queryKey: queryKeys.tasks(workspace?.id),
    queryFn: () => fetchTasks(workspace.id),
    enabled: !!workspace,
  })
}

export function useCreateTask() {
  const { workspace, user } = useAuth()
  const { data: people = [] } = usePeople()
  const showToast = useToast()
  const qc = useQueryClient()
  const key = queryKeys.tasks(workspace?.id)

  return useMutation({
    mutationFn: (fields) => createTask(workspace.id, fields),
    onMutate: async (fields) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      const pic = fields.pic_id ? people.find((p) => p.id === fields.pic_id) : null
      const optimistic = {
        id: `temp-${Date.now()}`,
        task_number: null,
        title: fields.title,
        notes: null,
        status: fields.status ?? 'Open',
        priority: fields.priority ?? 'Medium',
        start_date: fields.start_date ?? null,
        due_date: fields.due_date ?? null,
        tags: fields.tags ?? [],
        source: fields.source ?? 'Quick entry',
        workspace_id: workspace.id,
        pic_id: fields.pic_id ?? null,
        department_id: fields.department_id ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pic: pic ? { id: pic.id, name: pic.name, initials: pic.initials, color: pic.color } : null,
      }
      qc.setQueryData(key, (old) => [optimistic, ...(old ?? [])])
      return { previous }
    },
    onSuccess: (task) => {
      logActivity({
        workspaceId: workspace.id,
        taskId: task.id,
        actorId: user?.id,
        action: 'task.created',
        payload: { title: task.title },
      })
    },
    onError: (err, _fields, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
      showToast(errMsg(err, 'Could not add task'), { type: 'error' })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useUpdateTask() {
  const { workspace, user } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  const key = queryKeys.tasks(workspace?.id)

  return useMutation({
    mutationFn: ({ id, ...fields }) => updateTask(id, fields),
    onMutate: async ({ id, ...fields }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      qc.setQueryData(key, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, ...fields } : t)),
      )
      return { previous }
    },
    onSuccess: (task, vars) => {
      const { id: _id, ...changes } = vars
      logActivity({
        workspaceId: workspace.id,
        taskId: task.id,
        actorId: user?.id,
        action: 'task.updated',
        payload: { changes },
      })
      // Push fanout — fire-and-forget. Map field changes to event
      // kinds; recipients are computed server-side from the task's
      // current PIC + watchers (minus the actor).
      if ('pic_id' in changes && changes.pic_id) {
        notifyTaskEvent({
          taskId: task.id,
          kind: 'pic_changed',
          extra: { new_pic_name: task.pic?.name ?? null },
        })
      }
      if ('status' in changes) {
        notifyTaskEvent({
          taskId: task.id,
          kind: 'status_changed',
          extra: { new_status: changes.status },
        })
      }
      if ('due_date' in changes) {
        notifyTaskEvent({
          taskId: task.id,
          kind: 'due_changed',
          extra: { new_due_date: changes.due_date },
        })
      }
    },
    onError: (err, _fields, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
      showToast(errMsg(err, 'Could not save task'), { type: 'error' })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteTask() {
  const { workspace, user } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  const key = queryKeys.tasks(workspace?.id)

  return useMutation({
    mutationFn: (id) => deleteTask(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      qc.setQueryData(key, (old) => (old ?? []).filter((t) => t.id !== id))
      return { previous }
    },
    onSuccess: (_void, id) => {
      logActivity({
        workspaceId: workspace.id,
        taskId: null,
        actorId: user?.id,
        action: 'task.deleted',
        payload: { task_id: id },
      })
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
      showToast(errMsg(err, 'Could not delete task'), { type: 'error' })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

// ---------- Watchers ----------

export function useAddWatcher() {
  const { workspace } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, personId }) => addWatcher(taskId, personId),
    onSuccess: (_data, { taskId }) => {
      notifyTaskEvent({ taskId, kind: 'watcher_added' })
    },
    onError: (err) => showToast(errMsg(err, 'Could not add watcher'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.tasks(workspace?.id) }),
  })
}

export function useRemoveWatcher() {
  const { workspace } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, personId }) => removeWatcher(taskId, personId),
    onError: (err) => showToast(errMsg(err, 'Could not remove watcher'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.tasks(workspace?.id) }),
  })
}

// ---------- People ----------

export function usePeople({ includeInactive = false } = {}) {
  const { workspace } = useAuth()
  return useQuery({
    queryKey: [...queryKeys.people(workspace?.id), { includeInactive }],
    queryFn: () => fetchPeople(workspace.id, { includeInactive }),
    enabled: !!workspace,
  })
}

export function useCreatePerson() {
  const { workspace } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fields) => createPerson(workspace.id, fields),
    onError: (err) => showToast(errMsg(err, 'Could not add person'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.people(workspace?.id) }),
  })
}

export function useUpdatePerson() {
  const { workspace } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...fields }) => updatePerson(id, fields),
    onError: (err) => showToast(errMsg(err, 'Could not save person'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.people(workspace?.id) }),
  })
}

export function useDeactivatePerson() {
  const { workspace } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => deactivatePerson(id),
    onError: (err) => showToast(errMsg(err, 'Could not deactivate person'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.people(workspace?.id) }),
  })
}

export function useReactivatePerson() {
  const { workspace } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => reactivatePerson(id),
    onError: (err) => showToast(errMsg(err, 'Could not reactivate person'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.people(workspace?.id) }),
  })
}

export function useDeletePerson() {
  const { workspace } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => deletePerson(id),
    onError: (err) => showToast(errMsg(err, 'Could not delete person'), { type: 'error' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.people(workspace?.id) })
      // Hard delete unassigns tasks (FK ON DELETE SET NULL) — refresh tasks too.
      qc.invalidateQueries({ queryKey: queryKeys.tasks(workspace?.id) })
    },
  })
}

// ---------- Departments ----------

export function useDepartments() {
  const { workspace } = useAuth()
  return useQuery({
    queryKey: queryKeys.departments(workspace?.id),
    queryFn: () => fetchDepartments(workspace.id),
    enabled: !!workspace,
  })
}

export function useCreateDepartment() {
  const { workspace } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fields) => createDepartment(workspace.id, fields),
    onError: (err) => showToast(errMsg(err, 'Could not add department'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.departments(workspace?.id) }),
  })
}

export function useUpdateDepartment() {
  const { workspace } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...fields }) => updateDepartment(id, fields),
    onError: (err) => showToast(errMsg(err, 'Could not save department'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.departments(workspace?.id) }),
  })
}

export function useDeleteDepartment() {
  const { workspace } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => deleteDepartment(id),
    onError: (err) => showToast(errMsg(err, 'Could not delete department'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.departments(workspace?.id) }),
  })
}

// ---------- Super Admin ----------

export function useIsSuperadmin() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['isSuperadmin', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('superadmins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()
      return !!data
    },
    enabled: !!user,
    staleTime: 60 * 60 * 1000,
  })
}

export function useAdminWorkspaces() {
  const { data: isAdmin = false } = useIsSuperadmin()
  return useQuery({
    queryKey: ['admin', 'workspaces'],
    queryFn: fetchAdminWorkspaces,
    enabled: isAdmin,
  })
}

export function useAdminUsers() {
  const { data: isAdmin = false } = useIsSuperadmin()
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchAdminUsers,
    enabled: isAdmin,
  })
}

export function useAdminSystemStats() {
  const { data: isAdmin = false } = useIsSuperadmin()
  return useQuery({
    queryKey: ['admin', 'system'],
    queryFn: fetchAdminSystemStats,
    enabled: isAdmin,
  })
}

export function useAdminActivity({ limit = 50 } = {}) {
  const { data: isAdmin = false } = useIsSuperadmin()
  return useQuery({
    queryKey: ['admin', 'activity', limit],
    queryFn: () => fetchAdminActivity({ limit }),
    enabled: isAdmin,
    staleTime: 30_000,
  })
}

export function useAdminCreateWorkspace() {
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: ({ name, ownerId }) => adminCreateWorkspace(name, ownerId),
    onError: (err) => showToast(errMsg(err, 'Could not create workspace'), { type: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useAdminDeleteWorkspace() {
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: (id) => adminDeleteWorkspace(id),
    onError: (err) => showToast(errMsg(err, 'Could not delete workspace'), { type: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useAdminCreateUser() {
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: (opts) => adminCreateUser(opts),
    onError: (err) => showToast(errMsg(err, 'Could not create user'), { type: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useAdminDeleteUser() {
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: (userId) => adminDeleteUser(userId),
    onError: (err) => showToast(errMsg(err, 'Could not delete user'), { type: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useAdminPromoteUser() {
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: ({ userId, notes }) => adminPromoteUser(userId, notes),
    onError: (err) => showToast(errMsg(err, 'Could not promote user'), { type: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useAdminDemoteUser() {
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: (userId) => adminDemoteUser(userId),
    onError: (err) => showToast(errMsg(err, 'Could not demote user'), { type: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useAdminAddMember() {
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: ({ workspaceId, userId, role }) => adminAddMember(workspaceId, userId, role),
    onError: (err) => showToast(errMsg(err, 'Could not add member'), { type: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useAdminLinkPerson() {
  const { workspace } = useAuth()
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: ({ personId, userId }) => adminLinkPerson(personId, userId),
    onError: (err) =>
      showToast(errMsg(err, 'Could not link person'), { type: 'error' }),
    onSettled: () => {
      // people query carries the user_id; admin queries carry the
      // "linked-as" picture. Invalidate both.
      qc.invalidateQueries({ queryKey: queryKeys.people(workspace?.id) })
      qc.invalidateQueries({ queryKey: ['admin'] })
    },
  })
}

export function useAdminUnlinkPerson() {
  const { workspace } = useAuth()
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: (personId) => adminUnlinkPerson(personId),
    onError: (err) =>
      showToast(errMsg(err, 'Could not unlink person'), { type: 'error' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.people(workspace?.id) })
      qc.invalidateQueries({ queryKey: ['admin'] })
    },
  })
}

export function useAdminRemoveMember() {
  const qc = useQueryClient()
  const showToast = useToast()
  return useMutation({
    mutationFn: ({ workspaceId, userId }) => adminRemoveMember(workspaceId, userId),
    onError: (err) => showToast(errMsg(err, 'Could not remove member'), { type: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

// ---------- Activity ----------

export function useRecentActivity({ limit = 20 } = {}) {
  const { workspace } = useAuth()
  return useQuery({
    queryKey: queryKeys.activity(workspace?.id, limit),
    queryFn: () => fetchRecentActivity(workspace.id, limit),
    enabled: !!workspace,
    staleTime: 30_000, // 30s — activity is live-ish but doesn't need to refetch on every interaction
  })
}

// ---------- Saved filters ----------

export function useSavedFilters() {
  const { workspace } = useAuth()
  return useQuery({
    queryKey: queryKeys.savedFilters(workspace?.id),
    queryFn: () => fetchSavedFilters(workspace.id),
    enabled: !!workspace,
  })
}

export function useCreateSavedFilter() {
  const { workspace } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, spec }) => createSavedFilter(workspace.id, name, spec),
    onError: (err) => showToast(errMsg(err, 'Could not save filter'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.savedFilters(workspace?.id) }),
  })
}

export function useDeleteSavedFilter() {
  const { workspace } = useAuth()
  const showToast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => deleteSavedFilter(id),
    onError: (err) => showToast(errMsg(err, 'Could not delete filter'), { type: 'error' }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.savedFilters(workspace?.id) }),
  })
}

// ---------- Journal ----------

export function useJournalEntries(taskId) {
  return useQuery({
    queryKey: queryKeys.journal(taskId),
    queryFn: () => fetchJournalEntries(taskId),
    enabled: !!taskId && !String(taskId).startsWith('temp-'),
  })
}

export function useCreateJournalEntry(taskId) {
  const { user, workspace } = useAuth()
  const qc = useQueryClient()
  const key = queryKeys.journal(taskId)

  // For optimistic display: prefer the linked person's name (from the
  // people cache for the active workspace), else the auth user's name
  // or email. Resolved at mutation time so it picks up whatever's in
  // cache by then.
  function currentAuthorName() {
    if (!user) return null
    const peopleCache = workspace?.id
      ? qc.getQueriesData({ queryKey: queryKeys.people(workspace.id) })
      : []
    for (const [, data] of peopleCache) {
      const linked = (data ?? []).find((p) => p.user_id === user.id)
      if (linked?.name) return linked.name
    }
    return (
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      null
    )
  }

  return useMutation({
    // Accepts either a plain string (body) or { body, parentId, mentions }
    // so callers can post replies + mentions without breaking the old
    // string-only signature.
    mutationFn: (input) => {
      const args =
        typeof input === 'string'
          ? { body: input, parentId: null, mentions: [] }
          : { body: input.body, parentId: input.parentId ?? null, mentions: input.mentions ?? [] }
      return createJournalEntry({
        taskId,
        body: args.body,
        authorId: user.id,
        parentId: args.parentId,
        mentions: args.mentions,
      })
    },
    onMutate: async (input) => {
      const args =
        typeof input === 'string'
          ? { body: input, parentId: null, mentions: [] }
          : { body: input.body, parentId: input.parentId ?? null, mentions: input.mentions ?? [] }
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      const optimistic = {
        id: `temp-${Date.now()}`,
        task_id: taskId,
        author_id: user.id,
        author_name: currentAuthorName(),
        body: args.body,
        entry_type: 'note',
        status_value: null,
        parent_id: args.parentId,
        mentions: args.mentions,
        created_at: new Date().toISOString(),
      }
      qc.setQueryData(key, (old) => [optimistic, ...(old ?? [])])
      return { previous }
    },
    onSuccess: (_entry, input) => {
      const args =
        typeof input === 'string'
          ? { body: input, mentions: [] }
          : { body: input.body, mentions: input.mentions ?? [] }
      // Existing fanout: ping PIC + watchers (minus the actor) about
      // the new comment.
      notifyTaskEvent({
        taskId,
        kind: 'journal_added',
        extra: { snippet: String(args.body).slice(0, 120) },
      })
      // If the comment @mentions specific people, also fire a
      // direct-mention push. Server-side mapping for 'pic_changed'
      // already targets a specific user (the new PIC); we reuse that
      // path conceptually by piggy-backing on journal_added's recipient
      // resolution AND adding extra recipients via the matcher trick:
      // the cheap approach for v1 is to rely on journal_added's
      // existing watcher/PIC fan-out, which already covers mentions
      // when those people are watchers. A dedicated mention-only
      // channel can come later if needed.
      // (No-op for v1 beyond the existing journal_added.)
      void args
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      if (workspace?.id) {
        qc.invalidateQueries({ queryKey: queryKeys.tasks(workspace.id) })
      }
    },
  })
}

// Realtime subscription helper for journal entries on a task. Returns
// a cleanup function; the caller wires it to a useEffect on the open
// task id. New rows just invalidate the query so the regular fetch
// re-runs and hydrates author_name etc.
export function subscribeJournalRealtime(taskId, qc) {
  if (!taskId || String(taskId).startsWith('temp-')) return () => {}
  const channel = supabase
    .channel(`journal:${taskId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'journal_entries',
        filter: `task_id=eq.${taskId}`,
      },
      () => {
        qc.invalidateQueries({ queryKey: queryKeys.journal(taskId) })
      },
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
