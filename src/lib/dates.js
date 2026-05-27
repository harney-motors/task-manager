// Date helpers. All comparisons are on calendar days, not exact timestamps.

export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// Supabase returns date columns as 'YYYY-MM-DD' strings.
// Parse them as local midnight to avoid timezone drift.
export function parseDate(iso) {
  if (!iso) return null
  if (iso instanceof Date) return iso
  return new Date(iso + 'T00:00:00')
}

export function isOverdue(iso) {
  const d = parseDate(iso)
  if (!d) return false
  return d < startOfToday()
}

export function isToday(iso) {
  const d = parseDate(iso)
  if (!d) return false
  const t = startOfToday()
  return d.getTime() === t.getTime()
}

export function formatRelative(iso) {
  const d = parseDate(iso)
  if (!d) return ''
  const today = startOfToday()
  const diff = Math.round((d - today) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'
  if (diff > 1) return `in ${diff} days`
  return `${Math.abs(diff)} days ago`
}

export function formatShortDate(iso) {
  const d = parseDate(iso)
  if (!d) return '—'
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${days[d.getDay()]} ${d.getDate()}`
}

// Clock-relative formatter for timestamps (created_at / updated_at).
// Different from formatRelative above, which works on calendar days
// only. Used for "Recent activity" indicators and the activity feed.
export function formatTimeAgo(isoTimestamp) {
  if (!isoTimestamp) return ''
  const diff = Date.now() - new Date(isoTimestamp).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(isoTimestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

// "Recent" = updated within the last `hours` hours. Used to show a
// subtle dot/pill on freshly-changed rows so users notice what shifted
// without needing to remember timestamps.
export function isRecentlyUpdated(isoTimestamp, hours = 4) {
  if (!isoTimestamp) return false
  const diff = Date.now() - new Date(isoTimestamp).getTime()
  return diff > 0 && diff < hours * 60 * 60 * 1000
}
