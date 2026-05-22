import { supabase } from '../lib/supabase'

const TASK_SELECT = `
  id, task_number, title, notes, status, priority,
  start_date, due_date, raised_date, tags, source,
  workspace_id, pic_id, department_id, created_by, created_at, updated_at,
  pic:people!tasks_pic_id_fkey(id, name, initials, color),
  task_watchers(person:people(id, name, initials, color)),
  journal_entries(count)
`

function flattenWatchers(task) {
  if (!task) return task
  const { task_watchers, journal_entries, ...rest } = task
  return {
    ...rest,
    watchers: (task_watchers ?? []).map((tw) => tw.person).filter(Boolean),
    note_count: journal_entries?.[0]?.count ?? 0,
  }
}

export async function fetchTasks(workspaceId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('workspace_id', workspaceId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(flattenWatchers)
}

export async function createTask(workspaceId, fields) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ workspace_id: workspaceId, ...fields })
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  return flattenWatchers(data)
}

export async function updateTask(id, fields) {
  const { data, error } = await supabase
    .from('tasks')
    .update(fields)
    .eq('id', id)
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  return flattenWatchers(data)
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}
