-- Phase 35 — Duplicate task detection: dismissals store
--
-- The AI duplicate scanner can re-suggest the same pair every time
-- if the user has already decided "these are NOT duplicates, keep
-- both". This table records those decisions so the scanner can skip
-- the pair on subsequent runs.
--
-- Pair ids are stored canonical (smaller uuid first as task_a) so
-- (X, Y) and (Y, X) hash to the same row. A composite PK on
-- (task_a_id, task_b_id) gives us the dedupe + cheap lookup.

create table if not exists task_duplicate_dismissals (
  task_a_id uuid not null references tasks(id) on delete cascade,
  task_b_id uuid not null references tasks(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  dismissed_by uuid references auth.users(id) on delete set null,
  dismissed_at timestamptz not null default now(),
  -- Optional reason text the user can stash for context — currently
  -- unused by the UI but cheap to keep around.
  reason text,
  primary key (task_a_id, task_b_id),
  -- Defensive: enforce canonical ordering at the DB level so misuses
  -- of the API can't sneak in (X, Y) and (Y, X) as separate rows.
  check (task_a_id < task_b_id)
);

create index if not exists task_dup_dismissals_workspace_idx
  on task_duplicate_dismissals(workspace_id);

alter table task_duplicate_dismissals enable row level security;

-- READ: anyone in the workspace can see existing dismissals — the
-- scanner needs to read them, and they don't expose anything beyond
-- "these two tasks were marked not-duplicates."
drop policy if exists "members read dup dismissals" on task_duplicate_dismissals;
create policy "members read dup dismissals" on task_duplicate_dismissals
  for select using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- WRITE: editors + owners can dismiss; PICs are read-mostly per the
-- existing workspace policy posture.
drop policy if exists "editors write dup dismissals" on task_duplicate_dismissals;
create policy "editors write dup dismissals" on task_duplicate_dismissals
  for insert with check (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('editor', 'owner')
    )
  );

-- DELETE: same audience as INSERT. Used if a user changes their mind
-- ("actually these ARE duplicates").
drop policy if exists "editors delete dup dismissals" on task_duplicate_dismissals;
create policy "editors delete dup dismissals" on task_duplicate_dismissals
  for delete using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('editor', 'owner')
    )
  );
