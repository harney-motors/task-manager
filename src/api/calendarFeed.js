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

// Fetch the active token row for (current user, workspace), or null.
export async function fetchCalendarToken(workspaceId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('calendar_feed_tokens')
    .select('id, token, created_at, last_accessed_at')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

// Create a fresh token for (current user, workspace). Returns the row.
// If one already exists, the unique constraint will block — caller
// should call rotate() instead, or fetchCalendarToken() to read.
export async function createCalendarToken(workspaceId) {
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
      token,
    })
    .select('id, token, created_at')
    .single()
  if (error) throw error
  return data
}

// Revoke the current active token and issue a new one. Returns the new
// row. Old URLs go cold immediately — calendar apps will get 404 on
// their next refresh.
export async function rotateCalendarToken(workspaceId) {
  const existing = await fetchCalendarToken(workspaceId)
  if (existing) {
    const { error } = await supabase
      .from('calendar_feed_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
  }
  return createCalendarToken(workspaceId)
}

// Revoke without replacement — subscription stops working entirely.
export async function revokeCalendarToken(workspaceId) {
  const existing = await fetchCalendarToken(workspaceId)
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
