// Given an email and a list of people in a workspace, find the most
// likely "this is the same human" person record so we can suggest
// linking auth.users.id → people.user_id on user creation.
//
// Strategy:
//   1. Extract the email's local part (the bit before @)
//   2. Normalise: lowercase, replace . _ - with space
//   3. Take the first token (usually the first name)
//   4. Find a person whose first-name matches exactly
//   5. If no exact match, find a person whose first name starts with
//      the token (handles "kim" → "Kimoi"; rare but possible)
//
// Returns the matched person or null. Never throws.

export function findPersonForEmail(email, people) {
  if (!email || !people?.length) return null
  const local = String(email).split('@')[0]?.toLowerCase() ?? ''
  if (!local) return null
  const normalized = local.replace(/[._-]+/g, ' ').trim()
  const firstToken = normalized.split(/\s+/)[0]
  if (!firstToken) return null

  // 1. Exact first-name match
  const exact = people.find(
    (p) => (p.name ?? '').toLowerCase().split(/\s+/)[0] === firstToken,
  )
  if (exact) return exact

  // 2. Prefix match
  const prefix = people.find((p) => {
    const first = (p.name ?? '').toLowerCase().split(/\s+/)[0]
    return first && first.startsWith(firstToken) && firstToken.length >= 3
  })
  return prefix ?? null
}
