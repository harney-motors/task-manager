# Supabase database linter — accepted findings

This file lists Supabase linter warnings that we've **reviewed and accepted**, with the reasoning. Anything not listed here should be treated as new and triaged.

The migrations under `supabase/2026-05-29-phase-25-security-linter-cleanup.sql` cleared:

- ✅ `function_search_path_mutable` × 5 — pinned `search_path = public, pg_temp` on every helper / trigger function
- ✅ `anon_security_definer_function_executable` × 12 — revoked `EXECUTE` from `anon` and `public` on every admin RPC

What stays as a `WARN`-level finding, by design:

---

## `authenticated_security_definer_function_executable` × 11

Affected functions in `public.*`:

- `admin_add_member(uuid, uuid, text)`
- `admin_create_workspace(text, uuid)`
- `admin_delete_workspace(uuid)`
- `admin_demote_user(uuid)`
- `admin_link_person(uuid, uuid)`
- `admin_promote_user(uuid, text)`
- `admin_remove_member(uuid, uuid)`
- `admin_system_stats()`
- `admin_unlink_person(uuid)`
- `admin_workspace_stats()`
- `get_all_users()`

### Why they're `SECURITY DEFINER`

They need to bypass RLS to do real admin work — reading `auth.users`, writing across workspaces, promoting users, etc. `SECURITY INVOKER` runs the body with the caller's permissions, which means RLS applies, which means these functions stop working.

### Why they're callable by `authenticated`

The React admin UI calls them directly via `supabase.rpc()` using the signed-in user's JWT. That's the whole entrypoint. Revoking `EXECUTE` from `authenticated` would 403 every admin call from the app.

### What's the real authorization gate

Every function above has an internal `is_superadmin(auth.uid())` (or equivalent) check at the top of its body. A signed-in user who isn't a superadmin hits an error, not a successful no-op. The linter doesn't read function bodies — it only sees that `authenticated` can call them.

### When to revisit

If we ever:

- Stop using the React admin UI in favour of a Netlify-function-only admin surface, **move these to a non-exposed schema** (e.g. `admin.*`) and call them with the service-role key from the function.
- Find a function that doesn't have the `is_superadmin()` check at the top, **add it immediately** — that's the actual security boundary.

---

## `rls_auto_enable()` (1 of the 12)

This one is **not ours** — there's no `create function rls_auto_enable` anywhere in `supabase/`. Looks like a leftover from a Supabase template or an earlier ad-hoc script.

We've revoked `EXECUTE` from `anon` + `public` (phase-25) so it can't be called anonymously. To fully clear the warning, drop it after confirming nothing references it:

```sql
-- After verifying it's safe to remove
drop function if exists public.rls_auto_enable();
```

---

## `auth_leaked_password_protection` × 1

**Action required (one-click, dashboard):**

Supabase Studio → **Authentication** → **Policies** (or **Settings**) → **Password Settings** → enable **"Prevent leaked passwords"**. Wires Supabase Auth into HaveIBeenPwned so new sign-ups can't pick known-compromised passwords.

Once that's flipped, this warning clears automatically.

---

## Re-running the linter

Project dashboard → **Database** → **Linter**. Re-runs in a few seconds. Anything not in this doc that shows up `WARN` or `ERROR` is new and should be triaged.
