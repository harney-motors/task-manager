-- Phase 14 — Saved AI commands ("automations")
--
-- A user can save a Cmd+K AI command (matcher + actions plan) for
-- one-click reuse later. The plan is stored verbatim as jsonb so the
-- preview modal can re-render it against the current task state when
-- the user re-runs it. Per-user, not per-workspace — these are personal
-- shortcuts.

create table if not exists saved_ai_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Optional workspace scoping so the same name can recur across
  -- workspaces and we can hide irrelevant ones. null = all workspaces.
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  plan jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_ai_commands_user_idx
  on saved_ai_commands(user_id, created_at desc);

alter table saved_ai_commands enable row level security;

drop policy if exists "users see own saved commands" on saved_ai_commands;
create policy "users see own saved commands" on saved_ai_commands
  for select using (user_id = auth.uid());

drop policy if exists "users insert own saved commands" on saved_ai_commands;
create policy "users insert own saved commands" on saved_ai_commands
  for insert with check (user_id = auth.uid());

drop policy if exists "users delete own saved commands" on saved_ai_commands;
create policy "users delete own saved commands" on saved_ai_commands
  for delete using (user_id = auth.uid());
