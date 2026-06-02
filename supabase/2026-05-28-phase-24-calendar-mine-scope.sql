-- Phase 24 — Per-user calendar subscription scope.
--
-- Until now every calendar_feed_tokens row served EVERY task in the
-- workspace. This adds a `scope` column so a user can choose:
--   - 'workspace'  → all tasks in the workspace (legacy behaviour, default)
--   - 'mine'       → only tasks where I'm the PIC or a watcher
--
-- Both can coexist for the same (user, workspace) pair so people can
-- subscribe to both a "team-wide overview" calendar and a "personal
-- focus" calendar at the same time. The old unique constraint is
-- replaced with one that includes scope.

alter table calendar_feed_tokens
  add column if not exists scope text not null default 'workspace';

-- Constrain scope to known values. Wrapped in DO so re-runs are safe.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'calendar_feed_tokens_scope_check'
  ) then
    alter table calendar_feed_tokens
      add constraint calendar_feed_tokens_scope_check
      check (scope in ('workspace', 'mine'));
  end if;
end $$;

-- Swap the unique constraint to include scope so the same user can
-- hold one active token per (workspace, scope) pair simultaneously.
alter table calendar_feed_tokens
  drop constraint if exists calendar_feed_tokens_user_id_workspace_id_revoked_at_key;

alter table calendar_feed_tokens
  drop constraint if exists calendar_feed_tokens_user_workspace_scope_active_key;

alter table calendar_feed_tokens
  add constraint calendar_feed_tokens_user_workspace_scope_active_key
  unique (user_id, workspace_id, scope, revoked_at);
