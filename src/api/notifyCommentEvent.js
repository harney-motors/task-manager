import { supabase } from '../lib/supabase'

// Fire-and-forget notification for the two new comment events that
// don't already go through @mention emails:
//
//   - 'reply':    user posted a reply to someone else's comment
//   - 'reaction': user added an emoji reaction to someone else's comment
//
// The server resolves the recipient (the original comment's author),
// composes the right email template, and ships via Resend.
//
// `entryId` is the TARGET comment (the one whose author is being
// notified). For 'reply', that's the parent comment id; for
// 'reaction', that's the comment being reacted to.
//
// `kind`: 'reply' | 'reaction'
// `extra` (reaction only): { emoji: '👍' }
export async function notifyCommentEvent(entryId, kind, extra = {}) {
  if (!entryId || !kind) return
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      console.warn('[notify-comment-event] no session — skip')
      return
    }
    const res = await fetch('/.netlify/functions/notify-comment-event', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        target_entry_id: entryId,
        kind,
        ...extra,
      }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      console.warn(`[notify-comment-event] server ${res.status}`, json)
      return
    }
    console.log('[notify-comment-event] response', json)
  } catch (err) {
    console.warn('[notify-comment-event] failed (non-blocking)', err)
  }
}
