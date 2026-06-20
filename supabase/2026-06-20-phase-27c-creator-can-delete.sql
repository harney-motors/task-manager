-- Phase 27c — Let task creators delete their own tasks
--
-- Phase 27 restricted task deletion to workspace owners to prevent
-- editors from accidentally wiping each other's work. That's still
-- the right protection for *other people's* tasks — but it surfaces
-- as an annoying "you don't have permission" any time the user
-- legitimately wants to clean up a task they created (most acutely
-- in the duplicate scanner flow: "I just made a dup of an existing
-- task, let me delete the one I just made").
--
-- New rule: deletion is allowed when
--   - the caller is the task's creator (created_by = auth.uid()), OR
--   - the caller is a workspace owner, OR
--   - the caller is a superadmin (bypass)
-- Editors who didn't create the task still can't delete it; that
-- was the original protection and stays.

drop policy if exists "owners delete tasks" on tasks;
drop policy if exists "owners or creator delete tasks" on tasks;
create policy "owners or creator delete tasks" on tasks
  for delete using (
    created_by = auth.uid()
    or workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role = 'owner'
    )
    or exists (select 1 from superadmins where user_id = auth.uid())
  );
