-- Phase 17 — Task dependencies
--
-- One row per directed edge: blocker_id BLOCKS blocked_id.
-- A task can have many blockers and many blocked tasks (M:N).
--
-- Self-block prevented by check. Composite PK prevents duplicate
-- edges. ON DELETE CASCADE so deleting either endpoint clears the
-- edge.

create table if not exists task_dependencies (
  blocker_id uuid not null references tasks(id) on delete cascade,
  blocked_id uuid not null references tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists task_dependencies_blocker_idx
  on task_dependencies(blocker_id);
create index if not exists task_dependencies_blocked_idx
  on task_dependencies(blocked_id);

alter table task_dependencies enable row level security;

-- Visibility / write access: both endpoints must be visible to the
-- caller per the tasks RLS. EXISTS subqueries on tasks inherit tasks
-- RLS, so this naturally limits to workspaces the user belongs to.

drop policy if exists "members see deps" on task_dependencies;
create policy "members see deps" on task_dependencies
  for select using (
    exists (select 1 from tasks where id = blocker_id)
    and exists (select 1 from tasks where id = blocked_id)
  );

drop policy if exists "members insert deps" on task_dependencies;
create policy "members insert deps" on task_dependencies
  for insert with check (
    exists (select 1 from tasks where id = blocker_id)
    and exists (select 1 from tasks where id = blocked_id)
  );

drop policy if exists "members delete deps" on task_dependencies;
create policy "members delete deps" on task_dependencies
  for delete using (
    exists (select 1 from tasks where id = blocker_id)
    and exists (select 1 from tasks where id = blocked_id)
  );
