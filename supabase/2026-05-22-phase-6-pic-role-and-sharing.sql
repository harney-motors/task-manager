-- Phase 6 — Multi-workspace sharing + PIC role
--
-- Two complementary changes:
--   (a) Adds 'pic' as a third value of workspace_members.role.
--       owner/editor → full workspace access (current behavior).
--       pic         → read-only to their own tasks + watched tasks,
--                     can UPDATE their own (so they can move status
--                     and add journal notes).
--   (b) Splits the tasks RLS into role-aware policies so PIC-role
--       members get a constrained view.
--
-- Multi-workspace sharing (the other half of this phase) is purely a
-- client change — workspace_members has always been many-to-many, the
-- UI just didn't expose it.
--
-- Idempotent.

-- ============================================================
-- 1. workspace_members.role — add 'pic'
-- ============================================================
alter table workspace_members
  drop constraint if exists workspace_members_role_check;
alter table workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'editor', 'pic'));

-- ============================================================
-- 2. tasks RLS — split into role-aware policies
-- ============================================================
drop policy if exists "workspace members see tasks"   on tasks;
drop policy if exists "PICs see their own tasks"      on tasks;
drop policy if exists "owners and editors see tasks"  on tasks;
drop policy if exists "owners and editors write tasks" on tasks;
drop policy if exists "pics see own tasks"            on tasks;
drop policy if exists "pics update own tasks"         on tasks;

-- Owners + editors: full CRUD on every task in their workspace
create policy "owners and editors write tasks" on tasks
  for all using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('owner', 'editor')
    )
  )
  with check (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('owner', 'editor')
    )
  );

-- PICs: SELECT only tasks where they're the assignee or a watcher
create policy "pics see own tasks" on tasks
  for select using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role = 'pic'
    )
    and (
      pic_id in (select id from people where user_id = auth.uid())
      or id in (
        select task_id from task_watchers tw
        join people p on p.id = tw.person_id
        where p.user_id = auth.uid()
      )
    )
  );

-- PICs: UPDATE only tasks where they're the assignee. RLS doesn't
-- do column-level — the UI is what decides which fields a PIC can
-- change (status + notes + journal). PICs cannot delete (no DELETE
-- policy for them) and cannot insert (no INSERT policy).
create policy "pics update own tasks" on tasks
  for update using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role = 'pic'
    )
    and pic_id in (select id from people where user_id = auth.uid())
  );

-- ============================================================
-- 3. journal_entries RLS — keep the simple "if you can see the task,
--    you can see/write its journal" rule. RLS on tasks does the work.
-- ============================================================
drop policy if exists "users see journal for tasks they can see" on journal_entries;
create policy "users see journal for tasks they can see" on journal_entries
  for select using (task_id in (select id from tasks));

drop policy if exists "users write journal for tasks they can see" on journal_entries;
create policy "users write journal for tasks they can see" on journal_entries
  for insert with check (task_id in (select id from tasks));

-- ============================================================
-- 4. admin_add_member — accept 'pic' as a valid role
-- ============================================================
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
  if p_role not in ('owner', 'editor', 'pic') then
    raise exception 'Invalid role: %', p_role;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
    values (p_workspace_id, p_user_id, p_role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
end;
$$;

grant execute on function admin_add_member(uuid, uuid, text) to authenticated;

-- ============================================================
-- 5. admin_link_person — link an existing people row to an auth user.
--    Used when a PIC gets a login so their tasks resolve.
-- ============================================================
create or replace function admin_link_person(p_person_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.superadmins where user_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found';
  end if;
  update public.people set user_id = p_user_id where id = p_person_id;
end;
$$;

grant execute on function admin_link_person(uuid, uuid) to authenticated;
