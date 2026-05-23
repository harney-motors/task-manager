import { supabase } from '../lib/supabase'

export async function fetchSavedCommands(workspaceId) {
  let q = supabase
    .from('saved_ai_commands')
    .select('id, name, plan, created_at, workspace_id')
    .order('created_at', { ascending: false })
  // Show commands scoped to this workspace OR un-scoped (work anywhere)
  if (workspaceId) {
    q = q.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
  }
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function createSavedCommand({ name, plan, workspaceId }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('saved_ai_commands')
    .insert({
      user_id: user.id,
      workspace_id: workspaceId ?? null,
      name,
      plan,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteSavedCommand(id) {
  const { error } = await supabase
    .from('saved_ai_commands')
    .delete()
    .eq('id', id)
  if (error) throw error
}
