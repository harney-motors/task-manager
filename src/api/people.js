import { supabase } from '../lib/supabase'

export async function fetchPeople(workspaceId, { includeInactive = false } = {}) {
  let q = supabase
    .from('people')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name')
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function createPerson(workspaceId, fields) {
  const { data, error } = await supabase
    .from('people')
    .insert({ workspace_id: workspaceId, ...fields })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updatePerson(id, fields) {
  const { data, error } = await supabase
    .from('people')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deactivatePerson(id) {
  return updatePerson(id, { is_active: false })
}

export async function reactivatePerson(id) {
  return updatePerson(id, { is_active: true })
}
