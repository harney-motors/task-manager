import { picPill, picDot } from '../lib/colors'

// Circular initials avatar — the visual idiom shared by ClickUp,
// Linear, Monday, Notion. Single source of truth so PIC people render
// the same way everywhere they appear (task rows, modal headers, PIC
// view, watcher chips, the bell sheet, …).
//
// Props:
//   person   — { name, initials, color, is_active? }
//   size     — 'xs' (16px) | 'sm' (20px) | 'md' (28px) | 'lg' (36px)
//   showName — optional first-name label rendered next to the circle.
//              When true, returns a flex row instead of just the circle.
//   tone     — 'pill' (coloured bg + matching text, default) or
//              'dot' (filled circle with white initials)
//   className — extra wrapper classes
const SIZE_CLASS = {
  xs: 'w-4 h-4 text-[8px]',
  sm: 'w-5 h-5 text-[9px]',
  md: 'w-7 h-7 text-[10px]',
  lg: 'w-9 h-9 text-xs',
}

const RING_SIZE = {
  xs: 'ring-1',
  sm: 'ring-1',
  md: 'ring-2',
  lg: 'ring-2',
}

export default function Avatar({
  person,
  size = 'md',
  showName = false,
  tone = 'pill',
  className = '',
}) {
  if (!person) return <UnassignedAvatar size={size} showName={showName} className={className} />

  const sizeCls = SIZE_CLASS[size] ?? SIZE_CLASS.md
  const initials = (person.initials ?? deriveInitials(person.name)).slice(0, 2)
  const inactive = person.is_active === false

  const circle =
    tone === 'dot' ? (
      // Solid filled dot with white initials — for compact uses like
      // watcher stacks where the colour is the primary signal.
      <span
        className={`inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0 ${sizeCls} ${picDot(
          person.color,
        )} ${inactive ? 'opacity-60' : ''}`}
        title={inactive ? `${person.name} (inactive)` : person.name}
      >
        {initials}
      </span>
    ) : (
      // Pill tones from the PIC palette — coloured bg + matching text,
      // consistent with how status/PIC pills render elsewhere.
      <span
        className={`inline-flex items-center justify-center rounded-full font-semibold flex-shrink-0 ${sizeCls} ${picPill(
          person.color,
        )} ${inactive ? 'opacity-60' : ''}`}
        title={inactive ? `${person.name} (inactive)` : person.name}
      >
        {initials}
      </span>
    )

  if (!showName) return className ? <span className={className}>{circle}</span> : circle

  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      {circle}
      <span className="text-xs truncate">{person.name.split(' ')[0]}</span>
    </span>
  )
}

// Empty-state avatar for unassigned tasks.
function UnassignedAvatar({ size, showName, className }) {
  const sizeCls = SIZE_CLASS[size] ?? SIZE_CLASS.md
  const circle = (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-surface-2 text-text-3 border border-dashed border-border-strong flex-shrink-0 ${sizeCls}`}
      title="Unassigned"
    >
      <i className="ti ti-user text-[10px]" />
    </span>
  )
  if (!showName) return className ? <span className={className}>{circle}</span> : circle
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      {circle}
      <span className="text-xs text-text-3 truncate">Unassigned</span>
    </span>
  )
}

// Overlapping circle stack for showing multiple people compactly —
// watcher lists, "involved" indicators, group chips. Caps the visible
// count at `max` and appends a "+N" pill for the overflow.
export function AvatarStack({
  people = [],
  size = 'sm',
  max = 3,
  className = '',
}) {
  if (people.length === 0) return null
  const visible = people.slice(0, max)
  const overflow = people.length - visible.length
  const overlap =
    size === 'xs'
      ? '-ml-1.5'
      : size === 'sm'
        ? '-ml-2'
        : size === 'md'
          ? '-ml-2.5'
          : '-ml-3'
  const ringCls = RING_SIZE[size] ?? RING_SIZE.md

  return (
    <span className={`inline-flex items-center ${className}`}>
      {visible.map((p, i) => (
        <span
          key={p.id ?? i}
          className={`${i > 0 ? overlap : ''} ${ringCls} ring-surface rounded-full inline-flex`}
        >
          <Avatar person={p} size={size} tone="dot" />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className={`${overlap} ${ringCls} ring-surface inline-flex items-center justify-center rounded-full bg-surface-2 text-text-2 font-semibold ${SIZE_CLASS[size] ?? SIZE_CLASS.md}`}
          title={`+${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </span>
  )
}

function deriveInitials(name) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
