-- Phase 5 — Saved filters (per-user, per-workspace)
-- Idempotent.

create table if not exists saved_filters (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  user_id      uuid references auth.users(id) on delete cascade not null,
  name         text not null check (length(name) between 1 and 50),
  spec         jsonb not null,
  created_at   timestamptz default now(),
  unique (user_id, workspace_id, name)
);

alter table saved_filters enable row level security;

-- A user can only see/manage their own saved filters. Workspace
-- members can each have their own set; nothing is shared.
drop policy if exists "users manage own saved filters" on saved_filters;
create policy "users manage own saved filters" on saved_filters
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists saved_filters_workspace_user_idx
  on saved_filters(workspace_id, user_id);
