import { supabase } from '../lib/supabase'

// `options` is the pre-flight selection from the modal:
//   scope:  'mine' | 'team'
//   period: 'today' | 'yesterday-today'
//   tone:   'brief' | 'detailed'
//   format: 'markdown' | 'plain'
// All optional — server falls back to ('mine' / 'today' / 'brief' / 'markdown').
export async function generateStandup(workspaceId, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')
  if (!workspaceId) throw new Error('No active workspace')

  const res = await fetch('/.netlify/functions/generate-standup', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      workspace_id: workspaceId,
      scope: options.scope,
      period: options.period,
      tone: options.tone,
      format: options.format,
    }),
  })
  if (!res.ok) {
    let msg = `Standup failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      // body wasn't JSON
    }
    throw new Error(msg)
  }
  return res.json() // { markdown }
}
