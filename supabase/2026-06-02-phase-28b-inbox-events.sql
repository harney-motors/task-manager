-- Phase 28b — Inbox event-stream dismissals
--
-- The Inbox's "Assigned" tab was a saved task list (snapshot of
-- pic_id = me), which duplicated the TodayView "My tasks" filter and
-- left users with no way to dismiss anything — nothing actually
-- happens in a list, so nothing can be cleared.
--
-- We're replacing it with a real event stream ("Lara assigned you X",
-- "Y became overdue", "Asbert moved the due date on Z") derived from
-- activity_log + synthetic overdue events. Each event gets a stable
-- string `event_id` so dismissals can be cross-device.
--
-- This table is intentionally schema-loose on `event_id` (text, not
-- uuid) so we can mix activity_log row UUIDs with synthetic ids like
-- `overdue:<task-uuid>:<due-date>` in a single dismissal store.

create table if not exists inbox_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists inbox_dismissals_user_idx
  on inbox_dismissals(user_id, dismissed_at desc);

alter table inbox_dismissals enable row level security;

drop policy if exists "users read own inbox dismissals" on inbox_dismissals;
create policy "users read own inbox dismissals" on inbox_dismissals
  for select using (user_id = auth.uid());

drop policy if exists "users insert own inbox dismissals" on inbox_dismissals;
create policy "users insert own inbox dismissals" on inbox_dismissals
  for insert with check (user_id = auth.uid());

drop policy if exists "users delete own inbox dismissals" on inbox_dismissals;
create policy "users delete own inbox dismissals" on inbox_dismissals
  for delete using (user_id = auth.uid());
