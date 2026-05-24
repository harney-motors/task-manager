import { useAuth } from '../auth/AuthProvider'
import { isOverdue, isToday } from '../lib/dates'

function timeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h >= 17) return 'Good evening'
  return 'Good afternoon'
}

function displayName(user) {
  if (!user?.email) return ''
  const local = user.email.split('@')[0]
  return local.charAt(0).toUpperCase() + local.slice(1)
}

// "Home" cover banner — ClickUp-inspired. Workspace name as the
// kicker, time-of-day greeting in big type, then a one-line summary
// of today's load. Soft accent gradient underlay so it reads as a
// banner rather than yet-another panel.
export default function Greeting({ tasks }) {
  const { user, workspace } = useAuth()

  const overdue = tasks.filter((t) => isOverdue(t.due_date) && t.status !== 'Done').length
  const today = tasks.filter((t) => isToday(t.due_date) && t.status !== 'Done').length
  const inProgress = tasks.filter((t) => t.status === 'In progress').length
  const active = tasks.filter((t) => t.status !== 'Done').length

  const parts = [`${active} active`]
  if (today > 0) parts.push(`${today} due today`)
  if (overdue > 0) parts.push(`${overdue} overdue`)
  if (inProgress > 0) parts.push(`${inProgress} in progress`)

  return (
    <div className="mb-3 sm:mb-5 relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-info-bg via-surface to-pic-purple-bg/40 px-4 sm:px-6 py-4 sm:py-6">
      {/* Decorative accent — soft blurred radial spot top-right */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full bg-info/15 blur-3xl"
      />
      <div className="relative">
        {workspace?.name && (
          <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-text-3 font-semibold mb-1">
            {workspace.name}
          </div>
        )}
        <h1 className="text-xl sm:text-3xl font-semibold tracking-tight text-text">
          {timeOfDay()}, {displayName(user)}
        </h1>
        <p className="text-xs sm:text-sm text-text-2 mt-1 sm:mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {parts.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              {i > 0 && <span className="text-text-3">·</span>}
              <span
                className={
                  /overdue/.test(p)
                    ? 'text-red-600 font-medium'
                    : /due today/.test(p)
                      ? 'text-info font-medium'
                      : ''
                }
              >
                {p}
              </span>
            </span>
          ))}
        </p>
      </div>
    </div>
  )
}
