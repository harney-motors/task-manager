// Recurring-task helpers.
//
// Recurrence is stored in tasks.recurrence_config (jsonb). When a
// recurring task is marked Done, useUpdateTask intercepts and
// rewrites the mutation to {status:'Open', due_date:next} instead of
// actually flipping the status — so the same row keeps cycling.
//
// Shape of recurrence_config (null means no recurrence):
//   {
//     period:   'daily' | 'weekly' | 'monthly' | 'yearly'
//               | 'days_after' | 'custom',
//     interval: number,   // for 'days_after': "every N days"
//     weekdays: number[]  // for 'custom': 0=Sun..6=Sat
//   }
//
// `nextOccurrence(currentDueIso, config)` returns the NEXT ISO date
// after the current due date. If the task has no due date, today
// becomes the anchor (so closing a recurring task with no due date
// produces "due tomorrow" for daily, "due in a week" for weekly,
// etc.) — sensible default for the case where the user only
// configured recurrence and forgot to set a date.

import { addDays, parseDate, startOfToday } from './dates.js'

export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export const PERIOD_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  days_after: 'Every N days',
  custom: 'Custom (weekdays)',
}

export function isRecurring(config) {
  return !!config && typeof config === 'object' && !!config.period
}

// Returns ISO YYYY-MM-DD of the next occurrence.
export function nextOccurrence(currentDueIso, config) {
  if (!isRecurring(config)) return currentDueIso ?? null

  // Anchor: today if no due date, else the current due date.
  const anchor = parseDate(currentDueIso) ?? startOfToday()

  switch (config.period) {
    case 'daily':
      return toIso(addDays(anchor, 1))
    case 'weekly':
      return toIso(addDays(anchor, 7))
    case 'monthly':
      return toIso(addMonths(anchor, 1))
    case 'yearly':
      return toIso(addYears(anchor, 1))
    case 'days_after': {
      const n = Math.max(1, Number(config.interval) || 1)
      return toIso(addDays(anchor, n))
    }
    case 'custom': {
      const weekdays = Array.isArray(config.weekdays)
        ? config.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : []
      if (weekdays.length === 0) {
        // Misconfigured — fall back to weekly so we don't hard-fail.
        return toIso(addDays(anchor, 7))
      }
      return toIso(nextMatchingWeekday(anchor, weekdays))
    }
    default:
      return currentDueIso ?? null
  }
}

// Human-readable description for the task editor + tooltip.
//   describeRecurrence({period:'weekly'}) → 'Every week'
//   describeRecurrence({period:'days_after', interval:3}) → 'Every 3 days'
//   describeRecurrence({period:'custom', weekdays:[1,3,5]}) → 'Mon, Wed, Fri'
export function describeRecurrence(config) {
  if (!isRecurring(config)) return ''
  switch (config.period) {
    case 'daily':
      return 'Every day'
    case 'weekly':
      return 'Every week'
    case 'monthly':
      return 'Every month'
    case 'yearly':
      return 'Every year'
    case 'days_after': {
      const n = Math.max(1, Number(config.interval) || 1)
      return n === 1 ? 'Every day' : `Every ${n} days`
    }
    case 'custom': {
      const weekdays = Array.isArray(config.weekdays)
        ? [...config.weekdays].sort((a, b) => a - b)
        : []
      if (weekdays.length === 0) return 'Custom (no days set)'
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      return weekdays.map((d) => names[d]).join(', ')
    }
    default:
      return ''
  }
}

// ---------- internals ----------

function toIso(date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function addMonths(date, n) {
  const d = new Date(date)
  const desiredDay = d.getDate()
  d.setDate(1) // avoid month rollover (Jan 31 → Feb 31 → Mar 3)
  d.setMonth(d.getMonth() + n)
  const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(desiredDay, lastOfMonth))
  return d
}

function addYears(date, n) {
  const d = new Date(date)
  const desiredDay = d.getDate()
  d.setDate(1) // protect Feb 29 from disappearing
  d.setFullYear(d.getFullYear() + n)
  const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(desiredDay, lastOfMonth))
  return d
}

// Find the next date after `from` whose weekday is in `weekdays`.
// Always advances at least one day so closing a Friday task with
// "Custom: Fri" returns the following Friday, not the same one.
function nextMatchingWeekday(from, weekdays) {
  const set = new Set(weekdays)
  let d = addDays(from, 1)
  for (let i = 0; i < 7; i++) {
    if (set.has(d.getDay())) return d
    d = addDays(d, 1)
  }
  // Defensive: should never happen since weekdays is non-empty + dedup.
  return addDays(from, 7)
}
