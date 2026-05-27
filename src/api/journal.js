import { supabase } from '../lib/supabase'

export async function fetchJournalEntries(taskId) {
  // Note: ordering matters for thread rendering. Top-level newest-
  // first; replies asc-by-created so they read top→bottom under the
  // parent. The component does the structural grouping.
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const entries = data ?? []
  if (entries.length === 0) return entries

  // Hydrate author_name from the people table. journal_entries.author_id
  // points at auth.users; people.user_id is the bridge. Imported entries
  // have author_id = null and will simply render as unattributed.
  const authorIds = [
    ...new Set(entries.map((e) => e.author_id).filter(Boolean)),
  ]
  if (authorIds.length === 0) {
    return entries.map((e) => ({ ...e, author_name: null }))
  }
  const { data: peopleData } = await supabase
    .from('people')
    .select('user_id, name')
    .in('user_id', authorIds)
  const nameByUser = {}
  for (const p of peopleData ?? []) {
    if (p.user_id && !nameByUser[p.user_id]) nameByUser[p.user_id] = p.name
  }
  return entries.map((e) => ({
    ...e,
    author_name: e.author_id ? nameByUser[e.author_id] ?? null : null,
  }))
}

export async function createJournalEntry({
  taskId,
  body,
  authorId,
  entryType = 'note',
  parentId = null,
  mentions = [],
}) {
  const { data, error } = await supabase
    .from('journal_entries')
    .insert({
      task_id: taskId,
      body,
      author_id: authorId,
      entry_type: entryType,
      parent_id: parentId,
      mentions,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Fetch every journal entry across the user's workspace that mentions
// the given personId. Used by the Mentions inbox to surface "where
// were you tagged" without having to open every task.
//
// Returns entries enriched with task title + author name. RLS already
// scopes this to entries the caller can see (members can read entries
// on tasks in their workspace), so no extra workspace filter needed.
export async function fetchMyMentions(personId, limit = 50) {
  if (!personId) return []
  const { data, error } = await supabase
    .from('journal_entries')
    .select(
      `
      id, body, mentions, author_id, task_id, created_at, entry_type, parent_id,
      task:tasks(id, title, workspace_id)
    `,
    )
    .contains('mentions', [personId])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  // RLS scopes the journal_entries query to entries the caller can see
  // via task membership. If a task was deleted (or RLS denies it), the
  // join returns `task: null` — drop those rows so the inbox never
  // shows orphans with no destination.
  const entries = (data ?? []).filter((e) => e.task)
  if (entries.length === 0) return entries

  const authorIds = [
    ...new Set(entries.map((e) => e.author_id).filter(Boolean)),
  ]
  if (authorIds.length === 0) {
    return entries.map((e) => ({ ...e, author_name: null }))
  }
  const { data: peopleData } = await supabase
    .from('people')
    .select('user_id, name')
    .in('user_id', authorIds)
  const nameByUser = {}
  for (const p of peopleData ?? []) {
    if (p.user_id && !nameByUser[p.user_id]) nameByUser[p.user_id] = p.name
  }
  return entries.map((e) => ({
    ...e,
    author_name: e.author_id ? nameByUser[e.author_id] ?? null : null,
  }))
}
