import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/globals.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthProvider'
import { ToastProvider } from './components/Toast'
import { ensureServiceWorker } from './lib/registerSw'
import {
  installGlobalErrorLogger,
  getActiveWorkspaceId,
} from './lib/errorLog'

const queryClient = new QueryClient()

// Register the SW eagerly so push delivery works from the first
// session — independent of whether the user opens Settings. Failures
// are non-fatal (e.g. dev http server without HTTPS).
ensureServiceWorker()

// Global handlers for window 'error' + 'unhandledrejection' — writes
// to the error_log table so Settings → Errors can surface them. The
// workspace id is read lazily from the active-workspace getter (set
// by AuthProvider) so a session that switches workspaces still tags
// errors correctly.
installGlobalErrorLogger(getActiveWorkspaceId)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
