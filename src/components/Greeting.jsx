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

export default function Greeting({ tasks }) {
  const { user } = useAuth()

  const overdue = tasks.filter((t) => isOverdue(t.due_date) && t.status !== 'Done').length
  const today = tasks.filter((t) => isToday(t.due_date) && t.status !== 'Done').length
  const inProgress = tasks.filter((t) => t.status === 'In progress').length
  const active = tasks.filter((t) => t.status !== 'Done').length

  const parts = [`${active} active task${active === 1 ? '' : 's'}`]
  if (today > 0) parts.push(`${today} due today`)
  if (overdue > 0) parts.push(`${overdue} overdue`)
  if (inProgress > 0) parts.push(`${inProgress} in progress`)

  return (
    <div className="mb-5">
      <h1 className="text-2xl font-medium tracking-tight mb-1">
        {timeOfDay()}, {displayName(user)}
      </h1>
      <p className="text-sm text-text-2">{parts.join(' · ')}</p>
    </div>
  )
}
