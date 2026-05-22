import { supabase } from '../lib/supabase'

export async function fetchJournalEntries(taskId) {
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

export async function createJournalEntry({ taskId, body, authorId, entryType = 'note' }) {
  const { data, error } = await supabase
    .from('journal_entries')
    .insert({
      task_id: taskId,
      body,
      author_id: authorId,
      entry_type: entryType,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}
