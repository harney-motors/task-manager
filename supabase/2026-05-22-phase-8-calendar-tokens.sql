-- Phase 8 — Calendar subscription tokens
--
-- Calendar apps (Apple, Google, Outlook) subscribe to .ics feeds by URL
-- and refresh them on their own schedule (~hourly). Since they can't
-- send a JWT, the URL itself has to carry the auth — that's the token.
--
-- Each row is (user, workspace) → token. One per pair, so a user with
-- access to two workspaces ends up with two URLs they can subscribe to
-- separately. Rotating a token invalidates the old one immediately
-- (calendar apps will simply stop seeing updates the next refresh).
--
-- Rules:
--   - Only the owner can read/insert/update their own tokens.
--   - The Netlify function looks up tokens via service-role, bypassing
--     RLS, because the calendar request has no JWT.

create table if not exists calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  revoked_at timestamptz,
  -- Only one active token per (user, workspace). Rotating means
  -- inserting a fresh row and marking the old one revoked.
  unique (user_id, workspace_id, revoked_at)
);

create index if not exists calendar_feed_tokens_active_idx
  on calendar_feed_tokens(token)
  where revoked_at is null;

alter table calendar_feed_tokens enable row level security;

drop policy if exists "users see own calendar tokens" on calendar_feed_tokens;
create policy "users see own calendar tokens" on calendar_feed_tokens
  for select using (user_id = auth.uid());

drop policy if exists "users insert own calendar tokens" on calendar_feed_tokens;
create policy "users insert own calendar tokens" on calendar_feed_tokens
  for insert with check (
    user_id = auth.uid()
    and workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

drop policy if exists "users update own calendar tokens" on calendar_feed_tokens;
create policy "users update own calendar tokens" on calendar_feed_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users delete own calendar tokens" on calendar_feed_tokens;
create policy "users delete own calendar tokens" on calendar_feed_tokens
  for delete using (user_id = auth.uid());
