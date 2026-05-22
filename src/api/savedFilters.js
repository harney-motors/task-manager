import { supabase } from '../lib/supabase'

export async function fetchSavedFilters(workspaceId) {
  const { data, error } = await supabase
    .from('saved_filters')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createSavedFilter(workspaceId, name, spec) {
  const { data, error } = await supabase
    .from('saved_filters')
    .insert({ workspace_id: workspaceId, name, spec })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteSavedFilter(id) {
  const { error } = await supabase.from('saved_filters').delete().eq('id', id)
  if (error) throw error
}
