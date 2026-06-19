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

// Tuned defaults for flaky-network resilience. The combination most
// often hits iOS Safari on cellular: it silently kills in-flight
// fetches when the radio idles or the screen locks, and the user sees
// "Type error: Load failed" + the optimistic row vanishes.
//
// Mutations: 2 automatic retries (3 attempts total) with exponential
// backoff. Means a transient blip takes ~7 seconds before we give up
// + roll back the optimistic state, instead of failing on the first
// dropped packet.
//
// Queries: defaults already retry 3x. Bumping staleTime keeps cached
// data alive a bit longer so an offline tab doesn't blank out the
// list the moment focus returns.
//
// networkMode: 'online' — when navigator.onLine is false the mutation
// gets PAUSED status (no error, no rollback) and auto-retries the
// instant we're back online. That's the behaviour we actually want;
// 'offlineFirst' would still fire the mutation while offline and
// surface a false failure.
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      networkMode: 'online',
    },
    queries: {
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      networkMode: 'online',
    },
  },
})

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
