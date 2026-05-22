import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { useToast } from '../components/Toast'
import { createTask, fetchTasks, updateTask, deleteTask } from '../api/tasks'
import { addWatcher, removeWatcher } from '../api/watchers'
import { fetchJournalEntries, createJournalEntry } from '../api/journal'
import { fetchRecentActivity } from '../api/activity'
import {
  adminAddMember,
  adminCreateWorkspace,
  adminDeleteWorkspace,
  adminDemoteUser,
  adminPromoteUser,
  adminRemoveMember,
  fetchAdminActivity,
  fetchAdminSystemStats,
  fetchAdminUsers,
  fetchAdminWorkspaces,
} from '../api/admin'
import { supabase } from './supabase'
import {
  createPerson,
  deactivatePerson,
  fetchPeople,
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
  tasks:       (workspaceId) => ['tasks', workspaceId],
  people:      (workspaceId) => ['people', workspaceId],
  departments: (workspaceId) => ['departments', workspaceId],
  journal:     (taskId)      => ['journal', taskId],
  activity:    (workspaceId, limit) => ['activity', workspaceId, limit],
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

// ---------- Journal ----------

export function useJournalEntries(taskId) {
  return useQuery({
    queryKey: queryKeys.journal(taskId),
    queryFn: () => fetchJournalEntries(taskId),
    enabled: !!taskId && !String(taskId).startsWith('temp-'),
  })
}

export function useCreateJournalEntry(taskId) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const key = queryKeys.journal(taskId)

  return useMutation({
    mutationFn: (body) =>
      createJournalEntry({ taskId, body, authorId: user.id }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      const optimistic = {
        id: `temp-${Date.now()}`,
        task_id: taskId,
        author_id: user.id,
        body,
        entry_type: 'note',
        status_value: null,
        created_at: new Date().toISOString(),
      }
      qc.setQueryData(key, (old) => [optimistic, ...(old ?? [])])
      return { previous }
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
