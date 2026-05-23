// Scheduled function — daily 13:00 AST. 17:00 UTC.
// Afternoon check-in: what's still open, anything slipping.

import { runNudges } from '../lib/nudgeRunner.mjs'

export default async () => {
  const result = await runNudges({ slot: 'afternoon' })
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export const config = {
  schedule: '0 17 * * *',
}
