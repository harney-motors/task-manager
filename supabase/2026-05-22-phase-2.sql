-- Phase 2 migration — Dyna's WEM data model
--
-- Adds:
--   1. tasks.raised_date  — date the action was minuted in the WEM
--   2. 'Ongoing' as a 4th status value (initiatives with no end date)
--   3. task_watchers join table — secondary collaborators on a task
--      (single accountable PIC stays as tasks.pic_id; watchers are
--      kept aware but not accountable)
--
-- Idempotent: re-runnable.

-- ============================================================
-- 1. raised_date
-- ============================================================
alter table tasks add column if not exists raised_date date;

create index if not exists tasks_raised_date_idx on tasks(raised_date);

-- ============================================================
-- 2. status enum: add 'Ongoing'
-- ============================================================
alter table tasks drop constraint if exists tasks_status_check;
alter table tasks
  add constraint tasks_status_check
  check (status in ('Open', 'In progress', 'Done', 'Ongoing'));

-- ============================================================
-- 3. task_watchers
-- ============================================================
create table if not exists task_watchers (
  task_id   uuid references tasks(id)  on delete cascade,
  person_id uuid references people(id) on delete cascade,
  added_at  timestamptz default now(),
  primary key (task_id, person_id)
);

alter table task_watchers enable row level security;

drop policy if exists "workspace members see watchers" on task_watchers;
create policy "workspace members see watchers" on task_watchers
  for all using (
    task_id in (
      select id from tasks
      where workspace_id in (
        select workspace_id from workspace_members
        where user_id = auth.uid()
      )
    )
  );

create index if not exists task_watchers_task_idx   on task_watchers(task_id);
create index if not exists task_watchers_person_idx on task_watchers(person_id);
