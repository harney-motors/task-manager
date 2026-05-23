import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'tickd-theme'

// User-facing preference: light | dark | system. The resolved theme
// applied to <html data-theme="..."> is always 'light' or 'dark'.
function resolve(preference) {
  if (preference === 'light' || preference === 'dark') return preference
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark'
  }
  return 'light'
}

function apply(theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

export function useTheme() {
  // Initial preference: localStorage (set by no-flash init script) or
  // 'system' as default.
  const [preference, setPreferenceState] = useState(() => {
    if (typeof window === 'undefined') return 'system'
    return window.localStorage.getItem(STORAGE_KEY) || 'system'
  })

  const [resolved, setResolved] = useState(() => resolve(preference))

  // Apply preference and listen for system changes when set to 'system'.
  useEffect(() => {
    const next = resolve(preference)
    setResolved(next)
    apply(next)

    if (preference !== 'system' || typeof window === 'undefined') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const sysNext = mq.matches ? 'dark' : 'light'
      setResolved(sysNext)
      apply(sysNext)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((value) => {
    if (!['light', 'dark', 'system'].includes(value)) return
    setPreferenceState(value)
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // localStorage may be blocked (private mode, quota) — fail silently
    }
  }, [])

  return { preference, setPreference, resolved }
}
