import { supabase } from '../lib/supabase'

export async function nlFilter(query, { workspaceId } = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')
  if (!workspaceId) throw new Error('No active workspace')

  const res = await fetch('/.netlify/functions/nl-filter', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ query, workspace_id: workspaceId }),
  })

  if (!res.ok) {
    let msg = `Filter generation failed (${res.status})`
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
