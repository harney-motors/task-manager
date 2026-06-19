import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import Login from './auth/Login'
import Home from './views/Home'
import OfflineBanner from './components/OfflineBanner'

export default function App() {
  const { user, loading, workspace } = useAuth()

  // Brand colour — paint a workspace-specific accent at the root so
  // every component that reads var(--brand-color) inherits the value.
  // Falls back to the theme indigo when nothing is set. Plumbed through
  // CSS rather than React context because hot styles need to update on
  // workspace switch without forcing a tree-wide re-render.
  useEffect(() => {
    const root = document.documentElement
    if (workspace?.brand_color) {
      root.style.setProperty('--brand-color', workspace.brand_color)
    } else {
      root.style.removeProperty('--brand-color')
    }
  }, [workspace?.brand_color])

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-text-3 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/"
          element={user ? <Home /> : <Navigate to="/login" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* NotificationsHost / NudgeBadge popup removed — superseded by
          the full Inbox surface (sidebar entry + mobile overflow). The
          popup duplicated the inbox and the bell badge had a stale-
          dismiss bug that wasn't worth fixing. Service-worker push
          deep links still work via the tickd:open-task event. */}
    </>
  )
}
