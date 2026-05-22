import { supabase } from '../lib/supabase'

export async function fetchJournalEntries(taskId) {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
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
