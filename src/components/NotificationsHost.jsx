import { useEffect, useState } from 'react'
import NotificationsModal from './NotificationsModal'

// Mounts the Notifications modal once at the app level and wires it to
// the `tickd:open-notifications` event the NudgeBadge dispatches. Any
// bell rendered anywhere in the tree triggers it, so notifications
// stay reachable from Today, List, Grid, PIC, Calendar, Settings,
// SuperAdmin, Pulse — every view, without each one mounting its own
// modal instance.
export default function NotificationsHost() {
  const [open, setOpen] = useState(false)

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

  return <NotificationsModal open={open} onClose={() => setOpen(false)} />
}
