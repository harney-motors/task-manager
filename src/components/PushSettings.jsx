import { useEffect, useState } from 'react'
import {
  fetchMyPushSubscriptions,
  pushAvailableHere,
  pushSupported,
  subscribePush,
  unsubscribePush,
  updatePushPreferences,
} from '../api/push'
import { ensureServiceWorker } from '../lib/registerSw'
import { supabase } from '../lib/supabase'
import { sendSelfPush } from '../api/notify'
import { useToast } from './Toast'

const TRIGGERS = [
  {
    id: 'assigned_to_me',
    label: 'Assigned to me',
    sub: 'Get pinged when a task is set to you as PIC.',
  },
  {
    id: 'due_soon',
    label: 'Due within 24h',
    sub: "Reminder for tasks you own that haven't moved.",
  },
  {
    id: 'watched_changed',
    label: 'Watched task changed',
    sub: 'Status, due, or PIC change on a task you watch.',
  },
  {
    id: 'journal_mention',
    label: 'Journal mention',
    sub: 'Another user adds a note on a task you own or watch.',
  },
  {
    id: 'daily_digest',
    label: 'Daily digest',
    sub: 'Morning · afternoon · end-of-day rollup. Quiet days stay quiet.',
  },
]

export default function PushSettings() {
  const [availability, setAvailability] = useState({ supported: false })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [subs, setSubs] = useState([])
  // Endpoint of *this device's* current PushSubscription, or null. We
  // compare DB rows against this to determine local enabled-ness.
  const [localEndpoint, setLocalEndpoint] = useState(null)
  const showToast = useToast()

  useEffect(() => {
    setAvailability(pushAvailableHere())
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const reg = await ensureServiceWorker()
      const localSub = await reg?.pushManager.getSubscription().catch(() => null)
      setLocalEndpoint(localSub?.endpoint ?? null)

      const rows = await fetchMyPushSubscriptions()
      setSubs(rows)
    } catch (err) {
      console.warn('[push] fetch failed', err)
    } finally {
      setLoading(false)
    }
  }

  const localSubRow = localEndpoint
    ? subs.find((s) => s.endpoint === localEndpoint)
    : null
  const enabledHere = !!localSubRow
  const otherDeviceCount = subs.filter(
    (s) => s.endpoint !== localEndpoint,
  ).length

  // Preferences shown reflect the local device when subscribed; if
  // not subscribed here, fall back to defaults so the panel still
  // shows the available triggers.
  const prefs = localSubRow?.preferences ?? {
    assigned_to_me: true,
    due_soon: true,
    watched_changed: true,
    journal_mention: true,
    daily_digest: false,
  }

  async function handleEnable() {
    setBusy(true)
    try {
      await subscribePush()
      await refresh()
      showToast('Notifications enabled on this device.')
    } catch (err) {
      showToast(err.message ?? 'Could not enable notifications', {
        type: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    setBusy(true)
    try {
      await unsubscribePush()
      // Safety net: if for any reason the local PushManager had no
      // subscription but the DB row exists for this endpoint (we
      // can hit this when the browser revokes the sub independently
      // while the row persists), delete the matching DB row too.
      if (localSubRow) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('id', localSubRow.id)
      }
      await refresh()
      showToast('Notifications turned off on this device.')
    } catch (err) {
      showToast(err.message ?? 'Could not disable notifications', {
        type: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveOtherDevice(subId) {
    if (!confirm('Stop sending notifications to that device?')) return
    setBusy(true)
    try {
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('id', subId)
      if (error) throw error
      await refresh()
      showToast('Device removed.')
    } catch (err) {
      showToast(err.message ?? 'Could not remove device', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleTest() {
    setBusy(true)
    try {
      await sendSelfPush({
        trigger: null, // bypass per-trigger gating so the test always fires
        title: 'Tickd test notification',
        body: 'If you see this, push is wired correctly. 🎉',
        tag: 'tickd:test',
      })
      showToast('Test sent. Watch for the notification…')
    } catch (err) {
      showToast(err.message ?? 'Could not send test', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleTrigger(id, value) {
    if (!localSubRow) return
    const nextPrefs = { ...prefs, [id]: value }
    // Optimistic UI
    setSubs((prev) =>
      prev.map((s) =>
        s.id === localSubRow.id ? { ...s, preferences: nextPrefs } : s,
      ),
    )
    try {
      // Only update the local device's prefs. Per-device tuning later
      // can be added; for now keep cross-device behaviour predictable.
      await updatePushPreferences(localSubRow.id, nextPrefs)
    } catch (err) {
      showToast(err.message ?? 'Could not save preference', { type: 'error' })
      refresh()
    }
  }

  // ---------- Render ----------

  if (!pushSupported()) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="text-sm font-medium mb-2">Push notifications</div>
        <p className="text-xs text-text-2">
          This browser doesn&rsquo;t support web push. Try Chrome, Edge, or
          Safari 16.4+ (with Tickd installed as a home-screen app on iOS).
        </p>
      </div>
    )
  }

  if (!availability.supported) {
    if (availability.reason === 'ios_needs_pwa') {
      return (
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-sm font-medium mb-2">Push notifications</div>
          <p className="text-xs text-text-2">
            On iOS, push notifications only work after you add Tickd to your
            home screen and open it from there. Tap the Share button in
            Safari → <span className="font-medium">Add to Home Screen</span>,
            then re-open Tickd from the home icon and revisit this page.
          </p>
        </div>
      )
    }
    if (availability.reason === 'no_vapid_key') {
      return (
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-sm font-medium mb-2">Push notifications</div>
          <p className="text-xs text-text-2">
            Push isn&rsquo;t configured for this environment yet. The site
            owner needs to set <code>VITE_VAPID_PUBLIC_KEY</code>.
          </p>
        </div>
      )
    }
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="text-sm font-medium mb-2">Push notifications</div>
        <p className="text-xs text-text-2">
          Push notifications aren&rsquo;t available in this browser.
        </p>
      </div>
    )
  }

  const otherDevices = subs.filter((s) => s.endpoint !== localEndpoint)

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">Push notifications</div>
          <p className="text-xs text-text-2 mt-1">
            Get pinged on this device when tasks need your attention. Each
            device subscribes separately — enabling on desktop won&rsquo;t
            enrol your phone.
          </p>
        </div>
        {enabledHere ? (
          <button
            onClick={handleDisable}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface-2 text-text-2 hover:text-text disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <i className="ti ti-bell-off text-sm" />
            Turn off on this device
          </button>
        ) : (
          <button
            onClick={handleEnable}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <i className="ti ti-bell text-sm" />
            Enable on this device
          </button>
        )}
      </div>

      {enabledHere && (
        <div className="pt-3 border-t border-border">
          <button
            onClick={handleTest}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface-2 text-text-2 hover:text-text disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <i className="ti ti-send text-sm" />
            Send test notification
          </button>
          <p className="text-[11px] text-text-3 mt-1.5">
            Pings this device. Confirms the VAPID keys, service worker, and
            permission are all wired up.
          </p>
        </div>
      )}

      {loading ? null : enabledHere ? (
        <div className="pt-3 border-t border-border space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-text-3 mb-1">
            Triggers (this device)
          </div>
          {TRIGGERS.map((t) => (
            <label
              key={t.id}
              className="flex items-start gap-3 py-1.5 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={!!prefs[t.id]}
                onChange={(e) => handleToggleTrigger(t.id, e.target.checked)}
                className="mt-0.5 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm">{t.label}</div>
                <div className="text-[11px] text-text-3">{t.sub}</div>
              </div>
            </label>
          ))}
        </div>
      ) : (
        <div className="pt-3 border-t border-border text-xs text-text-3">
          Tap “Enable on this device” to choose which events fire a
          notification here.
        </div>
      )}

      {otherDevices.length > 0 && (
        <div className="pt-3 border-t border-border">
          <div className="text-[11px] uppercase tracking-wider text-text-3 mb-1.5">
            Other devices ({otherDevices.length})
          </div>
          <ul className="space-y-1">
            {otherDevices.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-text-2">
                    {summariseUserAgent(s.user_agent)}
                  </div>
                  <div className="text-[10px] text-text-3">
                    Added{' '}
                    {new Date(s.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveOtherDevice(s.id)}
                  disabled={busy}
                  className="text-[11px] text-text-3 hover:text-danger-text underline disabled:opacity-50"
                  title="Stop sending notifications to that device"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-text-3 mt-1.5">
            Removing here stops the server from sending to that device. To
            re-enable, open Tickd on that device and tap Enable.
          </p>
        </div>
      )}
    </div>
  )
}

// Best-effort short label for a user-agent string. Web push devices
// don't carry a "device name" so we infer from UA.
function summariseUserAgent(ua) {
  if (!ua) return 'Unknown device'
  // Order matters — match more specific first.
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) {
    if (/Mobile/.test(ua)) return 'Android phone'
    return 'Android tablet'
  }
  if (/Mac OS X/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua))
    return 'Mac · Safari'
  if (/Macintosh/.test(ua)) return 'Mac · Chrome / Edge'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Linux/.test(ua)) return 'Linux'
  return ua.slice(0, 60)
}
