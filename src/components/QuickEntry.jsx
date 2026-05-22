import { useMemo, useState } from 'react'
import { useCreateTask, usePeople } from '../lib/queries'
import { useDictation } from '../lib/useDictation'
import { useToast } from './Toast'

export default function QuickEntry() {
  const { data: people = [] } = usePeople()
  const createTask = useCreateTask()
  const [value, setValue] = useState('')
  const showToast = useToast()

  // Voice input: appends each final transcript chunk to the input,
  // separated by spaces so successive utterances build up cleanly.
  const dict = useDictation({
    onResult: (chunk) => {
      const trimmed = chunk.trim()
      if (!trimmed) return
      setValue((prev) => (prev ? `${prev.trimEnd()} ${trimmed}` : trimmed))
    },
  })

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

  function handleMicClick() {
    if (dict.listening) {
      dict.stop()
      return
    }
    if (!dict.supported) {
      showToast(
        'Voice input not supported in this browser. Try Safari or Chrome.',
        { type: 'error' },
      )
      return
    }
    dict.start()
  }

  // Compose what the user sees in the input: settled value + in-flight
  // interim transcript (shown as you speak, before it commits).
  const inputDisplay =
    dict.listening && dict.interim
      ? `${value}${value ? ' ' : ''}${dict.interim}`
      : value

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3"
    >
      <i className="ti ti-sparkles text-info text-lg" />
      <input
        id="quick-entry-input"
        type="text"
        value={inputDisplay}
        onChange={(e) => {
          // While listening, don't let the input fight the interim text
          if (dict.listening) return
          setValue(e.target.value)
        }}
        placeholder={
          dict.listening
            ? 'Listening… speak your task'
            : 'Type a task and press Enter — try "Asbert to confirm board agenda" · "/" focuses this input'
        }
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-text-3 min-w-0"
        autoComplete="off"
      />
      {dict.supported && (
        <button
          type="button"
          onClick={handleMicClick}
          title={dict.listening ? 'Stop listening' : 'Dictate a task'}
          className={`flex-shrink-0 p-1.5 rounded ${
            dict.listening
              ? 'bg-danger-bg text-danger-text animate-pulse'
              : 'text-text-3 hover:text-text hover:bg-surface-2'
          }`}
          aria-label={dict.listening ? 'Stop listening' : 'Start dictation'}
        >
          <i
            className={`ti ${dict.listening ? 'ti-microphone-filled' : 'ti-microphone'} text-base`}
          />
        </button>
      )}
    </form>
  )
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
