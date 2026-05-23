// Positional PIC detection for the quick-entry input.
//
// Goal: don't just grab the first name that appears — figure out
// whether the name is the OWNER of the work or just a person
// referenced in it.
//
// Strategy (in order; first hit wins):
//   1. "Ask / Tell / Talk to / Email / Call / Update / Brief / Notify
//      / Follow up with X" — X is the RECIPIENT, not the PIC. If the
//      sentence names another person, that's the PIC. Otherwise we
//      leave it unassigned so the user picks.
//   2. "X to <verb>" / "X should" / "X needs" / "X will" — X is
//      explicitly the owner. Strong signal.
//   3. "<verb> ... for X" / "<verb> ... with X" — X is again a
//      recipient/collaborator; another name (if any) is the PIC.
//   4. "I will / I'll / I need" — current user is PIC.
//   5. Fallback: first name that appears anywhere → low-confidence
//      suggestion (no auto-commit if user wants to review).
//
// Returns: { person, confidence, reason } where confidence is
// 'high' | 'medium' | 'low' | null.

const RECIPIENT_VERBS =
  '(?:ask|tell|talk to|speak (?:to|with)|email|call|update|brief|notify|follow up with|message|cc|loop in)'
const OWNER_TAIL = '(?:to|should|needs?|will|must|can|please)'

export function detectPic(text, people, { selfPersonId = null } = {}) {
  if (!text || !people?.length) {
    return { person: null, confidence: null, reason: 'empty' }
  }
  const t = text.trim()

  // Helpers
  const byFirst = new Map()
  for (const p of people) {
    const first = (p.name?.split(' ')[0] ?? '').toLowerCase()
    if (first && !byFirst.has(first)) byFirst.set(first, p)
  }
  const findByFirst = (name) => byFirst.get(String(name).toLowerCase()) ?? null
  const namePattern = Array.from(byFirst.keys())
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  if (!namePattern) {
    return { person: null, confidence: null, reason: 'no_people' }
  }
  const NAME = `(?:${namePattern})`

  // ---- 1. Recipient pattern at the start ----------------------------
  const recipientRe = new RegExp(
    `^\\s*${RECIPIENT_VERBS}\\s+(${NAME})\\b`,
    'i',
  )
  const recipientMatch = t.match(recipientRe)
  if (recipientMatch) {
    const recipient = findByFirst(recipientMatch[1])
    // Look for ANOTHER name elsewhere in the sentence — that's the PIC.
    const other = findOtherName(t, NAME, recipient?.id, findByFirst)
    if (other) {
      return { person: other, confidence: 'medium', reason: 'recipient_then_owner' }
    }
    // No other name → unassigned (the current user is implicitly the
    // PIC, but we surface that as a suggestion via selfPersonId rather
    // than auto-assigning so the user notices).
    if (selfPersonId) {
      const self = people.find((p) => p.id === selfPersonId)
      if (self) {
        return { person: self, confidence: 'medium', reason: 'recipient_implies_self' }
      }
    }
    return { person: null, confidence: null, reason: 'recipient_only' }
  }

  // ---- 2. Owner pattern at the start --------------------------------
  const ownerRe = new RegExp(
    `^\\s*(${NAME})\\s+${OWNER_TAIL}\\b`,
    'i',
  )
  const ownerMatch = t.match(ownerRe)
  if (ownerMatch) {
    const p = findByFirst(ownerMatch[1])
    if (p) return { person: p, confidence: 'high', reason: 'starts_with_owner' }
  }

  // ---- 3. Trailing "for X" / "with X" (recipient) -------------------
  const trailRecipientRe = new RegExp(
    `\\b(?:for|with|to)\\s+(${NAME})\\b(?!.*\\b${NAME}\\b)`, // last X
    'i',
  )
  const trailMatch = t.match(trailRecipientRe)
  if (trailMatch) {
    const recipient = findByFirst(trailMatch[1])
    const other = findOtherName(t, NAME, recipient?.id, findByFirst)
    if (other) {
      return { person: other, confidence: 'medium', reason: 'trail_recipient_then_owner' }
    }
    // Same self fallback as above
    if (selfPersonId) {
      const self = people.find((p) => p.id === selfPersonId)
      if (self) {
        return { person: self, confidence: 'low', reason: 'trail_recipient_implies_self' }
      }
    }
  }

  // ---- 4. First-person language → current user ----------------------
  if (/^\s*(i'll|i will|i need|i'm|my\b)\b/i.test(t)) {
    if (selfPersonId) {
      const self = people.find((p) => p.id === selfPersonId)
      if (self) return { person: self, confidence: 'high', reason: 'first_person' }
    }
  }

  // ---- 5. Bare-name fallback (low confidence) -----------------------
  const bareRe = new RegExp(`\\b(${NAME})\\b`, 'i')
  const bare = t.match(bareRe)
  if (bare) {
    const p = findByFirst(bare[1])
    if (p) return { person: p, confidence: 'low', reason: 'name_appears' }
  }

  return { person: null, confidence: null, reason: 'no_match' }
}

// Find the first name in `text` that ISN'T the excluded id, returning
// the matched person.
function findOtherName(text, NAME, excludedId, findByFirst) {
  const re = new RegExp(`\\b(${NAME})\\b`, 'gi')
  let m
  while ((m = re.exec(text)) !== null) {
    const p = findByFirst(m[1])
    if (p && p.id !== excludedId) return p
  }
  return null
}
