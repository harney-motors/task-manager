import { supabase } from '../lib/supabase'

// Fire-and-forget. Activity logging is best-effort and must never
// block or break a successful task mutation.
export function logActivity({ workspaceId, taskId, actorId, action, payload }) {
  return supabase
    .from('activity_log')
    .insert({
      workspace_id: workspaceId,
      task_id: taskId,
      actor_id: actorId,
      action,
      payload,
    })
    .then(({ error }) => {
      if (error) console.warn('[activity_log] insert failed', error)
    })
}

export async function fetchRecentActivity(workspaceId, limit = 20) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, action, payload, actor_id, task_id, created_at, task:tasks(id, title)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}
