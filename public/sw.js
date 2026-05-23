// Tickd service worker.
// Scope: app root ('/'). Registered in src/lib/registerSw.js.
//
// Responsibilities (Phase 9.2):
//   - Receive web-push events and surface them as native notifications.
//   - On notification click, open / focus the relevant task in the app.
//
// We deliberately don't ship offline caching here yet — Tickd is
// fully online and a stale cache would create stale-data confusion
// in a task tool. Add a cache layer later if/when we want offline
// reads.

self.addEventListener('install', (event) => {
  // Activate immediately so the first push works without a reload.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Tickd', body: event.data?.text() ?? '' }
  }

  const title = payload.title || 'Tickd'
  const options = {
    body: payload.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.tag || undefined, // dedupes notifications by tag
    data: {
      url: payload.url || '/',
      taskId: payload.task_id || null,
    },
    // Vibrate is iOS/Android only and silently ignored elsewhere.
    vibrate: payload.urgent ? [120, 60, 120] : [50],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      // Prefer an existing focused tab on our origin.
      for (const client of allClients) {
        const url = new URL(client.url)
        if (url.origin === self.location.origin) {
          await client.focus()
          // Pass the target so the app can open the relevant task.
          client.postMessage({
            type: 'tickd:open-notification',
            url: targetUrl,
            taskId: event.notification.data?.taskId ?? null,
          })
          return
        }
      }
      // Otherwise open a new window.
      await self.clients.openWindow(targetUrl)
    })(),
  )
})
