import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useCreateTask, usePeople } from '../lib/queries'
import { useDictation } from '../lib/useDictation'
import { detectPic } from '../lib/detectPic'
import { picPill, picDot } from '../lib/colors'
import { useToast } from './Toast'

// `onSubmitted` (optional) — fired after a task is queued. Lets the
// QuickEntry sheet auto-dismiss on mobile after the user adds a task.
export default function QuickEntry({ onSubmitted }) {
  const { user } = useAuth()
  const { data: people = [] } = usePeople()
  const createTask = useCreateTask()
  const [value, setValue] = useState('')
  // overridePicId: null = use detected, undefined = use detected (initial),
  // 'unassigned' = force unassigned, '<id>' = explicit pick
  const [override, setOverride] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const showToast = useToast()
  const pickerRef = useRef(null)

  // Voice input: appends each final transcript chunk to the input.
  const dict = useDictation({
    onResult: (chunk) => {
      const trimmed = chunk.trim()
      if (!trimmed) return
      setValue((prev) => (prev ? `${prev.trimEnd()} ${trimmed}` : trimmed))
    },
  })

  // Self-person lookup so the detector can resolve "I'll" / recipient-
  // only patterns to the current user when they're linked.
  const selfPersonId = useMemo(() => {
    if (!user?.id) return null
    const me = people.find((p) => p.user_id === user.id)
    return me?.id ?? null
  }, [user?.id, people])

  // Positional detector — see src/lib/detectPic.js for the rules.
  const detected = useMemo(
    () => detectPic(value, people, { selfPersonId }),
    [value, people, selfPersonId],
  )

  // Effective PIC: override beats detection. 'unassigned' explicitly
  // cleared = no PIC. null/undefined override = use detection.
  const effectivePic = useMemo(() => {
    if (override === 'unassigned') return null
    if (override) return people.find((p) => p.id === override) ?? null
    return detected.person
  }, [override, detected.person, people])

  // Close the picker on outside click / Esc
  useEffect(() => {
    if (!pickerOpen) return
    function onDown(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false)
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  function handleSubmit(e) {
    e.preventDefault()
    const title = value.trim()
    if (!title) return
    setValue('')
    setOverride(null)
    setPickerOpen(false)
    createTask.mutate({
      title,
      pic_id: effectivePic?.id ?? null,
      source: 'Quick entry',
    })
    onSubmitted?.()
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

  const inputDisplay =
    dict.listening && dict.interim
      ? `${value}${value ? ' ' : ''}${dict.interim}`
      : value

  return (
    <div className="bg-surface border border-border rounded-xl px-4 pt-3 pb-2">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-3"
      >
        <i className="ti ti-sparkles text-info text-lg flex-shrink-0" />
        <input
          id="quick-entry-input"
          type="text"
          value={inputDisplay}
          onChange={(e) => {
            if (dict.listening) return
            setValue(e.target.value)
            setOverride(null) // typing fresh → re-evaluate detection
          }}
          placeholder={
            dict.listening
              ? 'Listening… speak your task'
              : 'Type a task and press Enter — "/" focuses this input'
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

      {/* PIC preview / override row. Only shows once the user has
          typed something meaningful so the input isn't visually
          crowded at rest. */}
      {value.trim().length > 0 && (
        <div className="flex items-center gap-2 mt-1.5 text-[11px] pl-7 relative">
          <span className="text-text-3">PIC</span>
          <button
            ref={pickerRef}
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-1.5 py-0.5 hover:bg-surface-2"
            title="Click to change PIC"
          >
            {effectivePic ? (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-px rounded ${picPill(effectivePic.color)}`}
              >
                {effectivePic.name.split(' ')[0]}
              </span>
            ) : (
              <span className="text-text-3">Unassigned</span>
            )}
            {/* Confidence hint when using the detector's answer */}
            {!override && detected.person && (
              <span className="text-[10px] text-text-3">
                {detected.confidence === 'high'
                  ? 'detected'
                  : detected.confidence === 'medium'
                    ? 'best guess'
                    : 'unsure'}
              </span>
            )}
            <i className="ti ti-chevron-down text-[10px] text-text-3" />
          </button>

          {pickerOpen && (
            <div
              ref={pickerRef}
              className="absolute top-full left-7 mt-1 bg-surface border border-border rounded-md shadow-lg min-w-[200px] max-h-72 overflow-y-auto py-1 z-30"
            >
              <button
                type="button"
                onClick={() => {
                  setOverride('unassigned')
                  setPickerOpen(false)
                }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-surface-2 text-text-3"
              >
                Unassigned
              </button>
              <div className="border-t border-border my-1" />
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setOverride(p.id)
                    setPickerOpen(false)
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-surface-2 inline-flex items-center gap-2"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${picDot(p.color)} flex-shrink-0`}
                  />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
