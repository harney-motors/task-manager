import { supabase } from '../lib/supabase'

// 32 random bytes base64url-encoded → 43-char opaque token.
function generateToken() {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  // base64url: no padding, URL-safe alphabet
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// Calendar token "scope" — what the .ics feed should include:
//   workspace → every task in the workspace (legacy behaviour)
//   mine      → only tasks where the user is PIC or watcher
const VALID_SCOPES = new Set(['workspace', 'mine'])
function normalizeScope(s) {
  return VALID_SCOPES.has(s) ? s : 'workspace'
}

// Fetch the active token row for (current user, workspace, scope), or
// null. A user may have one of each scope active for the same workspace.
export async function fetchCalendarToken(workspaceId, scope = 'workspace') {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('calendar_feed_tokens')
    .select('id, token, scope, created_at, last_accessed_at')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .eq('scope', normalizeScope(scope))
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

// Fetch both scopes at once (workspace + mine). Convenience for the
// Settings UI which renders both subscription cards side by side.
// Returns { workspace: row|null, mine: row|null }.
export async function fetchCalendarTokens(workspaceId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('calendar_feed_tokens')
    .select('id, token, scope, created_at, last_accessed_at')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  const byScope = { workspace: null, mine: null }
  for (const row of data ?? []) {
    if (!byScope[row.scope]) byScope[row.scope] = row
  }
  return byScope
}

// Create a fresh token for (current user, workspace, scope). Returns
// the row. If one already exists for the same scope, the unique
// constraint blocks — caller should rotate() or fetch() instead.
export async function createCalendarToken(workspaceId, scope = 'workspace') {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const token = generateToken()
  const { data, error } = await supabase
    .from('calendar_feed_tokens')
    .insert({
      user_id: user.id,
      workspace_id: workspaceId,
      scope: normalizeScope(scope),
      token,
    })
    .select('id, token, scope, created_at')
    .single()
  if (error) throw error
  return data
}

// Revoke the current active token of `scope` and issue a new one.
// Returns the new row. Old URLs go cold immediately — calendar apps
// will get 404 on their next refresh.
export async function rotateCalendarToken(workspaceId, scope = 'workspace') {
  const existing = await fetchCalendarToken(workspaceId, scope)
  if (existing) {
    const { error } = await supabase
      .from('calendar_feed_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
  }
  return createCalendarToken(workspaceId, scope)
}

// Revoke without replacement — subscription stops working entirely.
export async function revokeCalendarToken(workspaceId, scope = 'workspace') {
  const existing = await fetchCalendarToken(workspaceId, scope)
  if (!existing) return
  const { error } = await supabase
    .from('calendar_feed_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) throw error
}

// Construct the public subscription URL. Uses the current origin so
// it works in local netlify dev too.
export function calendarFeedUrl(token) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/calendar/${token}.ics`
}

// webcal:// version opens directly in Apple Calendar / many other apps.
export function webcalFeedUrl(token) {
  const u = calendarFeedUrl(token)
  return u.replace(/^https?:/, 'webcal:')
}
