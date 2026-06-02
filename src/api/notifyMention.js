import { supabase } from '../lib/supabase'

// Fire-and-forget call to the notify-mention Netlify function.
// We don't block UI on this — the comment is already saved by the
// time we get here, and any SMTP slowness/failure should never make
// the user wait. Errors + responses are logged so a missing email
// can be diagnosed from the browser console / Netlify logs.
export async function notifyMention(entryId) {
  if (!entryId) return
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      console.warn('[notify-mention] no session — skip')
      return
    }
    const res = await fetch('/.netlify/functions/notify-mention', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ entry_id: entryId }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      console.warn(`[notify-mention] server ${res.status}`, json)
      return
    }
    console.log('[notify-mention] response', json)
  } catch (err) {
    console.warn('[notify-mention] failed (non-blocking)', err)
  }
}
