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

// Approximate contrast ratio between a hex colour and white (#fff).
// Used to warn the user when their pick will make white-on-brand
// button text unreadable. Returns a number (1–21). WCAG AA for normal
// text needs >= 4.5; AA for large/bold UI text needs >= 3.
export function contrastWithWhite(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const l1 = relativeLuminance(rgb)
  const l2 = 1 // pure white
  return (l2 + 0.05) / (l1 + 0.05)
}

function hexToRgb(hex) {
  if (!hex) return null
  let s = String(hex).trim().replace(/^#/, '')
  if (s.length === 3) {
    s = s
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (!/^[0-9a-f]{6}$/i.test(s)) return null
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  }
}

function relativeLuminance({ r, g, b }) {
  const transform = (v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  const R = transform(r)
  const G = transform(g)
  const B = transform(b)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}
