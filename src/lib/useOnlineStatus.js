import { useEffect, useState } from 'react'

// Track the browser's online/offline status. Returns one of:
//   'online'        — navigator.onLine is true (steady state)
//   'offline'       — navigator.onLine is false; mutations are paused
//   'reconnected'   — transient state for 2.5s after coming back online,
//                     so the UI can flash a "back online" confirmation
//                     and then settle back to 'online'
//
// `navigator.onLine` is the only signal browsers give us, and it's
// imperfect: it can lie (says online when DNS is broken) — but for
// the explicit "no network at all" case (airplane mode, lock screen
// kills cell) it's reliable enough to be useful.
export function useOnlineStatus() {
  const [status, setStatus] = useState(() =>
    typeof navigator === 'undefined' || navigator.onLine ? 'online' : 'offline',
  )

  useEffect(() => {
    function handleOnline() {
      setStatus('reconnected')
      const t = setTimeout(() => setStatus('online'), 2500)
      // Stash the timer so a subsequent offline event can clear it.
      handleOnline._timer = t
    }
    function handleOffline() {
      if (handleOnline._timer) clearTimeout(handleOnline._timer)
      setStatus('offline')
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (handleOnline._timer) clearTimeout(handleOnline._timer)
    }
  }, [])

  return status
}
