import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { subscribeNudgesRealtime } from '../lib/queries'
import NotificationsModal from './NotificationsModal'

// Mounts the Notifications modal once at the app level and wires it to
// the `tickd:open-notifications` event the NudgeBadge dispatches. Any
// bell rendered anywhere in the tree triggers it, so notifications
// stay reachable from Today, List, Grid, PIC, Calendar, Settings,
// SuperAdmin, Pulse — every view, without each one mounting its own
// modal instance.
//
// Also opens a Supabase Realtime subscription on ai_nudges for the
// active workspace — when a new nudge lands (scheduled function fires,
// or another tab dismisses one) the bell badge + panel update without
// a manual refresh.
export default function NotificationsHost() {
  const [open, setOpen] = useState(false)
  const { workspace } = useAuth()
  const qc = useQueryClient()

  useEffect(() => {
    function onOpen() {
      setOpen(true)
    }
    function onClose() {
      setOpen(false)
    }
    window.addEventListener('tickd:open-notifications', onOpen)
    window.addEventListener('tickd:close-notifications', onClose)
    return () => {
      window.removeEventListener('tickd:open-notifications', onOpen)
      window.removeEventListener('tickd:close-notifications', onClose)
    }
  }, [])

  // Live nudge feed — wakes the bell when a new row lands.
  useEffect(() => {
    if (!workspace?.id) return
    return subscribeNudgesRealtime(workspace.id, qc)
  }, [workspace?.id, qc])

  return <NotificationsModal open={open} onClose={() => setOpen(false)} />
}
