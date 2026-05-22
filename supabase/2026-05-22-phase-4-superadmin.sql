-- Phase 4 — Super Admin control plane
--
-- Adds:
--   1. superadmins table — the access list
--   2. Extended RLS on workspaces, workspace_members, people,
--      departments, activity_log so superadmins can read across all
--      tenants. tasks + journal_entries are NOT extended — content
--      stays private per BUILD_PLAN §2 ("cannot see task content
--      unless added as a member").
--   3. RPC functions for cross-workspace admin operations.
--   4. Bootstrap: Asbert as the first superadmin.
--
-- Idempotent: re-runnable.

-- ============================================================
-- 1. superadmins table
-- ============================================================
create table if not exists superadmins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  notes      text
);

alter table superadmins enable row level security;

-- A user can check whether THEY themselves are a superadmin.
-- Anyone else's row is invisible to them. This is chicken-and-egg
-- safe — every user can read at most one row (their own).
drop policy if exists "superadmins read self" on superadmins;
create policy "superadmins read self" on superadmins
  for select using (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE intentionally have no policy → blocked from
-- client. Use the RPC functions below (security definer) instead.

-- ============================================================
-- 2. Extended RLS — read across all workspaces if superadmin
-- ============================================================

drop policy if exists "members see their workspaces" on workspaces;
drop policy if exists "members and superadmins see workspaces" on workspaces;
create policy "members and superadmins see workspaces" on workspaces
  for select using (
    id in (select workspace_id from workspace_members where user_id = auth.uid())
    or exists (select 1 from superadmins where user_id = auth.uid())
  );

drop policy if exists "superadmins manage workspaces" on workspaces;
create policy "superadmins manage workspaces" on workspaces
  for all using (
    exists (select 1 from superadmins where user_id = auth.uid())
  )
  with check (
    exists (select 1 from superadmins where user_id = auth.uid())
  );

drop policy if exists "users see their own memberships" on workspace_members;
drop policy if exists "members and superadmins see memberships" on workspace_members;
create policy "members and superadmins see memberships" on workspace_members
  for select using (
    user_id = auth.uid()
    or exists (select 1 from superadmins where user_id = auth.uid())
  );

drop policy if exists "superadmins manage memberships" on workspace_members;
create policy "superadmins manage memberships" on workspace_members
  for all using (
    exists (select 1 from superadmins where user_id = auth.uid())
  )
  with check (
    exists (select 1 from superadmins where user_id = auth.uid())
  );

drop policy if exists "superadmins see all people" on people;
create policy "superadmins see all people" on people
  for select using (
    exists (select 1 from superadmins where user_id = auth.uid())
  );

drop policy if exists "superadmins see all departments" on departments;
create policy "superadmins see all departments" on departments
  for select using (
    exists (select 1 from superadmins where user_id = auth.uid())
  );

drop policy if exists "superadmins see all activity" on activity_log;
create policy "superadmins see all activity" on activity_log
  for select using (
    exists (select 1 from superadmins where user_id = auth.uid())
  );

-- ============================================================
-- 3. RPC functions
-- ============================================================

-- get_all_users — every auth user with their workspace memberships and superadmin flag.
create or replace function get_all_users()
returns table (
  id              uuid,
  email           text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  is_superadmin   boolean,
  workspaces      jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    exists (select 1 from public.superadmins s where s.user_id = u.id) as is_superadmin,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', w.id, 'name', w.name, 'role', wm.role)
          order by w.name
        )
        from public.workspace_members wm
        join public.workspaces w on w.id = wm.workspace_id
        where wm.user_id = u.id
      ),
      '[]'::jsonb
    ) as workspaces
  from auth.users u
  where exists (select 1 from public.superadmins where user_id = auth.uid())
  order by u.created_at desc
$$;

grant execute on function get_all_users() to authenticated;


-- admin_workspace_stats — one row per workspace with aggregate counts.
create or replace function admin_workspace_stats()
returns table (
  id            uuid,
  name          text,
  created_at    timestamptz,
  member_count  int,
  people_count  int,
  task_count    int,
  last_activity timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    w.id,
    w.name,
    w.created_at,
    (select count(*)::int from public.workspace_members wm where wm.workspace_id = w.id) as member_count,
    (select count(*)::int from public.people p          where p.workspace_id  = w.id and p.is_active) as people_count,
    (select count(*)::int from public.tasks t           where t.workspace_id  = w.id) as task_count,
    (select max(al.created_at) from public.activity_log al where al.workspace_id = w.id) as last_activity
  from public.workspaces w
  where exists (select 1 from public.superadmins where user_id = auth.uid())
  order by w.created_at desc
$$;

grant execute on function admin_workspace_stats() to authenticated;


-- admin_system_stats — global counts for the System tab.
create or replace function admin_system_stats()
returns table (
  total_users        int,
  total_superadmins  int,
  total_workspaces   int,
  total_tasks        int,
  total_people       int,
  total_activity     int
)
language sql
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from auth.users),
    (select count(*)::int from public.superadmins),
    (select count(*)::int from public.workspaces),
    (select count(*)::int from public.tasks),
    (select count(*)::int from public.people where is_active),
    (select count(*)::int from public.activity_log)
  where exists (select 1 from public.superadmins where user_id = auth.uid())
$$;

grant execute on function admin_system_stats() to authenticated;


-- admin_create_workspace — bootstrap a new workspace with an initial owner.
create or replace function admin_create_workspace(p_name text, p_owner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  if not exists (select 1 from public.superadmins where user_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Name is required';
  end if;
  if p_owner_id is null then
    raise exception 'Owner is required';
  end if;
  if not exists (select 1 from auth.users where id = p_owner_id) then
    raise exception 'Owner user not found';
  end if;

  insert into public.workspaces (name, created_by)
    values (p_name, p_owner_id)
    returning id into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace, p_owner_id, 'owner');

  return v_workspace;
end;
$$;

grant execute on function admin_create_workspace(text, uuid) to authenticated;


-- admin_delete_workspace — cascade-delete a workspace.
create or replace function admin_delete_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.superadmins where user_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;
  delete from public.workspaces where id = p_workspace_id;
end;
$$;

grant execute on function admin_delete_workspace(uuid) to authenticated;


-- admin_promote_user — add to superadmins.
create or replace function admin_promote_user(p_user_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.superadmins where user_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;
  insert into public.superadmins (user_id, notes)
    values (p_user_id, p_notes)
    on conflict (user_id) do update set notes = excluded.notes;
end;
$$;

grant execute on function admin_promote_user(uuid, text) to authenticated;


-- admin_demote_user — remove from superadmins, but never the last one.
create or replace function admin_demote_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not exists (select 1 from public.superadmins where user_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;
  select count(*) into v_count from public.superadmins;
  if v_count <= 1 then
    raise exception 'Cannot demote the last superadmin';
  end if;
  delete from public.superadmins where user_id = p_user_id;
end;
$$;

grant execute on function admin_demote_user(uuid) to authenticated;


-- admin_add_member — add a user to a workspace with a role.
create or replace function admin_add_member(p_workspace_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.superadmins where user_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;
  if p_role not in ('owner', 'editor') then
    raise exception 'Invalid role';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
    values (p_workspace_id, p_user_id, p_role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
end;
$$;

grant execute on function admin_add_member(uuid, uuid, text) to authenticated;


-- admin_remove_member
create or replace function admin_remove_member(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.superadmins where user_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;
  delete from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_user_id;
end;
$$;

grant execute on function admin_remove_member(uuid, uuid) to authenticated;

-- ============================================================
-- 4. Bootstrap — Asbert as the first superadmin
-- ============================================================
insert into superadmins (user_id, notes)
  select id, 'platform owner' from auth.users
  where email = 'asbert@harneymotorsltd.com'
on conflict (user_id) do nothing;
