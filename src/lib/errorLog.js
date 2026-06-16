import { supabase } from './supabase'

// AuthProvider keeps this in sync via setActiveWorkspaceId whenever
// the user switches workspaces. Reads are O(1) and the read happens
// at error time, so the workspace tag is always current.
let _activeWorkspaceId = null
export function setActiveWorkspaceId(id) {
  _activeWorkspaceId = id || null
}
export function getActiveWorkspaceId() {
  return _activeWorkspaceId
}

// Centralised client-side error logger. Inserts to the error_log
// table; RLS scopes inserts to user_id = auth.uid(). All callers are
// fire-and-forget — the logger itself never throws, so a logging
// failure won't cascade into an even worse user experience.
//
// `source` examples:
//   'client'           — uncaught window error
//   'client:promise'   — unhandled promise rejection
//   'client:mutation'  — React Query mutation onError
//   'client:<feature>' — narrow tag chosen by the calling site
//
// `level`: 'error' (default) | 'warn' | 'fatal'
// `context`: arbitrary JSON. Keep it under ~16KB; truncated server-side
// by jsonb limits but it's polite not to push the boundary.

const RECENT_KEY_BUFFER = []
const RECENT_KEY_MAX = 16

// Stable fingerprint for an error to suppress floods. Same fingerprint
// posted within ~5s gets dropped — uncaught render loops can fire 100s
// of identical exceptions per second.
function fingerprint({ source, message }) {
  return `${source}|${(message ?? '').slice(0, 200)}`
}

function isFlood(fp) {
  const now = Date.now()
  for (let i = RECENT_KEY_BUFFER.length - 1; i >= 0; i--) {
    const entry = RECENT_KEY_BUFFER[i]
    if (entry.fp === fp && now - entry.ts < 5000) return true
  }
  RECENT_KEY_BUFFER.push({ fp, ts: now })
  while (RECENT_KEY_BUFFER.length > RECENT_KEY_MAX) RECENT_KEY_BUFFER.shift()
  return false
}

export async function logError({
  source,
  message,
  level = 'error',
  context = null,
  workspaceId = null,
}) {
  if (!source || !message) return
  const fp = fingerprint({ source, message })
  if (isFlood(fp)) return
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    // RLS rejects inserts where user_id is set to someone else's id;
    // for unauthenticated callers we just send null and RLS allows
    // that branch.
    const { error } = await supabase.from('error_log').insert({
      source,
      message: String(message).slice(0, 4000),
      level,
      context: context ?? null,
      workspace_id: workspaceId ?? null,
      user_id: user?.id ?? null,
    })
    if (error) {
      // Don't recurse — just console-log so we don't loop logging the
      // logger's failure back to the logger.
      console.warn('[error-log] insert failed', error)
    }
  } catch (err) {
    console.warn('[error-log] logger crashed', err)
  }
}

// Install global handlers ONCE. Idempotent — calling install twice is
// a no-op. Called from src/main.jsx so client-side errors land
// automatically. Caller can pass workspaceId hook so the logger
// knows which tenant to attach the error to, but since workspace can
// change mid-session we read it dynamically from a getter rather than
// capturing it at install time.
let installed = false
export function installGlobalErrorLogger(getWorkspaceId = () => null) {
  if (installed) return
  installed = true
  if (typeof window === 'undefined') return

  window.addEventListener('error', (e) => {
    logError({
      source: 'client',
      message: e?.message || 'Uncaught error',
      level: 'error',
      context: {
        stack: e?.error?.stack ?? null,
        filename: e?.filename ?? null,
        lineno: e?.lineno ?? null,
        colno: e?.colno ?? null,
        url: window.location.href,
        user_agent: navigator.userAgent,
      },
      workspaceId: getWorkspaceId(),
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e?.reason
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection'
    logError({
      source: 'client:promise',
      message,
      level: 'error',
      context: {
        stack: reason instanceof Error ? reason.stack : null,
        url: window.location.href,
      },
      workspaceId: getWorkspaceId(),
    })
  })
}
