import { useOnlineStatus } from '../lib/useOnlineStatus'

// Slim banner that surfaces network state so the user understands why
// edits might be queueing or failing. Three states:
//
//   online       — hidden (no chrome at all)
//   offline      — yellow strip: "You're offline. Edits will save when
//                  you're back." React Query's networkMode:'online'
//                  pauses mutations until reconnect, so this is the
//                  truthful signal.
//   reconnected  — green strip for ~2.5s: "Back online" — quick confirm
//                  that queued mutations will now fire.
//
// Sits at the top of the page, above the topbar. Doesn't overlay; it
// pushes content down so the user always sees it (a hidden offline
// state behind a modal would be cruel).
export default function OfflineBanner() {
  const status = useOnlineStatus()
  if (status === 'online') return null
  const offline = status === 'offline'
  return (
    <div
      role="status"
      className={
        'sticky top-0 z-40 px-3 sm:px-6 py-1.5 text-[11px] sm:text-xs font-medium text-center ' +
        (offline
          ? 'bg-warning-bg text-warning-text border-b border-warning-bg/60'
          : 'bg-success-bg text-success-text border-b border-success-bg/60')
      }
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {offline ? (
        <span>
          <i className="ti ti-wifi-off mr-1.5 text-sm align-text-bottom" />
          You&rsquo;re offline. Edits will save when you&rsquo;re back.
        </span>
      ) : (
        <span>
          <i className="ti ti-wifi mr-1.5 text-sm align-text-bottom" />
          Back online — saving your queued changes.
        </span>
      )}
    </div>
  )
}
