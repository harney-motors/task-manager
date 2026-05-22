import { supabase } from '../lib/supabase'

export async function addWatcher(taskId, personId) {
  const { error } = await supabase
    .from('task_watchers')
    .insert({ task_id: taskId, person_id: personId })
  if (error) throw error
}

export async function removeWatcher(taskId, personId) {
  const { error } = await supabase
    .from('task_watchers')
    .delete()
    .eq('task_id', taskId)
    .eq('person_id', personId)
  if (error) throw error
}
