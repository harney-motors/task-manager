-- Phase 32 — Backend error log
--
-- Centralised error sink. Two write paths:
--   1. Client — failed mutations / uncaught exceptions get posted via
--      the supabase JS client using the user's JWT. RLS enforces
--      `user_id = auth.uid()` on inserts.
--   2. Server — Netlify functions use the service-role key and insert
--      with workspace_id (or null when an error doesn't have one) and
--      a source tag like `netlify-fn:notify-mention`.
--
-- Read access: workspace owners see their workspace's errors;
-- superadmins see everything. Other roles get nothing — keeps internal
-- stack traces out of editor / PIC eyes.

create table if not exists error_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  -- nullable so anonymous + pre-auth errors still land (e.g. a
  -- Netlify function that fails BEFORE resolving a workspace).
  source text not null,
  -- conventional values:
  --   'client'                — uncaught browser exception
  --   'client:mutation'       — react-query mutation onError
  --   'client:promise'        — window.unhandledrejection
  --   'netlify-fn:<name>'     — server function failure
  level text not null
    check (level in ('error', 'warn', 'fatal')) default 'error',
  message text not null,
  -- Free-form context payload. Common keys: { stack, url, route,
  -- user_agent, status_code, request_id, response_excerpt }.
  context jsonb,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists error_log_workspace_idx
  on error_log(workspace_id, created_at desc);
create index if not exists error_log_created_idx
  on error_log(created_at desc);
create index if not exists error_log_source_idx
  on error_log(source, created_at desc);

alter table error_log enable row level security;

-- READ: workspace owners see their workspace's errors; superadmins
-- see everything. Errors with workspace_id IS NULL are super-admin
-- only (they don't belong to any tenant).
drop policy if exists "owners read workspace errors" on error_log;
create policy "owners read workspace errors" on error_log
  for select using (
    (workspace_id is not null and workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role = 'owner'
    ))
    or exists (
      select 1 from superadmins where user_id = auth.uid()
    )
  );

-- WRITE: anyone authenticated can log their own errors. The
-- (user_id = auth.uid()) check prevents impersonation; nullable
-- user_id is allowed so service-role inserts (which bypass RLS
-- anyway) still validate cleanly if RLS is somehow inferred.
drop policy if exists "users insert own errors" on error_log;
create policy "users insert own errors" on error_log
  for insert with check (
    user_id = auth.uid() or user_id is null
  );

-- No UPDATE / DELETE policies for regular users. Cleanup happens via
-- service role (e.g. a future scheduled function pruning > 30 days).

-- Realtime so the Settings → Errors page can update without refresh.
do $$
begin
  alter publication supabase_realtime add table error_log;
exception when duplicate_object then null;
end $$;
