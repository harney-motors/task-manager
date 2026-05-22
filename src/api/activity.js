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
