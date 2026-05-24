import { useActiveNudges } from '../lib/queries'

// Bell button for the topbar. Always visible (even when empty, on
// tablet+) so users have a consistent place to find notifications;
// hidden on phone only when empty to save space in the cramped
// mobile chrome.
//
// Clicking dispatches a `tickd:open-notifications` event — Home.jsx
// listens for it and pops the NotificationsModal regardless of which
// view the user is on. This replaces the previous "scroll to inline
// banner" behaviour which only worked on Today.
export default function NudgeBadge() {
  const { data: nudges = [] } = useActiveNudges()
  const count = nudges.length

  // On phone, hide entirely when empty so the slim topbar isn't
  // wasted on a dead bell. Desktop always renders it for consistency.
  if (count === 0) {
    return (
      <button
        type="button"
        onClick={openPanel}
        aria-label="Notifications (none)"
        title="Notifications"
        className="hidden sm:inline-flex w-10 h-10 rounded-full items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors"
      >
        <i className="ti ti-bell text-lg" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={openPanel}
      aria-label={`${count} notification${count === 1 ? '' : 's'}`}
      title={`${count} notification${count === 1 ? '' : 's'}`}
      className="relative w-10 h-10 rounded-full inline-flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 active:bg-surface-3 transition-colors"
    >
      <i className="ti ti-bell text-lg" />
      <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-bg">
        {count > 9 ? '9+' : count}
      </span>
    </button>
  )
}

function openPanel() {
  window.dispatchEvent(new CustomEvent('tickd:open-notifications'))
}
