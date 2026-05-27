import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

// useTaskPresence — Supabase Realtime presence channel scoped to a
// single task. Tracks who else has the same task open so the modal
// can show "X is also viewing / editing this".
//
// Returns:
//   others       — array of presence rows for OTHER users
//   anyEditing   — true when at least one other user has focused an
//                  editable field (title / notes). Drives the
//                  "someone else is editing" banner.
//   setEditing   — call with true when the local user focuses an
//                  editable field, false on blur. Propagates via
//                  channel.track so the others can see us editing.
//
// Channel name format: `task-presence:<taskId>`. All members of the
// workspace can join (RLS doesn't gate Realtime channels by itself;
// the channel name itself is the only secret, and since task ids are
// UUIDs they're effectively unguessable). For workspaces of trusted
// internal teams this trade-off is fine — full per-row gating would
// need a Realtime auth function, not worth the complexity here.
//
// The hook is a no-op when taskId or user is missing. Callers can
// always render against `others` (empty by default).
export default function useTaskPresence(taskId, user, identity) {
  const [others, setOthers] = useState([])
  const channelRef = useRef(null)
  const editingRef = useRef(false)

  // Effect re-runs when the task or user identity changes. We tear
  // down the prior channel and join the new one — otherwise stale
  // subscriptions would multiply.
  useEffect(() => {
    if (!taskId || !user?.id) {
      setOthers([])
      return
    }

    const channel = supabase.channel(`task-presence:${taskId}`, {
      config: {
        presence: { key: user.id },
      },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() // { userId: [presence...] }
        const flat = []
        for (const [otherId, metas] of Object.entries(state)) {
          if (otherId === user.id) continue
          // metas is an array because a user could be in two tabs; we
          // collapse to the most-recent entry. `editing` is sticky if
          // any tab is editing.
          const latest = metas[metas.length - 1] ?? {}
          const anyEditing = metas.some((m) => m.editing)
          flat.push({
            user_id: otherId,
            name: latest.name ?? null,
            color: latest.color ?? null,
            avatar_initials: latest.avatar_initials ?? null,
            editing: anyEditing,
          })
        }
        setOthers(flat)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            name: identity?.name ?? null,
            color: identity?.color ?? null,
            avatar_initials: identity?.initials ?? null,
            editing: editingRef.current,
          })
        }
      })

    channelRef.current = channel

    return () => {
      try {
        channel.untrack()
      } catch {
        /* ignore — channel may already be torn down */
      }
      supabase.removeChannel(channel)
      channelRef.current = null
      setOthers([])
    }
    // Identity changes are intentionally NOT a dep — we update via
    // `track()` in the focus/blur path. Re-subscribing on identity
    // changes would churn the channel needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, user?.id])

  // Call with true on focus of an editable field, false on blur.
  function setEditing(editing) {
    editingRef.current = editing
    if (channelRef.current) {
      channelRef.current.track({
        name: identity?.name ?? null,
        color: identity?.color ?? null,
        avatar_initials: identity?.initials ?? null,
        editing,
      })
    }
  }

  const anyEditing = others.some((o) => o.editing)

  return { others, anyEditing, setEditing }
}
