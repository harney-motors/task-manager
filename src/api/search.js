import { supabase } from '../lib/supabase'

// Use Postgres websearch_to_tsquery via Supabase's textSearch helper.
// 'english' config + websearch syntax handles "quoted phrases", OR, and
// minus exclusions naturally (try: foo OR bar, "exact phrase", -unwanted).

export async function searchTasks(workspaceId, q) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id, task_number, title, status, priority, due_date, source,
      pic:people!tasks_pic_id_fkey(id, name, color)
    `)
    .eq('workspace_id', workspaceId)
    .textSearch('search_vector', q, { type: 'websearch', config: 'english' })
    .limit(10)
  if (error) throw error
  return data ?? []
}

export async function searchPeople(workspaceId, q) {
  const { data, error } = await supabase
    .from('people')
    .select('id, name, initials, title, department, color')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .textSearch('search_vector', q, { type: 'websearch', config: 'english' })
    .limit(5)
  if (error) throw error
  return data ?? []
}

export async function searchJournal(workspaceId, q) {
  // Inner-join through tasks to scope to this workspace.
  const { data, error } = await supabase
    .from('journal_entries')
    .select(`
      id, task_id, body, created_at,
      task:tasks!inner(id, title, workspace_id)
    `)
    .eq('task.workspace_id', workspaceId)
    .textSearch('search_vector', q, { type: 'websearch', config: 'english' })
    .limit(5)
  if (error) throw error
  return data ?? []
}

export async function searchAll(workspaceId, q) {
  if (!q?.trim() || !workspaceId) {
    return { tasks: [], people: [], journal: [] }
  }
  const [tasks, people, journal] = await Promise.all([
    searchTasks(workspaceId, q),
    searchPeople(workspaceId, q),
    searchJournal(workspaceId, q),
  ])
  return { tasks, people, journal }
}
