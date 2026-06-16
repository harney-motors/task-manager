// Shared error logger for Netlify functions. Inserts into the same
// error_log table that the client writes to, but using the service-
// role key so RLS is bypassed (workspace_id can be set freely and
// user_id can be omitted).
//
// Lazy-initialised so importing this module doesn't fail when env
// vars are partially set during local dev.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let adminClient = null
function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return adminClient
}

// Best-effort error logging. Never throws; failures fall back to
// console.warn so we don't recurse logging the logger's own failure.
//
// `source` should be of the form `netlify-fn:<name>` so the UI can
// filter to a specific function.
//
// `workspaceId` is optional. Setting it lets workspace owners see
// the error; null-workspace errors are super-admin-only by RLS.
export async function logServerError({
  source,
  message,
  level = 'error',
  context = null,
  workspaceId = null,
  userId = null,
}) {
  if (!source || !message) return
  const admin = getAdminClient()
  if (!admin) {
    console.warn(
      '[error-log] no admin client (SUPABASE_SERVICE_ROLE_KEY unset) — message:',
      message,
    )
    return
  }
  try {
    const { error } = await admin.from('error_log').insert({
      source,
      message: String(message).slice(0, 4000),
      level,
      context: context ?? null,
      workspace_id: workspaceId ?? null,
      user_id: userId ?? null,
    })
    if (error) console.warn('[error-log] insert failed', error)
  } catch (err) {
    console.warn('[error-log] logger crashed', err)
  }
}
