import { useMemo, useState } from 'react'
import { useCreateTask, usePeople } from '../lib/queries'

export default function QuickEntry() {
  const { data: people = [] } = usePeople()
  const createTask = useCreateTask()
  const [value, setValue] = useState('')

  // Build a regex of first names so we can detect "Asbert to do X" etc.
  // Derived from the people table, so adding a new PIC in Settings will
  // automatically extend this list — no hardcoded names.
  const firstNameRegex = useMemo(() => {
    if (!people.length) return null
    const names = people
      .map((p) => p.name.split(' ')[0])
      .filter(Boolean)
      .map(escapeRegex)
      .sort((a, b) => b.length - a.length) // longest first to avoid e.g. "Steve" eating "Stephen"
    return new RegExp(`\\b(${names.join('|')})\\b`, 'i')
  }, [people])

  function detectPic(text) {
    if (!firstNameRegex) return null
    const m = text.match(firstNameRegex)
    if (!m) return null
    const first = m[1].toLowerCase()
    return people.find((p) => p.name.split(' ')[0].toLowerCase() === first) ?? null
  }

  function handleSubmit(e) {
    e.preventDefault()
    const title = value.trim()
    if (!title) return

    const pic = detectPic(title)
    setValue('') // clear immediately for snappy feel

    createTask.mutate({
      title,
      pic_id: pic?.id ?? null,
      source: 'Quick entry',
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3"
    >
      <i className="ti ti-sparkles text-info text-lg" />
      <input
        id="quick-entry-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Type a task and press Enter — try "Asbert to confirm board agenda" · "/" focuses this input`}
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-text-3 min-w-0"
        autoComplete="off"
      />
    </form>
  )
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
