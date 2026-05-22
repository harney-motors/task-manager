// Netlify Function — create an auth user (and optionally assign to a
// workspace) from the Super Admin panel.
//
// Auth: caller must pass their Supabase JWT in Authorization: Bearer <jwt>,
// and that user must be in the superadmins table.
//
// Why a function and not a client RPC? Creating an auth.users row
// requires the Supabase service-role key (admin API). That key can
// never live in the browser, so the operation has to happen here.
//
// Required Netlify env vars:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (already present)
//   SUPABASE_SERVICE_ROLE_KEY                  (already present for other ops)

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const VALID_ROLES = new Set(['owner', 'editor', 'pic'])

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
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return jsonError(401, 'Invalid token')
  }

  // Verify caller is a superadmin (RLS on superadmins lets each user
  // see only their own row, so this works even though the client uses
  // the user's JWT).
  const { data: superadminRow } = await userClient
    .from('superadmins')
    .select('user_id')
    .eq('user_id', userData.user.id)
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

  const email = String(body?.email ?? '').trim().toLowerCase()
  const sendInvite = !!body?.send_invite
  const workspaceId = body?.workspace_id ?? null
  const role = body?.role ?? null
  const promoteSuperadmin = !!body?.promote_superadmin

  if (!email) return jsonError(400, 'Email is required')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError(400, 'Invalid email format')
  }
  if (workspaceId && !role) {
    return jsonError(400, 'Role is required when adding to a workspace')
  }
  if (role && !VALID_ROLES.has(role)) {
    return jsonError(400, `Invalid role "${role}"`)
  }

  // ---------- Admin client (service role) ----------
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Create the user
  let newUser
  try {
    if (sendInvite) {
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email)
      if (error) throw error
      newUser = data?.user
    } else {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
      })
      if (error) throw error
      newUser = data?.user
    }
  } catch (err) {
    console.warn('[admin-create-user] auth admin error', err)
    // Supabase returns 422 for "user already exists" — surface that
    // verbatim so the UI can show "this email is taken".
    return jsonError(err.status ?? 500, err.message ?? 'Failed to create user')
  }

  if (!newUser) {
    return jsonError(500, 'Auth API returned no user object')
  }

  // 2. Optional: workspace membership
  const warnings = []
  if (workspaceId && role) {
    const { error } = await adminClient
      .from('workspace_members')
      .insert({
        workspace_id: workspaceId,
        user_id: newUser.id,
        role,
      })
    if (error) {
      warnings.push(`Created the user but couldn't add to workspace: ${error.message}`)
      console.warn('[admin-create-user] membership insert failed', error)
    }
  }

  // 3. Optional: promote to superadmin
  if (promoteSuperadmin) {
    const { error } = await adminClient
      .from('superadmins')
      .insert({ user_id: newUser.id, notes: 'created via admin panel' })
    if (error) {
      warnings.push(`Created the user but couldn't promote to superadmin: ${error.message}`)
      console.warn('[admin-create-user] superadmin insert failed', error)
    }
  }

  return new Response(
    JSON.stringify({
      user: {
        id: newUser.id,
        email: newUser.email,
        sent_invite: sendInvite,
      },
      warnings,
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
