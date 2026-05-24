// Mobile-only Floating Action Button. Anchored bottom-right above
// the BottomNav, respects iOS safe-area inset so it never hides
// under the home indicator.
//
// Single primary affordance — tap to invoke. iOS Material Design
// blue, 56pt circle, subtle shadow + press-down scale.

export default function FAB({ icon = 'ti-plus', label = 'Add', onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="sm:hidden fixed right-4 z-30 w-14 h-14 rounded-full bg-info text-white shadow-xl shadow-info/45 ring-1 ring-white/20 flex items-center justify-center text-2xl active:scale-90 hover:scale-105 transition-transform"
      style={{
        // Sit comfortably above the bottom nav (h-14 ≈ 56px + safe area).
        bottom: 'calc(72px + env(safe-area-inset-bottom))',
      }}
    >
      <i className={`ti ${icon}`} />
    </button>
  )
}
