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
      'id, workspace_id, title, body, created_by, updated_by, created_at, updated_at, is_workspace_visible',
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

export async function updateDoc(id, { title, body, isWorkspaceVisible, userId }) {
  const patch = { updated_by: userId }
  if (title !== undefined) patch.title = title
  if (body !== undefined) patch.body = body
  if (isWorkspaceVisible !== undefined) patch.is_workspace_visible = isWorkspaceVisible
  const { data, error } = await supabase
    .from('docs')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// --- Per-user shares ----------------------------------------------
// Authors manage these via the Share modal. RLS restricts writes to
// the doc's author and reads to the author or the share recipient.

export async function fetchDocShares(docId) {
  if (!docId) return []
  const { data, error } = await supabase
    .from('doc_shares')
    .select('doc_id, user_id, permission, created_at')
    .eq('doc_id', docId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Upsert so toggling someone from view → edit re-uses the same row.
export async function setDocShare(docId, userId, permission) {
  if (!docId || !userId) throw new Error('docId + userId are required')
  if (permission !== 'view' && permission !== 'edit') {
    throw new Error('permission must be "view" or "edit"')
  }
  const { error } = await supabase
    .from('doc_shares')
    .upsert(
      { doc_id: docId, user_id: userId, permission },
      { onConflict: 'doc_id,user_id' },
    )
  if (error) throw error
}

export async function removeDocShare(docId, userId) {
  if (!docId || !userId) throw new Error('docId + userId are required')
  const { data, error } = await supabase
    .from('doc_shares')
    .delete()
    .eq('doc_id', docId)
    .eq('user_id', userId)
    .select('doc_id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error(
      "Couldn't revoke the share — only the doc's author can manage sharing.",
    )
  }
}

export async function deleteDoc(id) {
  // Ask Postgres to send back the deleted row(s). If RLS silently
  // denies the delete (e.g. policy doesn't include the caller's
  // role), supabase-js otherwise returns success with `error: null`,
  // which is indistinguishable from a successful delete. Returning
  // the row lets us detect 0-rows-deleted and surface a real error.
  const { data, error } = await supabase
    .from('docs')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error(
      "You don't have permission to delete this doc, or it was already removed.",
    )
  }
}
