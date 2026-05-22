// Netlify Function — delete an auth user (hard delete).
//
// Auth: caller must be a superadmin.
// Safeguards:
//   - Can't delete yourself
//   - Can't delete the last superadmin
//
// FK cascade behavior (after the Phase 7 migration):
//   - workspace_members + superadmins rows for this user are deleted
//   - people.user_id, workspaces.created_by, tasks.created_by,
//     journal_entries.author_id, activity_log.actor_id are SET NULL
//   - Their content (tasks, journals, activity history) is preserved
//     but unattributed.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError(500, 'Server missing SUPABASE_SERVICE_ROLE_KEY')
  }

  // ---------- Auth ----------
  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError(401, 'Missing bearer token')
  }
  const jwt = authHeader.slice('Bearer '.length).trim()

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: callerData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !callerData?.user) {
    return jsonError(401, 'Invalid token')
  }
  const caller = callerData.user

  const { data: superadminRow } = await userClient
    .from('superadmins')
    .select('user_id')
    .eq('user_id', caller.id)
    .maybeSingle()
  if (!superadminRow) {
    return jsonError(403, 'Superadmin access required')
  }

  // ---------- Body ----------
  let body
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Invalid JSON body')
  }
  const targetUserId = String(body?.user_id ?? '').trim()
  if (!targetUserId) {
    return jsonError(400, 'user_id is required')
  }

  // ---------- Safeguards ----------
  if (targetUserId === caller.id) {
    return jsonError(400, 'You cannot delete yourself')
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Check: target exists
  const { data: targetUserResult, error: targetErr } =
    await adminClient.auth.admin.getUserById(targetUserId)
  if (targetErr || !targetUserResult?.user) {
    return jsonError(404, 'User not found')
  }
  const targetUser = targetUserResult.user

  // Check: if target is a superadmin, ensure they're not the last one
  const { data: targetSuperRow } = await adminClient
    .from('superadmins')
    .select('user_id')
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (targetSuperRow) {
    const { count } = await adminClient
      .from('superadmins')
      .select('user_id', { count: 'exact', head: true })
    if ((count ?? 0) <= 1) {
      return jsonError(400, 'Cannot delete the last superadmin')
    }
  }

  // ---------- Delete ----------
  try {
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(
      targetUserId,
    )
    if (deleteErr) throw deleteErr
  } catch (err) {
    console.warn('[admin-delete-user] delete failed', err)
    return jsonError(err.status ?? 500, err.message ?? 'Failed to delete user')
  }

  return new Response(
    JSON.stringify({
      deleted: {
        id: targetUser.id,
        email: targetUser.email,
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
