import { supabase } from '../lib/supabase'

// Add an edge: blocker BLOCKS blocked.
export async function addDependency(blockerId, blockedId) {
  const { error } = await supabase
    .from('task_dependencies')
    .insert({ blocker_id: blockerId, blocked_id: blockedId })
  if (error) throw error
}

export async function removeDependency(blockerId, blockedId) {
  const { error } = await supabase
    .from('task_dependencies')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
  if (error) throw error
}

// For a single task, return its incoming + outgoing edges with the
// related task info needed to render chips.
export async function fetchTaskDependencies(taskId) {
  // Incoming (this task is blocked by these blockers)
  const { data: blockedByRows, error: e1 } = await supabase
    .from('task_dependencies')
    .select(
      'blocker_id, blocker:tasks!task_dependencies_blocker_id_fkey(id, title, status)',
    )
    .eq('blocked_id', taskId)
  if (e1) throw e1
  // Outgoing (this task blocks these)
  const { data: blocksRows, error: e2 } = await supabase
    .from('task_dependencies')
    .select(
      'blocked_id, blocked:tasks!task_dependencies_blocked_id_fkey(id, title, status)',
    )
    .eq('blocker_id', taskId)
  if (e2) throw e2
  return {
    blockedBy: (blockedByRows ?? []).map((r) => r.blocker).filter(Boolean),
    blocks: (blocksRows ?? []).map((r) => r.blocked).filter(Boolean),
  }
}

// Workspace-wide blocker map: for each task with at least one OPEN
// blocker (status != 'Done'), the count. Used by CalendarView / GridView
// to gray-out blocked tasks.
export async function fetchWorkspaceBlockerMap(workspaceId) {
  // Pull all edges where the blocked task is in this workspace AND
  // the blocker isn't Done.
  const { data, error } = await supabase
    .from('task_dependencies')
    .select(`
      blocked_id,
      blocker:tasks!task_dependencies_blocker_id_fkey(id, status, workspace_id)
    `)
  if (error) throw error
  const map = new Map() // blocked_id -> open blocker count
  for (const row of data ?? []) {
    if (!row.blocker) continue
    if (row.blocker.workspace_id !== workspaceId) continue
    if (row.blocker.status === 'Done') continue
    map.set(row.blocked_id, (map.get(row.blocked_id) ?? 0) + 1)
  }
  return map
}
