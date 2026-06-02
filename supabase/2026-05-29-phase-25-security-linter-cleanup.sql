-- Phase 25 — Supabase database linter cleanup.
--
-- Addresses three classes of warning from the Supabase security
-- linter:
--
-- 1. function_search_path_mutable (5 functions)
--    Pin search_path to (public, pg_temp) on trigger / helper
--    functions that didn't specify one. Without this, a malicious
--    role could create objects in a schema they control and have
--    them shadow the references inside these functions.
--
-- 2. anon_security_definer_function_executable (12 functions)
--    Revoke EXECUTE on every admin_* and platform helper RPC from
--    the `anon` and `public` roles. Anonymous callers shouldn't be
--    able to even reach the function body — the internal
--    is_superadmin() check is defence in depth, not the perimeter.
--
-- 3. authenticated_security_definer_function_executable (12 functions)
--    Intentionally NOT fixed. Superadmins are signed-in users and
--    the React app calls these RPCs via the authenticated JWT; the
--    internal is_superadmin() check is what authorises them.
--    Revoking EXECUTE from `authenticated` would break the admin UI.
--    These warnings stay; they're noise once you've audited the
--    function bodies.
--
-- Re-runnable: alter / revoke statements are idempotent.

-- ============================================================
-- 1. Pin search_path on trigger + helper functions
-- ============================================================

alter function public.update_updated_at()
  set search_path = public, pg_temp;

alter function public.set_docs_updated_at()
  set search_path = public, pg_temp;

alter function public.tasks_search_vector_fn()
  set search_path = public, pg_temp;

alter function public.people_search_vector_fn()
  set search_path = public, pg_temp;

alter function public.journal_search_vector_fn()
  set search_path = public, pg_temp;

-- ============================================================
-- 2. Revoke EXECUTE on admin RPCs from anon (and public)
-- ============================================================
--
-- Postgres treats argument types as part of the function signature,
-- so we have to spell out each one. Wrapped in DO blocks so the
-- migration succeeds even if a function name was renamed / dropped
-- by a future migration we haven't tracked here yet.

do $$
begin
  perform 1 from pg_proc where proname = 'admin_add_member';
  if found then
    execute 'revoke execute on function public.admin_add_member(uuid, uuid, text) from anon, public';
  end if;
end $$;

do $$
begin
  perform 1 from pg_proc where proname = 'admin_create_workspace';
  if found then
    execute 'revoke execute on function public.admin_create_workspace(text, uuid) from anon, public';
  end if;
end $$;

do $$
begin
  perform 1 from pg_proc where proname = 'admin_delete_workspace';
  if found then
    execute 'revoke execute on function public.admin_delete_workspace(uuid) from anon, public';
  end if;
end $$;

do $$
begin
  perform 1 from pg_proc where proname = 'admin_demote_user';
  if found then
    execute 'revoke execute on function public.admin_demote_user(uuid) from anon, public';
  end if;
end $$;

do $$
begin
  perform 1 from pg_proc where proname = 'admin_link_person';
  if found then
    execute 'revoke execute on function public.admin_link_person(uuid, uuid) from anon, public';
  end if;
end $$;

do $$
begin
  perform 1 from pg_proc where proname = 'admin_promote_user';
  if found then
    execute 'revoke execute on function public.admin_promote_user(uuid, text) from anon, public';
  end if;
end $$;

do $$
begin
  perform 1 from pg_proc where proname = 'admin_remove_member';
  if found then
    execute 'revoke execute on function public.admin_remove_member(uuid, uuid) from anon, public';
  end if;
end $$;

do $$
begin
  perform 1 from pg_proc where proname = 'admin_system_stats';
  if found then
    execute 'revoke execute on function public.admin_system_stats() from anon, public';
  end if;
end $$;

do $$
begin
  perform 1 from pg_proc where proname = 'admin_unlink_person';
  if found then
    execute 'revoke execute on function public.admin_unlink_person(uuid) from anon, public';
  end if;
end $$;

do $$
begin
  perform 1 from pg_proc where proname = 'admin_workspace_stats';
  if found then
    execute 'revoke execute on function public.admin_workspace_stats() from anon, public';
  end if;
end $$;

do $$
begin
  perform 1 from pg_proc where proname = 'get_all_users';
  if found then
    execute 'revoke execute on function public.get_all_users() from anon, public';
  end if;
end $$;

-- rls_auto_enable wasn't created by any of our migrations — it's
-- likely a Supabase / template helper sitting in public. Revoke
-- conservatively in case it has admin-level capabilities; we don't
-- call it from app code, so revoking is safe.
do $$
begin
  perform 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace;
  if found then
    execute 'revoke execute on function public.rls_auto_enable() from anon, public';
  end if;
end $$;
