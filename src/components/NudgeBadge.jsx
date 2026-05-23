import { useActiveNudges } from '../lib/queries'

// Small bell button for the topbar. Renders a count badge when there
// are active nudges and scrolls to the nudges banner on click.
//
// Hidden when:
//   - The user has no active nudges (no point taking up topbar space)
//   - We're not on a view that mounts the banner (we still render but
//     the click can't scroll to anything; the parent decides whether
//     to mount NudgeBadge at all).
export default function NudgeBadge() {
  const { data: nudges = [] } = useActiveNudges()
  if (nudges.length === 0) return null

  function handleClick() {
    const el = document.getElementById('nudges-banner')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      // Fallback: scroll to top so the user at least sees the home
      // view where the banner lives.
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <button
      onClick={handleClick}
      className="relative p-2 rounded hover:bg-surface-2 text-text-2 hover:text-text"
      aria-label={`${nudges.length} active nudge${nudges.length === 1 ? '' : 's'}`}
      title={`${nudges.length} active nudge${nudges.length === 1 ? '' : 's'}`}
    >
      <i className="ti ti-bell text-base" />
      <span
        className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-info text-white text-[9px] font-bold flex items-center justify-center"
      >
        {nudges.length > 9 ? '9+' : nudges.length}
      </span>
    </button>
  )
}
