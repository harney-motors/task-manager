import { supabase } from '../lib/supabase'

// Fire-and-forget call to the notify-mention Netlify function.
// We don't block UI on this — the comment is already saved by the
// time we get here, and any SMTP slowness/failure should never make
// the user wait. Errors are logged for triage.
export async function notifyMention(entryId) {
  if (!entryId) return
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/.netlify/functions/notify-mention', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ entry_id: entryId }),
    })
  } catch (err) {
    console.warn('[notify-mention] failed (non-blocking)', err)
  }
}
