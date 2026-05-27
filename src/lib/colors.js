// PIC color -> Tailwind classes. Tailwind's JIT scanner needs to see the
// full class names as string literals, so we use a static lookup map
// rather than templating into `bg-pic-${color}-bg`.

export const PIC_PILL = {
  purple: 'bg-pic-purple-bg text-pic-purple-text',
  coral:  'bg-pic-coral-bg  text-pic-coral-text',
  pink:   'bg-pic-pink-bg   text-pic-pink-text',
  green:  'bg-pic-green-bg  text-pic-green-text',
  amber:  'bg-pic-amber-bg  text-pic-amber-text',
  blue:   'bg-pic-blue-bg   text-pic-blue-text',
  teal:   'bg-pic-teal-bg   text-pic-teal-text',
  gray:   'bg-pic-gray-bg   text-pic-gray-text',
  red:    'bg-pic-red-bg    text-pic-red-text',
}

export const PIC_DOT = {
  purple: 'bg-pic-purple-dot',
  coral:  'bg-pic-coral-dot',
  pink:   'bg-pic-pink-dot',
  green:  'bg-pic-green-dot',
  amber:  'bg-pic-amber-dot',
  blue:   'bg-pic-blue-dot',
  teal:   'bg-pic-teal-dot',
  gray:   'bg-pic-gray-dot',
  red:    'bg-pic-red-dot',
}

export function picPill(color) {
  return PIC_PILL[color] ?? PIC_PILL.gray
}

export function picDot(color) {
  return PIC_DOT[color] ?? PIC_DOT.gray
}

// Status badges — pastel tags routed through theme tokens so they
// adapt to light + dark mode and keep saturation gentle. Soft bg +
// matching text is the Linear / Notion idiom for status pills:
// readable + identifiable without screaming.
export const STATUS_PILL = {
  Open:           'bg-text-3/15 text-text-2',
  'In progress':  'bg-in-progress-bg text-in-progress-text',
  Done:           'bg-success-bg text-success-text',
  Overdue:        'bg-danger-bg text-danger-text',
  Ongoing:        'bg-pic-purple-bg text-pic-purple-text',
}

export function statusPill(status) {
  return STATUS_PILL[status] ?? STATUS_PILL.Open
}
