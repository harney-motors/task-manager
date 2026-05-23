import { useEffect, useState } from 'react'
import {
  fetchMyPushSubscriptions,
  pushAvailableHere,
  pushSupported,
  subscribePush,
  unsubscribePush,
  updatePushPreferences,
} from '../api/push'
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
  const showToast = useToast()

  useEffect(() => {
    setAvailability(pushAvailableHere())
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const rows = await fetchMyPushSubscriptions()
      setSubs(rows)
    } catch (err) {
      console.warn('[push] fetch failed', err)
    } finally {
      setLoading(false)
    }
  }

  // Treat preferences as a single shared state across all of THIS
  // user's subscriptions — simpler than per-device UI. If they want
  // device-specific tuning later, the schema's already there.
  const activeSub = subs[0] ?? null
  const enabled = !!activeSub
  const prefs = activeSub?.preferences ?? {
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
    if (!activeSub) return
    const nextPrefs = { ...prefs, [id]: value }
    // Optimistic UI
    setSubs((prev) =>
      prev.map((s) =>
        s.id === activeSub.id ? { ...s, preferences: nextPrefs } : s,
      ),
    )
    try {
      // Apply the same preferences to every device for this user
      // so toggling here is consistent across phone/desktop.
      await Promise.all(
        subs.map((s) => updatePushPreferences(s.id, nextPrefs)),
      )
    } catch (err) {
      showToast(err.message ?? 'Could not save preference', { type: 'error' })
      refresh()
    }
  }

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

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">Push notifications</div>
          <p className="text-xs text-text-2 mt-1">
            Get pinged on this device when tasks need your attention. You
            can fine-tune what triggers a notification below.
          </p>
        </div>
        {enabled ? (
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
            Enable notifications
          </button>
        )}
      </div>

      {enabled && (
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
            Pings this device. Confirms the VAPID keys, service worker,
            and permission are all wired up.
          </p>
        </div>
      )}

      {loading ? null : enabled ? (
        <div className="pt-3 border-t border-border space-y-1">
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
          Enable to choose which events fire a notification.
        </div>
      )}

      {subs.length > 1 && (
        <div className="text-[11px] text-text-3 pt-2 border-t border-border">
          Tickd has push enabled on {subs.length} device
          {subs.length === 1 ? '' : 's'} for this account. Preferences apply
          to all of them.
        </div>
      )}
    </div>
  )
}
