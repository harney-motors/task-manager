import { supabase } from '../lib/supabase'

// Two-mode wrapper for the duplicate-detection Netlify function.
//
// `mode: 'new-task'` — pass `newTaskId`. Server compares it against
//                       the rest of the PIC's open tasks; returns at
//                       most one pair. Fires right after a task
//                       creates (debounced + non-blocking).
//
// `mode: 'batch'`    — server scans every open task for the PIC and
//                       returns all suspected duplicate pairs.
//                       Fires from the "Scan for duplicates" button
//                       in the PIC view.
//
// Returns: { pairs, total_scanned, hit_cap }
export async function checkDuplicates({ mode, workspaceId, picId, newTaskId }) {
  if (!workspaceId) throw new Error('workspaceId is required')
  if (!picId) throw new Error('picId is required')
  if (mode !== 'new-task' && mode !== 'batch') {
    throw new Error('mode must be "new-task" or "batch"')
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')
  const res = await fetch('/.netlify/functions/check-duplicates', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      mode,
      workspace_id: workspaceId,
      pic_id: picId,
      new_task_id: newTaskId ?? null,
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(json?.error ?? `check-duplicates failed (${res.status})`)
  }
  return json
}

// Persist a "these are NOT duplicates, keep both" decision so future
// scans skip the pair. The pair is normalised to canonical order
// (smaller id first) on both client + server so the DB unique constraint
// always matches.
export async function dismissDuplicatePair({ workspaceId, taskAId, taskBId }) {
  if (!workspaceId || !taskAId || !taskBId) {
    throw new Error('workspaceId + taskAId + taskBId are all required')
  }
  const [a, b] = taskAId < taskBId ? [taskAId, taskBId] : [taskBId, taskAId]
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { error } = await supabase
    .from('task_duplicate_dismissals')
    .upsert(
      {
        workspace_id: workspaceId,
        task_a_id: a,
        task_b_id: b,
        dismissed_by: user.id,
      },
      { onConflict: 'task_a_id,task_b_id' },
    )
  if (error) throw error
}
