import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { createTask, fetchTasks, updateTask, deleteTask } from '../api/tasks'
import { fetchJournalEntries, createJournalEntry } from '../api/journal'
import { logActivity } from '../api/activity'
import { supabase } from './supabase'

export const queryKeys = {
  tasks:        (workspaceId) => ['tasks', workspaceId],
  departments:  (workspaceId) => ['departments', workspaceId],
  journal:      (taskId)      => ['journal', taskId],
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
  const { workspace, people, user } = useAuth()
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
    onError: (_err, _fields, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useUpdateTask() {
  const { workspace, user } = useAuth()
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
    onError: (_err, _fields, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteTask() {
  const { workspace, user } = useAuth()
  const qc = useQueryClient()
  const key = queryKeys.tasks(workspace?.id)

  return useMutation({
    mutationFn: (id) => deleteTask(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      qc.setQueryData(key, (old) => (old ?? []).filter((t) => t.id !== id))
      return { previous, deletedId: id }
    },
    onSuccess: (_void, id) => {
      logActivity({
        workspaceId: workspace.id,
        taskId: null, // task is gone; payload preserves the id
        actorId: user?.id,
        action: 'task.deleted',
        payload: { task_id: id },
      })
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

// ---------- Departments ----------

export function useDepartments() {
  const { workspace } = useAuth()
  return useQuery({
    queryKey: queryKeys.departments(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!workspace,
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
