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
