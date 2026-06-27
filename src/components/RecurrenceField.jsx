import {
  PERIOD_LABELS,
  WEEKDAY_LABELS,
  describeRecurrence,
} from '../lib/recurrence.js'

// Recurrence editor in the TaskModal. Renders:
//
//   [None ▾]                       — no recurrence
//   [Daily ▾]                       — Daily / Weekly / Monthly / Yearly
//   [Every N days ▾] [3 days]       — "days_after" with a number input
//   [Custom (weekdays) ▾]
//     [Su][Mo][Tu][We][Th][Fr][Sa]  — pill toggles
//
// The recurrence runs when a recurring task is marked Done — the
// status flip rewrites to {status:'Open', due_date:next} and the
// same row keeps cycling. See src/lib/recurrence.js for the next-date
// math, and src/lib/queries.js useUpdateTask for the interception.

const PERIOD_OPTIONS = [
  { value: '', label: 'None — does not repeat' },
  { value: 'daily', label: PERIOD_LABELS.daily },
  { value: 'weekly', label: PERIOD_LABELS.weekly },
  { value: 'monthly', label: PERIOD_LABELS.monthly },
  { value: 'yearly', label: PERIOD_LABELS.yearly },
  { value: 'days_after', label: PERIOD_LABELS.days_after },
  { value: 'custom', label: PERIOD_LABELS.custom },
]

export default function RecurrenceField({ config, onChange, disabled }) {
  const period = config?.period ?? ''
  const interval = Math.max(1, Number(config?.interval) || 1)
  const weekdays = Array.isArray(config?.weekdays) ? config.weekdays : []

  function handlePeriodChange(nextPeriod) {
    if (!nextPeriod) {
      onChange(null)
      return
    }
    // Seed sensible defaults when switching INTO a period that needs
    // them — otherwise the user picks "Every N days" and sees blank
    // controls until they tinker.
    const seeded = { period: nextPeriod }
    if (nextPeriod === 'days_after') seeded.interval = interval || 3
    if (nextPeriod === 'custom') {
      seeded.weekdays = weekdays.length > 0 ? weekdays : [1, 3, 5] // M/W/F
    }
    onChange(seeded)
  }

  function handleIntervalChange(n) {
    const clean = Math.max(1, Math.min(365, Number(n) || 1))
    onChange({ ...config, period: 'days_after', interval: clean })
  }

  function toggleWeekday(d) {
    const set = new Set(weekdays)
    if (set.has(d)) set.delete(d)
    else set.add(d)
    const sorted = [...set].sort((a, b) => a - b)
    onChange({ ...config, period: 'custom', weekdays: sorted })
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={period}
          onChange={(e) => handlePeriodChange(e.target.value)}
          disabled={disabled}
          className="text-sm bg-surface border border-border rounded px-2 py-1 hover:bg-surface-2 cursor-pointer disabled:opacity-60"
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {period === 'days_after' && (
          <label className="text-xs text-text-2 inline-flex items-center gap-1.5">
            every
            <input
              type="number"
              min={1}
              max={365}
              value={interval}
              onChange={(e) => handleIntervalChange(e.target.value)}
              disabled={disabled}
              className="w-14 text-sm bg-surface border border-border rounded px-2 py-1 text-center disabled:opacity-60"
            />
            days
          </label>
        )}

        {period && (
          <span
            className="text-[11px] text-text-3"
            title="Resets when the task is marked Done"
          >
            {describeRecurrence(config)}
          </span>
        )}
      </div>

      {period === 'custom' && (
        <div className="flex items-center gap-1 flex-wrap">
          {WEEKDAY_LABELS.map((label, i) => {
            const active = weekdays.includes(i)
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleWeekday(i)}
                disabled={disabled}
                aria-pressed={active}
                className={`text-[11px] font-medium w-8 h-8 rounded-full border transition-colors disabled:opacity-60 ${
                  active
                    ? 'bg-info text-white border-info'
                    : 'bg-surface border-border text-text-2 hover:bg-surface-2'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {period && (
        <p className="text-[11px] text-text-3 leading-snug">
          When marked Done, this task resets to Open and the due date jumps
          to the next occurrence.
        </p>
      )}
    </div>
  )
}
