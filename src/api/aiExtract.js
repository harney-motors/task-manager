import { supabase } from '../lib/supabase'

export async function extractTasksFromTranscript(transcript) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch('/.netlify/functions/extract-tasks', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ transcript }),
  })

  if (!res.ok) {
    let msg = `Extraction failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      // body wasn't JSON
    }
    throw new Error(msg)
  }

  return res.json()
}
