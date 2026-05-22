import { supabase } from '../lib/supabase'

export async function fetchDepartments(workspaceId) {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function createDepartment(workspaceId, fields) {
  const { data, error } = await supabase
    .from('departments')
    .insert({ workspace_id: workspaceId, ...fields })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateDepartment(id, fields) {
  const { data, error } = await supabase
    .from('departments')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteDepartment(id) {
  // tasks.department_id is on delete set null, so this is safe.
  const { error } = await supabase.from('departments').delete().eq('id', id)
  if (error) throw error
}
