// Scheduled function — daily 17:30 AST. 21:30 UTC.
// End-of-day recap: what got done, what's slipping into tomorrow.

import { runNudges } from '../lib/nudgeRunner.mjs'

export default async () => {
  const result = await runNudges({ slot: 'eod' })
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export const config = {
  schedule: '30 21 * * *',
}
