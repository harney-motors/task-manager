// Service worker registration. Registers /sw.js at the root scope and
// wires a postMessage listener so the SW can ask the app to open a
// specific task when a notification is clicked.

let registration = null

export async function ensureServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null
  }
  if (registration) return registration
  try {
    registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    })
    return registration
  } catch (err) {
    console.warn('[sw] registration failed', err)
    return null
  }
}

// Subscribes to messages from the SW. Returns an unsubscribe function.
// Used by the app shell to open the relevant task when a notification
// is clicked.
export function onServiceWorkerMessage(handler) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }
  function listener(event) {
    if (event.data?.type?.startsWith('tickd:')) handler(event.data)
  }
  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}
