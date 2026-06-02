-- Phase 27 HOTFIX — restore SELECT on tasks for owners + editors.
--
-- The phase-27 migration replaced the broad "owners and editors
-- write tasks" policy (FOR ALL) with three narrower policies for
-- INSERT, UPDATE, and DELETE. SELECT was accidentally dropped along
-- with the rest, leaving owners + editors with no read access.
-- (PICs were unaffected — their existing "pics see own tasks" SELECT
-- policy still applies.)
--
-- Symptom: owners + editors see no tasks anywhere in the app.
-- Fix:    add back a SELECT policy scoped to owner + editor roles.

drop policy if exists "owners and editors read tasks" on tasks;
create policy "owners and editors read tasks" on tasks
  for select using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('owner', 'editor')
    )
  );
