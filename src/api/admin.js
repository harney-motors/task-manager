import { supabase } from '../lib/supabase'

export async function adminDeleteUser(userId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch('/.netlify/functions/admin-delete-user', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ user_id: userId }),
  })

  if (!res.ok) {
    let msg = `Could not delete user (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      // body wasn't JSON
    }
    throw new Error(msg)
  }
  return res.json()
}

export async function adminCreateUser({
  email,
  sendInvite = false,
  workspaceId = null,
  role = null,
  promoteSuperadmin = false,
  linkPersonId = null,
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch('/.netlify/functions/admin-create-user', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      email,
      send_invite: sendInvite,
      workspace_id: workspaceId,
      role,
      promote_superadmin: promoteSuperadmin,
      link_person_id: linkPersonId,
    }),
  })

  if (!res.ok) {
    let msg = `Could not create user (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      // body wasn't JSON
    }
    throw new Error(msg)
  }
  return res.json()
}


// Thin wrappers over the admin_* / get_all_users RPC functions.
// Each one runs server-side with security definer and rejects callers
// that aren't in the superadmins table.

export async function fetchAdminWorkspaces() {
  const { data, error } = await supabase.rpc('admin_workspace_stats')
  if (error) throw error
  return data ?? []
}

export async function fetchAdminUsers() {
  const { data, error } = await supabase.rpc('get_all_users')
  if (error) throw error
  return data ?? []
}

export async function fetchAdminSystemStats() {
  const { data, error } = await supabase.rpc('admin_system_stats')
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

export async function fetchAdminActivity({ limit = 50 } = {}) {
  // Cross-workspace activity log. RLS on activity_log allows superadmins
  // to read all rows; we join workspace name for context.
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, action, payload, actor_id, task_id, workspace_id, created_at, workspace:workspaces(name), task:tasks(id, title)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function adminCreateWorkspace(name, ownerId) {
  const { data, error } = await supabase.rpc('admin_create_workspace', {
    p_name: name,
    p_owner_id: ownerId,
  })
  if (error) throw error
  return data
}

export async function adminDeleteWorkspace(id) {
  const { error } = await supabase.rpc('admin_delete_workspace', {
    p_workspace_id: id,
  })
  if (error) throw error
}

export async function adminPromoteUser(userId, notes) {
  const { error } = await supabase.rpc('admin_promote_user', {
    p_user_id: userId,
    p_notes: notes ?? null,
  })
  if (error) throw error
}

export async function adminDemoteUser(userId) {
  const { error } = await supabase.rpc('admin_demote_user', {
    p_user_id: userId,
  })
  if (error) throw error
}

export async function adminAddMember(workspaceId, userId, role) {
  const { error } = await supabase.rpc('admin_add_member', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_role: role,
  })
  if (error) throw error
}

// Link an existing person row to an existing auth user. Superadmin-
// only — enforced server-side by the admin_link_person SECURITY
// DEFINER function.
export async function adminLinkPerson(personId, userId) {
  const { error } = await supabase.rpc('admin_link_person', {
    p_person_id: personId,
    p_user_id: userId,
  })
  if (error) throw error
}

export async function adminUnlinkPerson(personId) {
  const { error } = await supabase.rpc('admin_unlink_person', {
    p_person_id: personId,
  })
  if (error) throw error
}

export async function adminRemoveMember(workspaceId, userId) {
  const { error } = await supabase.rpc('admin_remove_member', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  })
  if (error) throw error
}
