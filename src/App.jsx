import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import Login from './auth/Login'
import Home from './views/Home'
import NotificationsHost from './components/NotificationsHost'

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
      {/* Global notifications surface — listens for `tickd:open-
          notifications` and pops the modal regardless of which view
          (Today, Settings, SuperAdmin, Pulse, …) is currently rendered. */}
      {user && <NotificationsHost />}
    </>
  )
}
