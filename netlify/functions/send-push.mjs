// Netlify Function — sends a web-push notification to one or more
// users. Two ways to call:
//
// 1) Authenticated end-user (Bearer JWT). They can only target
//    themselves — useful for a "test notification" button.
//
// 2) Service-to-service (X-Service-Key matches PUSH_SERVICE_KEY env).
//    Can target any user_ids in the body. Used by other Netlify
//    functions (e.g. nudge runner, digest sender) to fan out pushes.
//
// Body shape:
//   {
//     user_ids: ["uuid", ...],          // required when service auth
//     trigger:  "assigned_to_me" | ... // matches push_subscriptions.preferences key
//     payload:  { title, body, url?, task_id?, tag?, urgent? }
//   }
//
// Required env (Functions scope):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (service role to read all subscriptions)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:)
//   PUSH_SERVICE_KEY  (random long string; gate for service-to-service calls)

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'
const PUSH_SERVICE_KEY = process.env.PUSH_SERVICE_KEY

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonError(500, 'Server missing VAPID keys')
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError(500, 'Server missing SUPABASE_SERVICE_ROLE_KEY')
  }

  let body
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Invalid JSON body')
  }

  const trigger = String(body?.trigger ?? '').trim() || null
  const payload = body?.payload ?? {}
  if (!payload.title && !payload.body) {
    return jsonError(400, 'payload.title or payload.body required')
  }

  // ---------- Resolve target user_ids ----------
  let userIds = []
  const serviceHeader = req.headers.get('x-service-key')
  const isService =
    PUSH_SERVICE_KEY && serviceHeader && serviceHeader === PUSH_SERVICE_KEY

  if (isService) {
    if (!Array.isArray(body?.user_ids) || body.user_ids.length === 0) {
      return jsonError(400, 'user_ids required for service caller')
    }
    userIds = body.user_ids.map(String)
  } else {
    // End-user auth path: only allowed to ping self.
    const authHeader =
      req.headers.get('authorization') ?? req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError(401, 'Missing bearer token')
    }
    const jwt = authHeader.slice('Bearer '.length).trim()
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: userErr } =
      await userClient.auth.getUser(jwt)
    if (userErr || !userData?.user) return jsonError(401, 'Invalid token')
    userIds = [userData.user.id]
  }

  // ---------- Load subscriptions, filtered by trigger ----------
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: subs, error: subsErr } = await adminClient
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, preferences')
    .in('user_id', userIds)
  if (subsErr) return jsonError(500, subsErr.message)

  const targetSubs = (subs ?? []).filter((s) => {
    if (!trigger) return true
    return s.preferences?.[trigger] !== false // default-on if key missing
  })

  // ---------- Send ----------
  const results = await Promise.allSettled(
    targetSubs.map((s) =>
      webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        JSON.stringify(payload),
      ),
    ),
  )

  // Reap dead subscriptions (404 / 410 = endpoint expired)
  const deadIds = []
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const status = r.reason?.statusCode
      if (status === 404 || status === 410) deadIds.push(targetSubs[i].id)
      else console.warn('[send-push] delivery failed', r.reason?.message)
    }
  })
  if (deadIds.length > 0) {
    await adminClient.from('push_subscriptions').delete().in('id', deadIds)
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length
  return new Response(
    JSON.stringify({
      attempted: targetSubs.length,
      sent,
      pruned: deadIds.length,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
