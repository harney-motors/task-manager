import { supabase } from '../lib/supabase'
import { ensureServiceWorker } from '../lib/registerSw'

// VAPID public key comes from the Vite build env (VITE_-prefixed so
// it ships in the client bundle; the matching private key stays
// server-side in Netlify env).
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// ---------- Capability checks ----------

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

// iOS Safari only supports Web Push when the PWA is added to the
// home screen and launched in standalone mode. Surface this so the
// UI can prompt instead of showing a button that does nothing.
export function pushAvailableHere() {
  if (!pushSupported()) return { supported: false, reason: 'unsupported' }
  if (!VAPID_PUBLIC_KEY)
    return { supported: false, reason: 'no_vapid_key' }
  const ua = navigator.userAgent || ''
  const isIos = /iPad|iPhone|iPod/.test(ua)
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  if (isIos && !isStandalone) {
    return { supported: false, reason: 'ios_needs_pwa' }
  }
  return { supported: true }
}

// ---------- Subscribe / unsubscribe ----------

export async function subscribePush(preferences) {
  const reg = await ensureServiceWorker()
  if (!reg) throw new Error('Service worker not available')
  if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY not set')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications blocked. Allow them in your browser settings and try again.'
        : 'Notifications not enabled.',
    )
  }

  // Reuse the existing browser subscription if there is one; otherwise
  // ask the PushManager for a new one tied to our VAPID key.
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const json = sub.toJSON()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  // Upsert by (user_id, endpoint) so reconnecting devices don't
  // accumulate duplicate rows.
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        ...(preferences ? { preferences } : {}),
      },
      { onConflict: 'user_id,endpoint' },
    )
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function unsubscribePush() {
  const reg = await ensureServiceWorker()
  const sub = await reg?.pushManager.getSubscription()
  const endpoint = sub?.endpoint
  if (sub) await sub.unsubscribe()

  if (endpoint) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
  }
}

export async function fetchMyPushSubscriptions() {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function updatePushPreferences(subscriptionId, preferences) {
  const { error } = await supabase
    .from('push_subscriptions')
    .update({ preferences })
    .eq('id', subscriptionId)
  if (error) throw error
}

// ---------- Helpers ----------

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}
