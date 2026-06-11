import { supabase } from '../lib/supabase'

export async function fetchJournalEntries(taskId) {
  // Note: ordering matters for thread rendering. Top-level newest-
  // first; replies asc-by-created so they read top→bottom under the
  // parent. The component does the structural grouping.
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const entries = data ?? []
  if (entries.length === 0) return entries

  // Hydrate author_name from the people table. journal_entries.author_id
  // points at auth.users; people.user_id is the bridge. Imported entries
  // have author_id = null and will simply render as unattributed.
  const authorIds = [
    ...new Set(entries.map((e) => e.author_id).filter(Boolean)),
  ]
  const nameByUser = {}
  if (authorIds.length > 0) {
    const { data: peopleData } = await supabase
      .from('people')
      .select('user_id, name')
      .in('user_id', authorIds)
    for (const p of peopleData ?? []) {
      if (p.user_id && !nameByUser[p.user_id]) nameByUser[p.user_id] = p.name
    }
  }

  // Hydrate reactions in a single round-trip. We group by entry +
  // emoji into a compact { emoji, count, user_ids } shape so the UI
  // can render pills without re-aggregating on every render. Wrapped
  // in try/catch so a missing table (phase-31 not yet applied) leaves
  // the comments visible instead of breaking the whole thread.
  const reactionsByEntry = new Map()
  try {
    const { data: reactionRows, error: rxErr } = await supabase
      .from('comment_reactions')
      .select('entry_id, user_id, emoji')
      .in(
        'entry_id',
        entries.map((e) => e.id),
      )
    if (rxErr) {
      console.warn('[comments] reactions fetch failed', rxErr)
    } else {
      for (const r of reactionRows ?? []) {
        if (!reactionsByEntry.has(r.entry_id)) {
          reactionsByEntry.set(r.entry_id, new Map())
        }
        const byEmoji = reactionsByEntry.get(r.entry_id)
        if (!byEmoji.has(r.emoji)) {
          byEmoji.set(r.emoji, { emoji: r.emoji, user_ids: [] })
        }
        byEmoji.get(r.emoji).user_ids.push(r.user_id)
      }
    }
  } catch (err) {
    console.warn('[comments] reactions fetch threw', err)
  }

  return entries.map((e) => {
    const byEmoji = reactionsByEntry.get(e.id)
    const reactions = byEmoji
      ? Array.from(byEmoji.values()).map((r) => ({
          emoji: r.emoji,
          count: r.user_ids.length,
          user_ids: r.user_ids,
        }))
      : []
    return {
      ...e,
      author_name: e.author_id ? nameByUser[e.author_id] ?? null : null,
      reactions,
    }
  })
}

// Toggle a reaction (add if absent, remove if present). The composite
// PK on (entry_id, user_id, emoji) lets us detect dupes via the
// existing rows; if the row exists we delete, otherwise we insert.
//
// Returns { added: boolean } so callers can decide whether to fire
// a notification email (only on add).
export async function toggleReaction(entryId, emoji) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  // Probe whether the row already exists for this user.
  const { data: existing, error: probeErr } = await supabase
    .from('comment_reactions')
    .select('entry_id')
    .eq('entry_id', entryId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle()
  if (probeErr) throw probeErr
  if (existing) {
    const { error } = await supabase
      .from('comment_reactions')
      .delete()
      .eq('entry_id', entryId)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
    if (error) throw error
    return { added: false }
  }
  const { error } = await supabase
    .from('comment_reactions')
    .insert({ entry_id: entryId, user_id: user.id, emoji })
  if (error) throw error
  return { added: true }
}

// Update an existing entry's body + mentions. RLS restricts this to
// the original author. The DB trigger bumps `updated_at` automatically
// when the body changes, so we don't pass it in the patch.
//
// We .select() back the affected ids so we can detect the RLS-silent-
// no-op case: when a policy blocks the UPDATE, Supabase returns no
// error AND no rows. Without this check the optimistic update would
// roll back invisibly when the realtime fetch hydrates.
export async function updateJournalEntry(entryId, { body, mentions }) {
  const { data, error } = await supabase
    .from('journal_entries')
    .update({ body, mentions: mentions ?? [] })
    .eq('id', entryId)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error(
      "You can't edit this comment. Only the author can, and the database may still be missing the phase-30 RLS policy — run supabase/2026-06-02-phase-30-comment-edit-delete.sql.",
    )
  }
}

// Hard-delete by id. RLS restricts this to the original author. If
// the entry is a top-level comment with replies, the FK cascade will
// remove the replies too — JournalPanel guards against that by
// soft-deleting (body rewrite) when replies are present.
//
// Same .select-back trick as updateJournalEntry above so an RLS-blocked
// DELETE doesn't silently look successful and let the row reappear on
// the next refetch.
export async function deleteJournalEntry(entryId) {
  const { data, error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('id', entryId)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error(
      "You can't delete this comment. Only the author can, and the database may still be missing the phase-30 RLS policy — run supabase/2026-06-02-phase-30-comment-edit-delete.sql.",
    )
  }
}

export async function createJournalEntry({
  taskId,
  body,
  authorId,
  entryType = 'note',
  parentId = null,
  mentions = [],
}) {
  const { data, error } = await supabase
    .from('journal_entries')
    .insert({
      task_id: taskId,
      body,
      author_id: authorId,
      entry_type: entryType,
      parent_id: parentId,
      mentions,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Fetch every journal entry across the user's workspace that mentions
// the given personId. Used by the Mentions inbox to surface "where
// were you tagged" without having to open every task.
//
// Returns entries enriched with task title + author name. RLS already
// scopes this to entries the caller can see (members can read entries
// on tasks in their workspace), so no extra workspace filter needed.
export async function fetchMyMentions(personId, limit = 50) {
  if (!personId) return []
  const { data, error } = await supabase
    .from('journal_entries')
    .select(
      `
      id, body, mentions, author_id, task_id, created_at, entry_type, parent_id,
      task:tasks(id, title, workspace_id)
    `,
    )
    .contains('mentions', [personId])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  // RLS scopes the journal_entries query to entries the caller can see
  // via task membership. If a task was deleted (or RLS denies it), the
  // join returns `task: null` — drop those rows so the inbox never
  // shows orphans with no destination.
  const entries = (data ?? []).filter((e) => e.task)
  if (entries.length === 0) return entries

  const authorIds = [
    ...new Set(entries.map((e) => e.author_id).filter(Boolean)),
  ]
  const nameByUser = {}
  if (authorIds.length > 0) {
    const { data: peopleData } = await supabase
      .from('people')
      .select('user_id, name')
      .in('user_id', authorIds)
    for (const p of peopleData ?? []) {
      if (p.user_id && !nameByUser[p.user_id]) nameByUser[p.user_id] = p.name
    }
  }

  // Per-user dismissed state — surfaced as `dismissed: boolean` on
  // each mention so the inbox can filter / style without a separate
  // query. RLS limits this to the current user's own dismissals.
  // Wrapped in try/catch so the inbox still loads if the phase-28
  // migration hasn't been applied yet (table will be missing).
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let dismissedSet = new Set()
  if (user) {
    try {
      const { data: dismissedRows, error: dismissErr } = await supabase
        .from('mention_dismissals')
        .select('entry_id')
        .eq('user_id', user.id)
        .in(
          'entry_id',
          entries.map((e) => e.id),
        )
      if (dismissErr) {
        // Missing table or RLS hiccup — log and treat as "nothing
        // dismissed" so the inbox still renders.
        console.warn('[mentions] dismissals fetch failed', dismissErr)
      } else {
        dismissedSet = new Set((dismissedRows ?? []).map((r) => r.entry_id))
      }
    } catch (err) {
      console.warn('[mentions] dismissals fetch threw', err)
    }
  }

  return entries.map((e) => ({
    ...e,
    author_name: e.author_id ? nameByUser[e.author_id] ?? null : null,
    dismissed: dismissedSet.has(e.id),
  }))
}

// Per-user "clear from my inbox" for a mention. The underlying
// journal entry (the actual comment) is untouched — this is a
// recipient-side suppression flag so a mention disappears from one
// user's inbox without affecting the comment or any other recipient.
export async function dismissMention(entryId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { error } = await supabase
    .from('mention_dismissals')
    .upsert(
      { user_id: user.id, entry_id: entryId },
      { onConflict: 'user_id,entry_id' },
    )
  if (error) throw error
}

// Restore a previously-dismissed mention. Straight delete of the
// dismissal record. Used by the "Restore" affordance in the
// Mentions → Dismissed view.
export async function restoreMention(entryId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { error } = await supabase
    .from('mention_dismissals')
    .delete()
    .eq('user_id', user.id)
    .eq('entry_id', entryId)
  if (error) throw error
}

// Bulk "Mark all as read" — one upsert covers every entryId.
// Called from the Mentions tab's "Mark all read" button.
export async function dismissMentions(entryIds) {
  if (!entryIds || entryIds.length === 0) return
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const rows = entryIds.map((entry_id) => ({ user_id: user.id, entry_id }))
  const { error } = await supabase
    .from('mention_dismissals')
    .upsert(rows, { onConflict: 'user_id,entry_id' })
  if (error) throw error
}
