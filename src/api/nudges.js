import { supabase } from '../lib/supabase'

export async function fetchActiveNudges(workspaceId) {
  // RLS already filters by user_id = auth.uid(). We also gate by
  // workspace so PIC users with multiple workspaces only see the
  // active one's nudges.
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('ai_nudges')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(8)
  if (error) throw error
  return data ?? []
}

export async function dismissNudge(id) {
  const { error } = await supabase
    .from('ai_nudges')
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Full history — active + dismissed — for the dedicated /notifications
// page. Newest first, capped to a reasonable window so a long-lived
// workspace doesn't ship megabytes back to the client.
export async function fetchAllNudges(workspaceId, { limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('ai_nudges')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

// Restore a dismissed nudge (just flip status back to active + clear
// dismissed_at). Used by the history page's "Restore" affordance.
export async function restoreNudge(id) {
  const { error } = await supabase
    .from('ai_nudges')
    .update({ status: 'active', dismissed_at: null })
    .eq('id', id)
  if (error) throw error
}
