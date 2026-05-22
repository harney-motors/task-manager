import { useCallback, useEffect, useRef, useState } from 'react'

// Thin wrapper over the Web Speech API (SpeechRecognition). Free,
// on-device on Safari/iOS, network-backed on Chrome. Firefox doesn't
// implement it — `supported` is false there and the caller should
// hide the mic button.
//
// Usage:
//   const { supported, listening, transcript, interim, start, stop, error }
//     = useDictation()
//   ...
//   <button onClick={listening ? stop : start} disabled={!supported}>
//
// onResult callback (if passed) fires for each final-result segment with
// the spoken text. Use it to append to an input field as the user speaks.
export function useDictation({ lang = 'en-US', interimResults = true, onResult } = {}) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('') // accumulated final text
  const [interim, setInterim] = useState('') // currently-being-spoken
  const [error, setError] = useState(null)

  const recRef = useRef(null)
  const supportedRef = useRef(
    typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition),
  )

  const stop = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      // already stopped
    }
  }, [])

  const start = useCallback(() => {
    if (!supportedRef.current) {
      setError('Speech recognition not supported in this browser')
      return
    }
    setError(null)
    setTranscript('')
    setInterim('')

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new Ctor()
    rec.lang = lang
    rec.interimResults = interimResults
    rec.continuous = true

    rec.onresult = (e) => {
      let finalChunk = ''
      let interimChunk = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalChunk += r[0].transcript
        else interimChunk += r[0].transcript
      }
      if (finalChunk) {
        setTranscript((prev) => prev + finalChunk)
        if (onResult) onResult(finalChunk)
      }
      setInterim(interimChunk)
    }

    rec.onerror = (e) => {
      // 'no-speech' is normal when the user stops talking — don't surface
      if (e.error === 'no-speech') return
      setError(
        e.error === 'not-allowed'
          ? 'Microphone permission denied. Allow it in your browser settings.'
          : e.error === 'audio-capture'
            ? 'No microphone found.'
            : `Speech error: ${e.error}`,
      )
    }

    rec.onend = () => {
      setListening(false)
      setInterim('')
    }

    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch (err) {
      setError(err.message ?? String(err))
    }
  }, [lang, interimResults, onResult])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop()
      } catch {
        // ignore
      }
    }
  }, [])

  return {
    supported: !!supportedRef.current,
    listening,
    transcript,
    interim,
    error,
    start,
    stop,
  }
}
