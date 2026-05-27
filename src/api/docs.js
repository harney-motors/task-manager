import { supabase } from '../lib/supabase'

// Docs API — flat markdown documents scoped to a workspace.
//
// All queries are RLS-gated (workspace members read; editor+ write;
// owner delete) so the client doesn't need to pass extra filters.
// We always include workspace_id in writes for the RLS check.

export async function fetchDocs(workspaceId) {
  if (!workspaceId) return []
  const { data, error } = await supabase
    .from('docs')
    .select(
      'id, workspace_id, title, body, created_by, updated_by, created_at, updated_at',
    )
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchDoc(id) {
  if (!id) return null
  const { data, error } = await supabase
    .from('docs')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createDoc({ workspaceId, title, body, userId }) {
  const { data, error } = await supabase
    .from('docs')
    .insert({
      workspace_id: workspaceId,
      title: title || 'Untitled',
      body: body || '',
      created_by: userId,
      updated_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateDoc(id, { title, body, userId }) {
  const patch = { updated_by: userId }
  if (title !== undefined) patch.title = title
  if (body !== undefined) patch.body = body
  const { data, error } = await supabase
    .from('docs')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteDoc(id) {
  const { error } = await supabase.from('docs').delete().eq('id', id)
  if (error) throw error
}
