-- Phase 7 — async AI extraction jobs
--
-- The extract-tasks Netlify function was hitting the 26s sync ceiling
-- on long transcripts (Opus latency, not a bug). Background functions
-- get 15 min but return 202 immediately, so the client needs a place
-- to poll for the result. That's this table.
--
-- Lifecycle:
--   1. Client INSERTs a row with transcript + status='pending'.
--   2. Client POSTs job_id to extract-tasks-background (fire-and-forget).
--   3. Function reads the row, calls Claude, UPDATEs the row with
--      result jsonb + status='completed' (or 'failed' + error).
--   4. Client polls the row every ~2s until status changes.
--
-- RLS: each user only sees/touches their own jobs. The background
-- function runs with the caller's JWT so the same policy gates it.

create table if not exists ai_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  status text not null
    check (status in ('pending', 'completed', 'failed'))
    default 'pending',
  transcript text not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_extraction_jobs_user_created_idx
  on ai_extraction_jobs(user_id, created_at desc);

alter table ai_extraction_jobs enable row level security;

drop policy if exists "users see own ai jobs" on ai_extraction_jobs;
create policy "users see own ai jobs" on ai_extraction_jobs
  for select using (user_id = auth.uid());

drop policy if exists "users insert own ai jobs" on ai_extraction_jobs;
create policy "users insert own ai jobs" on ai_extraction_jobs
  for insert with check (user_id = auth.uid());

drop policy if exists "users update own ai jobs" on ai_extraction_jobs;
create policy "users update own ai jobs" on ai_extraction_jobs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
