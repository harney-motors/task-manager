// Per-workspace "recently opened tasks" history. Backed by localStorage
// so it survives reloads but stays local — no network, no RLS.
//
// We key by workspace id so switching workspaces gives a clean recent
// list rather than mixing tasks across tenants.

const STORAGE_PREFIX = 'tickd-recent-tasks:'
const MAX_KEEP = 10
const MAX_RETURN = 5

function key(workspaceId) {
  return `${STORAGE_PREFIX}${workspaceId}`
}

function read(workspaceId) {
  if (!workspaceId || typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(key(workspaceId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(workspaceId, entries) {
  if (!workspaceId || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key(workspaceId), JSON.stringify(entries))
  } catch {
    // localStorage may be full or blocked — fail silently
  }
}

// Record an opened task. We store id + title + a few display fields
// so the palette can render the row without re-querying.
export function recordRecentTask(workspaceId, task) {
  if (!task?.id) return
  const entry = {
    id: task.id,
    title: task.title || '(untitled)',
    pic_name: task.pic?.name ?? null,
    pic_color: task.pic?.color ?? null,
    opened_at: new Date().toISOString(),
  }
  const current = read(workspaceId)
  // Move-to-front: drop any existing entry with the same id, then prepend.
  const deduped = current.filter((e) => e.id !== entry.id)
  const next = [entry, ...deduped].slice(0, MAX_KEEP)
  write(workspaceId, next)
}

// Return up to MAX_RETURN most recent.
export function getRecentTasks(workspaceId) {
  return read(workspaceId).slice(0, MAX_RETURN)
}

// Drop any entries for tasks that no longer exist (called e.g. when
// the palette opens and we have a fresh tasks list to validate against).
export function pruneRecentTasks(workspaceId, validTaskIds) {
  const current = read(workspaceId)
  const valid = new Set(validTaskIds)
  const next = current.filter((e) => valid.has(e.id))
  if (next.length !== current.length) write(workspaceId, next)
  return next.slice(0, MAX_RETURN)
}
