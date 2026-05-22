import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { TickdMark, TickdWordmark } from '../components/TickdMark'

const LAST_EMAIL_KEY = 'tickd:lastEmail'

function loadLastEmail() {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberEmail(email) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email)
  } catch {
    // ignore — private mode / storage disabled
  }
}

export default function Login() {
  const [email, setEmail] = useState(loadLastEmail)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
    } else {
      rememberEmail(email)
      setSent(true)
    }
  }

  async function handleGoogle() {
    setError(null)
    setGoogleSubmitting(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setGoogleSubmitting(false)
      setError(
        error.message.includes('not enabled') || error.message.includes('provider')
          ? 'Google sign-in is not configured for this project yet. Use your email below for now.'
          : error.message,
      )
    }
    // No success branch needed — the page redirects to Google on success.
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <TickdMark size={40} />
          <TickdWordmark className="text-2xl" size="large" />
        </div>

        {sent ? (
          <div className="bg-surface border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 justify-center mb-2 text-success-text">
              <i className="ti ti-mail text-base" />
              <div className="text-sm font-medium">Check your email</div>
            </div>
            <p className="text-text-2 text-sm text-center">
              We sent a sign-in link to{' '}
              <span className="font-medium text-text">{email}</span>. Click it
              from any device to sign in.
            </p>
            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setSent(false)}
                className="text-xs text-text-2 hover:text-text underline"
              >
                Resend or use a different email
              </button>
              <p className="text-[11px] text-text-3 text-center">
                Tip: the link works in any browser — open it on your phone if
                you started on desktop.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
            <h1 className="text-lg font-medium tracking-tight text-center">
              Sign in to Tickd
            </h1>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleSubmitting || submitting}
              className="w-full border border-border rounded-md py-2.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50 inline-flex items-center justify-center gap-2.5"
            >
              {googleSubmitting ? (
                <i className="ti ti-loader-2 animate-spin text-sm" />
              ) : (
                <GoogleG />
              )}
              Continue with Google
            </button>

            <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-text-3">
              <div className="flex-1 h-px bg-border" />
              or use email
              <div className="flex-1 h-px bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                required
                autoFocus={!email}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-border rounded-md px-3 py-2.5 text-sm outline-none focus:border-info bg-bg"
              />
              <button
                type="submit"
                disabled={submitting || googleSubmitting || !email}
                className="w-full bg-info text-white text-sm font-medium py-2.5 rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Sending link…' : 'Email me a sign-in link'}
              </button>
            </form>

            {error && (
              <p className="text-xs text-danger-text bg-danger-bg rounded px-3 py-2">
                {error}
              </p>
            )}

            <p className="text-[11px] text-text-3 text-center">
              Stays signed in for 30 days. Magic link works on any device.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Inline G logo so we don't pull in another icon set.
function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.972 32.91 29.471 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.452 0-10.018-3.07-11.314-8.083l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  )
}
