import { addDays, isOverdue, parseDate, startOfToday, formatRelative } from './dates'

// Build a WhatsApp-formatted message for a PIC's open tasks.
// WhatsApp text markdown: *bold*  _italic_  ~strike~  ```mono```
// The message is grouped into sections: Overdue / This week / Next week / Unscheduled
// (skipping any that have no tasks). Done tasks are excluded.

export function formatWhatsAppMessage(pic, tasks) {
  const today = startOfToday()
  const nextWeek = addDays(today, 7)
  const twoWeeks = addDays(today, 14)

  const active = tasks.filter((t) => t.status !== 'Done')

  const overdue = active.filter((t) => isOverdue(t.due_date))
  const thisWeek = active.filter((t) => {
    if (!t.due_date || isOverdue(t.due_date)) return false
    return parseDate(t.due_date) <= nextWeek
  })
  const nextWeekTasks = active.filter((t) => {
    if (!t.due_date) return false
    const d = parseDate(t.due_date)
    return d > nextWeek && d <= twoWeeks
  })
  const unscheduled = active.filter((t) => !t.due_date)

  const firstName = pic.name.split(' ')[0]
  const heading = `*${firstName}'s tasks* — ${formatHeaderDate()}`

  const lines = [heading, '']
  pushSection(lines, '🔴', 'Overdue', overdue)
  pushSection(lines, '📅', 'This week', thisWeek)
  pushSection(lines, '📆', 'Next week', nextWeekTasks)
  pushSection(lines, '📝', 'Unscheduled', unscheduled)

  if (active.length === 0) {
    lines.push('_No active tasks 🎉_')
  } else {
    lines.push(`_Total active: ${active.length}_`)
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function pushSection(lines, emoji, label, items) {
  if (items.length === 0) return
  lines.push(`${emoji} *${label}* (${items.length})`)
  items.forEach((t) => {
    const dateLabel = t.due_date ? ` _(${formatRelative(t.due_date)})_` : ''
    lines.push(`• ${t.title}${dateLabel}`)
  })
  lines.push('')
}

function formatHeaderDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}
