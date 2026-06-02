-- Phase 27 — Tighten task-write permissions.
--
-- Two restrictions added on top of the existing role model:
--   1. Only OWNERS can delete tasks. Editors can still insert + update,
--      but the delete affordance is owner-only. Phase 6 had a single
--      "owners and editors write tasks" policy with FOR ALL — split it
--      into INSERT, UPDATE (still both roles), and DELETE (owners only).
--   2. PICs cannot change task status. Phase 6 gave PICs FOR UPDATE on
--      their own tasks; that's still true for everything EXCEPT the
--      status column. Enforced via a BEFORE UPDATE trigger that
--      compares OLD.status to NEW.status and raises if the caller's
--      workspace role is 'pic'.
--
-- Existing PIC restrictions (untouched):
--   - PICs can SELECT only their own tasks (pic_id = me).
--   - PICs cannot INSERT — they have no insert policy, so default deny.
--   - PICs cannot DELETE — same default deny.
--
-- Re-runnable: every CREATE statement is paired with a DROP IF EXISTS.

-- ============================================================
-- 1. Split task write policies — owners-only DELETE
-- ============================================================

drop policy if exists "owners and editors write tasks" on tasks;
drop policy if exists "editors insert tasks" on tasks;
drop policy if exists "editors update tasks" on tasks;
drop policy if exists "owners delete tasks" on tasks;

-- INSERT: owners + editors can create tasks anywhere in their workspace.
create policy "editors insert tasks" on tasks
  for insert with check (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('owner', 'editor')
    )
  );

-- UPDATE: owners + editors can update tasks (PIC-restricted update of
-- their own tasks lives in a separate phase-6 policy, untouched).
create policy "editors update tasks" on tasks
  for update using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('owner', 'editor')
    )
  );

-- DELETE: owners only.
create policy "owners delete tasks" on tasks
  for delete using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- ============================================================
-- 2. Block PIC status changes via trigger
-- ============================================================
--
-- RLS can't column-gate updates, and we still want PICs to edit
-- everything ELSE on their tasks (notes, watchers, etc). A BEFORE
-- UPDATE trigger lets us let through every column except status.

create or replace function block_pic_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
begin
  -- Look up the caller's role in this task's workspace. NULL when
  -- the caller isn't a workspace member (shouldn't happen — RLS
  -- already blocks them — but defensive).
  select role into caller_role
  from public.workspace_members
  where user_id = auth.uid()
    and workspace_id = new.workspace_id;

  if caller_role = 'pic'
     and old.status is distinct from new.status then
    raise exception 'PICs cannot change task status'
      using errcode = 'insufficient_privilege',
            hint    = 'Ask an editor or owner to move this task forward.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_pic_status_change on tasks;
create trigger trg_block_pic_status_change
  before update on tasks
  for each row execute function block_pic_status_change();
