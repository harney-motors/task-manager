import { supabase } from '../lib/supabase'

// Update mutable workspace fields. RLS already restricts updates to
// owners (per the phase-22 policy) and superadmins (via the broader
// is_superadmin gate from phase 4). Callers should pass only the
// columns they're allowed to touch — Postgres can't column-scope RLS.
export async function updateWorkspace(id, patch) {
  const { data, error } = await supabase
    .from('workspaces')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Convenience wrapper for the brand color picker. Hex string in
// #RRGGBB form, or null to clear.
export async function setBrandColor(id, hex) {
  const normalized = hex ? normalizeHex(hex) : null
  return updateWorkspace(id, { brand_color: normalized })
}

// Validate + normalise a hex string. Accepts #abc → #aabbcc, #aabbcc.
// Returns null when input is invalid so callers can show a friendlier
// error than the raw Postgres reject.
function normalizeHex(input) {
  if (!input) return null
  let s = String(input).trim()
  if (!s.startsWith('#')) s = `#${s}`
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return (
      '#' +
      s
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('')
        .toLowerCase()
    )
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase()
  return null
}
