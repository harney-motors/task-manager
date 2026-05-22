-- HOTFIX — infinite recursion between task_watchers and tasks RLS.
--
-- The Phase 6 "pics see own tasks" policy on tasks does:
--   ... or id in (select task_id from task_watchers tw join people p ...)
--
-- That subquery triggers task_watchers RLS, which in turn does:
--   ... task_id in (select id from tasks where workspace_id in (...))
--
-- That re-enters tasks RLS → "pics see own tasks" → task_watchers → tasks → …
-- Postgres raises 42P17 (infinite_recursion), surfaced to the client as 500.
--
-- Even though every existing user qualifies under the simpler
-- "owners and editors write tasks" policy (no recursion), Postgres must
-- evaluate every policy on the table to OR them, so the recursive one
-- kills the whole query before that OR can resolve. Both /tasks and
-- /activity_log (which embeds tasks) 500 on every read.
--
-- Fix: rewrite the task_watchers policy to resolve workspace membership
-- via the people table instead of tasks. People belongs-to a workspace,
-- watchers are always on a person in the same workspace as the task, and
-- the people RLS path is recursion-free.
--
-- Idempotent.

drop policy if exists "workspace members see watchers" on task_watchers;

create policy "workspace members see watchers" on task_watchers
  for all
  using (
    person_id in (
      select id from people
      where workspace_id in (
        select workspace_id from workspace_members
        where user_id = auth.uid()
      )
    )
  )
  with check (
    person_id in (
      select id from people
      where workspace_id in (
        select workspace_id from workspace_members
        where user_id = auth.uid()
      )
    )
  );
