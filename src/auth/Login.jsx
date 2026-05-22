import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { TickdMark, TickdWordmark } from '../components/TickdMark'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setSubmitting(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <TickdMark size={36} />
          <TickdWordmark className="text-xl" />
        </div>

        {sent ? (
          <div className="bg-surface border border-border rounded-xl p-6 text-center">
            <div className="text-sm font-medium mb-2">Check your email</div>
            <p className="text-text-2 text-sm">
              We sent a magic link to{' '}
              <span className="font-medium text-text">{email}</span>. Click it
              to sign in.
            </p>
            <button
              type="button"
              className="mt-4 text-xs text-text-3 underline"
              onClick={() => {
                setSent(false)
                setEmail('')
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-surface border border-border rounded-xl p-6"
          >
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-info bg-bg"
            />
            {error && (
              <p className="mt-2 text-xs text-danger-text">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting || !email}
              className="mt-4 w-full bg-info text-white text-sm font-medium py-2 rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Sending…' : 'Send magic link'}
            </button>
            <p className="mt-3 text-[11px] text-text-3">
              We&rsquo;ll email you a one-time link. No password needed.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
