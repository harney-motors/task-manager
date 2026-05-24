import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import Login from './auth/Login'
import Home from './views/Home'
import NotificationsHost from './components/NotificationsHost'

export default function App() {
  const { user, loading } = useAuth()

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
