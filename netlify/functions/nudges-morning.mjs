// Scheduled function — daily 07:00 AST (Trinidad/Tobago, UTC-4 no DST).
// 11:00 UTC == 07:00 AST.
//
// Generates the morning brief: priorities for the day, likely
// blockers, stale work worth touching. Skips users with no
// actionable items so quiet days stay quiet.

import { runNudges } from '../lib/nudgeRunner.mjs'

export default async () => {
  const result = await runNudges({ slot: 'morning' })
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export const config = {
  schedule: '0 11 * * *',
}
