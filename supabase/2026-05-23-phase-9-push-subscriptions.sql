-- Phase 9.2 — Web Push subscriptions
--
-- Stores the browser's PushSubscription objects so we can send
-- notifications via web-push from a Netlify function. One row per
-- (user, endpoint) — a user with the PWA on phone + desktop ends up
-- with two rows. Preferences are per-row so a user could opt into
-- different triggers on different devices later (UI doesn't expose
-- per-device today, but the schema doesn't preclude it).

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  -- jsonb so we can add more trigger types later without schema churn.
  -- Defaults: all triggers on except daily digest (opt-in).
  preferences jsonb not null default jsonb_build_object(
    'assigned_to_me',  true,
    'due_soon',        true,
    'watched_changed', true,
    'journal_mention', true,
    'daily_digest',    false
  ),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  -- A user can resubscribe (e.g. permission reset, new device) and
  -- the same endpoint may come back; upsert key is (user_id, endpoint).
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "users see own push subscriptions" on push_subscriptions;
create policy "users see own push subscriptions" on push_subscriptions
  for select using (user_id = auth.uid());

drop policy if exists "users insert own push subscriptions" on push_subscriptions;
create policy "users insert own push subscriptions" on push_subscriptions
  for insert with check (user_id = auth.uid());

drop policy if exists "users update own push subscriptions" on push_subscriptions;
create policy "users update own push subscriptions" on push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users delete own push subscriptions" on push_subscriptions;
create policy "users delete own push subscriptions" on push_subscriptions
  for delete using (user_id = auth.uid());
