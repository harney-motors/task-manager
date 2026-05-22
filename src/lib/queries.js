import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { createTask, fetchTasks, updateTask, deleteTask } from '../api/tasks'

export const queryKeys = {
  tasks: (workspaceId) => ['tasks', workspaceId],
}

export function useTasks() {
  const { workspace } = useAuth()
  return useQuery({
    queryKey: queryKeys.tasks(workspace?.id),
    queryFn: () => fetchTasks(workspace.id),
    enabled: !!workspace,
  })
}

export function useCreateTask() {
  const { workspace, people } = useAuth()
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
    onError: (_err, _fields, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useUpdateTask() {
  const { workspace } = useAuth()
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
    onError: (_err, _fields, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteTask() {
  const { workspace } = useAuth()
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
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
