import { supabase } from '../lib/supabase'

// We use to_tsquery + prefix matching (:*) instead of websearch_to_tsquery
// so partial words match — typing "spar" finds "spare". Each term in
// the query becomes `term:*`, AND-joined. Special tsquery operators
// (& | ! ( )) are stripped so user-typed punctuation can't break the
// parser.
function buildPrefixQuery(raw) {
  const cleaned = String(raw ?? '')
    .replace(/[&|!()*<>:]/g, ' ')
    .trim()
  if (!cleaned) return null
  const terms = cleaned.split(/\s+/).filter(Boolean).slice(0, 6)
  if (terms.length === 0) return null
  // 'word:*' enables prefix matching at the lexeme level. AND-join so
  // multi-word queries narrow rather than widen.
  return terms.map((t) => `${t}:*`).join(' & ')
}

export async function searchTasks(workspaceId, q) {
  const tsq = buildPrefixQuery(q)
  if (!tsq) return []
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id, task_number, title, status, priority, due_date, source,
      pic:people!tasks_pic_id_fkey(id, name, color)
    `)
    .eq('workspace_id', workspaceId)
    .textSearch('search_vector', tsq, { type: 'plain', config: 'english' })
    .limit(10)
  if (error) throw error
  return data ?? []
}

export async function searchPeople(workspaceId, q) {
  const tsq = buildPrefixQuery(q)
  if (!tsq) return []
  const { data, error } = await supabase
    .from('people')
    .select('id, name, initials, title, department, color')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .textSearch('search_vector', tsq, { type: 'plain', config: 'english' })
    .limit(5)
  if (error) throw error
  return data ?? []
}

export async function searchJournal(workspaceId, q) {
  const tsq = buildPrefixQuery(q)
  if (!tsq) return []
  // Inner-join through tasks to scope to this workspace.
  const { data, error } = await supabase
    .from('journal_entries')
    .select(`
      id, task_id, body, created_at,
      task:tasks!inner(id, title, workspace_id)
    `)
    .eq('task.workspace_id', workspaceId)
    .textSearch('search_vector', tsq, { type: 'plain', config: 'english' })
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
