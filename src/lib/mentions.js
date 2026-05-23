// Mention parsing + rendering helpers.
//
// A mention is written in the body as `@FirstName`. We resolve it
// against the workspace people list (case-insensitive first name
// match) and store the matched person ids in the entry's `mentions`
// array. On render we highlight the @segments.

// Regex matches @ followed by one or more word characters.
// Stops at whitespace, punctuation that's not part of a name (we
// treat hyphens/underscores as continuing).
const MENTION_RE = /@([A-Za-z][\w-]*)/g

// Find all @FirstName tokens in the body and resolve to person ids.
// Returns an array of unique person ids (no duplicates).
export function extractMentions(body, people) {
  if (!body) return []
  const matches = String(body).matchAll(MENTION_RE)
  const ids = new Set()
  for (const m of matches) {
    const first = m[1].toLowerCase()
    const p = people.find((pp) => pp.name?.split(' ')[0].toLowerCase() === first)
    if (p) ids.add(p.id)
  }
  return Array.from(ids)
}

// Split a body into renderable segments alternating between plain text
// and mention tokens, so the UI can style mentions inline.
//
// Returns: [{ type: 'text', value } | { type: 'mention', value, person }]
export function tokenizeBody(body, people) {
  if (!body) return []
  const parts = []
  let lastIdx = 0
  const re = /@([A-Za-z][\w-]*)/g
  let m
  while ((m = re.exec(body)) !== null) {
    if (m.index > lastIdx) {
      parts.push({ type: 'text', value: body.slice(lastIdx, m.index) })
    }
    const first = m[1].toLowerCase()
    const person =
      people.find((p) => p.name?.split(' ')[0].toLowerCase() === first) ?? null
    parts.push({ type: 'mention', value: m[0], person })
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < body.length) {
    parts.push({ type: 'text', value: body.slice(lastIdx) })
  }
  return parts
}

// Given a textarea value + caret position, detect if the user is
// currently typing a @mention. Returns { active, query, startIdx } or
// { active: false }. The composer uses this to show / filter the
// autocomplete dropdown.
export function detectActiveMention(value, caret) {
  if (caret == null || caret < 1) return { active: false }
  // Walk back from caret looking for an @ that isn't preceded by a
  // word character (so emails like a@b.com don't trigger).
  let i = caret - 1
  while (i >= 0) {
    const ch = value[i]
    if (ch === '@') {
      // The @ must be at the start of input or preceded by whitespace.
      const prev = i === 0 ? ' ' : value[i - 1]
      if (!/\s/.test(prev) && prev !== '\n') return { active: false }
      const query = value.slice(i + 1, caret)
      // Only word chars allowed in a mention query
      if (!/^[A-Za-z][\w-]*$|^$/.test(query)) return { active: false }
      return { active: true, query, startIdx: i }
    }
    if (/\s/.test(ch) || ch === '\n') return { active: false }
    i--
  }
  return { active: false }
}
