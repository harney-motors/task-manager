import { picDot } from '../lib/colors'

const COLORS = [
  'purple', 'coral', 'pink', 'green', 'amber',
  'blue', 'teal', 'gray', 'red',
]

export default function ColorPicker({ value, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          className={`w-7 h-7 rounded-full ${picDot(c)} ${
            value === c
              ? 'ring-2 ring-info ring-offset-2 ring-offset-surface'
              : 'opacity-80 hover:opacity-100'
          }`}
        />
      ))}
    </div>
  )
}
