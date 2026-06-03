-- Phase 28 — Inbox dismissal cleanup
--
-- Two fixes to reduce inbox redundancy:
--
--   1. NUDGES RE-APPEAR. The generator runs 3x/day and has no memory
--      of what the user has already dismissed, so the same overdue /
--      blocker nudge keeps coming back. We add a `fingerprint` column
--      computed as `${kind}:${primary_task_id}`, and the runner skips
--      any candidate whose fingerprint was dismissed in the last 7d.
--
--   2. MENTIONS CAN'T BE DISMISSED. The journal entry is immutable
--      (the comment really happened), so we add a per-user
--      `mention_dismissals` table — clearing a mention from one
--      person's inbox doesn't affect the underlying comment or any
--      other recipient.

-- ============================================================
-- 1. Nudge fingerprint + suppression-friendly index
-- ============================================================

alter table ai_nudges add column if not exists fingerprint text;

-- Backfill: existing rows compute their fingerprint from
-- kind + first task_id in payload. Rows with no task_id get a
-- fingerprint of just `${kind}:` — those are pure FYI nudges that
-- the runner intentionally leaves un-suppressable.
update ai_nudges
set fingerprint = kind || ':' || coalesce(payload->'task_ids'->>0, '')
where fingerprint is null;

-- Lookup pattern: "for user X, what fingerprints did they dismiss
-- in the suppression window?" The partial index covers only the
-- subset the runner actually reads (status = 'dismissed').
create index if not exists ai_nudges_user_fingerprint_dismissed_idx
  on ai_nudges(user_id, fingerprint, dismissed_at desc)
  where status = 'dismissed';

-- ============================================================
-- 2. Per-user mention dismissals
-- ============================================================

create table if not exists mention_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references journal_entries(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, entry_id)
);

create index if not exists mention_dismissals_user_idx
  on mention_dismissals(user_id, dismissed_at desc);

alter table mention_dismissals enable row level security;

-- Users can read / insert / delete their own dismissal records only.
-- No update — dismiss / restore is a hard insert / delete cycle.
drop policy if exists "users read own mention dismissals" on mention_dismissals;
create policy "users read own mention dismissals" on mention_dismissals
  for select using (user_id = auth.uid());

drop policy if exists "users insert own mention dismissals" on mention_dismissals;
create policy "users insert own mention dismissals" on mention_dismissals
  for insert with check (user_id = auth.uid());

drop policy if exists "users delete own mention dismissals" on mention_dismissals;
create policy "users delete own mention dismissals" on mention_dismissals
  for delete using (user_id = auth.uid());
