import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local. ' +
      'Restart `npm run dev` after editing .env.local.',
  )
}

// Explicit auth options:
//   persistSession    — write the session to localStorage so it survives
//                       browser closes and reloads (default true; explicit
//                       here so it's not silently changed by a SDK upgrade).
//   autoRefreshToken  — refresh the access token before it expires so the
//                       user doesn't get logged out mid-action.
//   detectSessionInUrl — pick up the magic-link / OAuth redirect hash on
//                       load and populate the session.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'tickd-auth',
  },
})
