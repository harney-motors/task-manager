-- Loop — schema v1
-- Paste this entire file into the Supabase SQL editor and run once.
-- Reflects BUILD_PLAN.md §3 but with the ordering bug fixed:
-- all CREATE TABLE statements come before any CREATE POLICY,
-- because policies are validated against existing tables at creation time.
-- Whole file is idempotent (create-if-not-exists, drop-policy-if-exists)
-- so it's safe to re-run after a partial failure.

-- ============================================================
-- 1. TABLES
-- ============================================================

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

create table if not exists workspace_members (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  created_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  initials text,
  title text,
  department text,
  role text not null check (role in ('owner', 'editor', 'pic')),
  color text not null default 'gray',
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  name text not null,
  color text not null default 'gray',
  created_at timestamptz default now(),
  unique (workspace_id, name)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  task_number serial,
  title text not null,
  notes text,
  pic_id uuid references people(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  start_date date,
  due_date date,
  priority text default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  status text default 'Open' check (status in ('Open', 'In progress', 'Done')),
  tags text[] default '{}',
  source text default 'Manual entry',
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade not null,
  author_id uuid references auth.users(id),
  body text not null,
  entry_type text default 'note' check (entry_type in ('note', 'status_change')),
  status_value text,
  created_at timestamptz default now()
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  actor_id uuid references auth.users(id),
  task_id uuid references tasks(id) on delete cascade,
  action text not null,
  payload jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- 2. ENABLE ROW-LEVEL SECURITY
-- ============================================================

alter table workspaces        enable row level security;
alter table workspace_members enable row level security;
alter table people            enable row level security;
alter table departments       enable row level security;
alter table tasks             enable row level security;
alter table journal_entries   enable row level security;
alter table activity_log      enable row level security;

-- ============================================================
-- 3. POLICIES
-- ============================================================

-- Note: BUILD_PLAN.md §3.1 originally included an OR clause checking
-- raw_app_meta_data->>'is_superadmin' via `auth.users`. The authenticated
-- role doesn't have SELECT on auth.users in Supabase by default, which
-- caused the entire policy expression to fail rather than evaluating
-- the OR branch to false — so legitimate members couldn't read their
-- own workspaces from the client.
-- Superadmin access can be reintroduced later via auth.jwt()->'app_metadata'
-- (a built-in helper that reads claims directly from the JWT and doesn't
-- require querying auth.users).
drop policy if exists "members see their workspaces" on workspaces;
create policy "members see their workspaces" on workspaces
  for select using (
    id in (
      select workspace_id from workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "users see their own memberships" on workspace_members;
create policy "users see their own memberships" on workspace_members
  for select using (user_id = auth.uid());

drop policy if exists "workspace members see all people in their workspace" on people;
create policy "workspace members see all people in their workspace" on people
  for all using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

drop policy if exists "workspace members see all departments in their workspace" on departments;
create policy "workspace members see all departments in their workspace" on departments
  for all using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

drop policy if exists "workspace members see tasks" on tasks;
create policy "workspace members see tasks" on tasks
  for all using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

-- Future: when a PIC is linked to a user account, let them see their own tasks
drop policy if exists "PICs see their own tasks" on tasks;
create policy "PICs see their own tasks" on tasks
  for select using (
    pic_id in (select id from people where user_id = auth.uid())
  );

drop policy if exists "users see journal for tasks they can see" on journal_entries;
create policy "users see journal for tasks they can see" on journal_entries
  for all using (
    task_id in (select id from tasks)
  );

drop policy if exists "workspace members see activity" on activity_log;
create policy "workspace members see activity" on activity_log
  for all using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

-- ============================================================
-- 4. INDEXES
-- ============================================================

create index if not exists people_workspace_idx       on people(workspace_id);
create index if not exists tasks_workspace_idx        on tasks(workspace_id);
create index if not exists tasks_pic_idx              on tasks(pic_id);
create index if not exists tasks_due_idx              on tasks(due_date);
create index if not exists tasks_status_idx           on tasks(status);
create index if not exists journal_task_idx           on journal_entries(task_id);
create index if not exists activity_workspace_idx     on activity_log(workspace_id, created_at desc);

-- ============================================================
-- 5. TRIGGERS
-- ============================================================

create or replace function update_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_updated_at on tasks;
create trigger tasks_updated_at before update on tasks
  for each row execute function update_updated_at();
