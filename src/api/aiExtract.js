import { supabase } from '../lib/supabase'

// Start an extraction job:
//   1. Insert a pending ai_extraction_jobs row with the transcript.
//   2. Fire-and-forget POST to the background function with the job id.
//      Netlify returns 202 immediately — the function keeps running for
//      up to 15 min and writes the result back to the row.
// Returns the job id; caller polls until the row updates.
export async function startExtractionJob({ transcript, workspaceId }) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const { data: row, error: insertErr } = await supabase
    .from('ai_extraction_jobs')
    .insert({
      user_id: session.user.id,
      workspace_id: workspaceId,
      transcript,
      status: 'pending',
    })
    .select('id')
    .single()
  if (insertErr) throw insertErr

  // Kick off the background function. Netlify returns 202; we don't
  // wait for the function to complete (it'll run for 5-40s).
  fetch('/.netlify/functions/extract-tasks-background', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ job_id: row.id }),
  }).catch((err) => {
    // Network glitch firing the background function; the row stays
    // pending and the caller's poll will time out. Surface to logs.
    console.warn('[startExtractionJob] background trigger failed', err)
  })

  return row.id
}

// Poll the job row until status leaves 'pending', or until timeout/abort.
// Returns the final row. Throws on timeout or abort.
export async function pollExtractionJob(jobId, { signal, intervalMs = 2000, timeoutMs = 120000 } = {}) {
  const started = Date.now()
  // small initial delay so the first poll doesn't fire before the
  // background function has had a chance to update anything
  await wait(800, signal)
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        'Extraction is taking longer than expected. Check back in a moment or try a shorter transcript.',
      )
    }
    const { data: row, error } = await supabase
      .from('ai_extraction_jobs')
      .select('id, status, result, error, completed_at')
      .eq('id', jobId)
      .single()
    if (error) throw error
    if (row.status === 'completed' || row.status === 'failed') return row
    await wait(intervalMs, signal)
  }
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// Backward-compat helper for callers that want the one-shot promise.
export async function extractTasksFromTranscript(transcript, { workspaceId, signal } = {}) {
  if (!workspaceId) throw new Error('workspaceId is required')
  const jobId = await startExtractionJob({ transcript, workspaceId })
  const row = await pollExtractionJob(jobId, { signal })
  if (row.status === 'failed') {
    throw new Error(row.error ?? 'Extraction failed')
  }
  return row.result ?? { tasks: [] }
}
