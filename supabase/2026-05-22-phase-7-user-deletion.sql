-- Phase 7 — User deletion support
--
-- Several columns on public schema tables reference auth.users(id)
-- without an ON DELETE clause. That defaults to NO ACTION → deleting
-- the auth user fails with FK constraint violation. We want delete
-- to work cleanly, with the user's content preserved but unattributed.
--
-- Adds ON DELETE SET NULL on:
--   workspaces.created_by       (workspace persists, creator unattributed)
--   tasks.created_by            (task persists, creator unattributed)
--   journal_entries.author_id   (note persists, author unattributed)
--   activity_log.actor_id       (history persists, actor unattributed)
--
-- Already-correct FKs (no changes needed):
--   workspace_members.user_id   → ON DELETE CASCADE  (membership disappears)
--   superadmins.user_id         → ON DELETE CASCADE  (role disappears)
--   people.user_id              → ON DELETE SET NULL (person stays, login link clears)
--
-- Idempotent — Postgres FK constraints are dropped + recreated cleanly.

-- ============================================================
-- workspaces.created_by
-- ============================================================
alter table workspaces
  drop constraint if exists workspaces_created_by_fkey;
alter table workspaces
  add constraint workspaces_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- ============================================================
-- tasks.created_by
-- ============================================================
alter table tasks
  drop constraint if exists tasks_created_by_fkey;
alter table tasks
  add constraint tasks_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- ============================================================
-- journal_entries.author_id
-- ============================================================
alter table journal_entries
  drop constraint if exists journal_entries_author_id_fkey;
alter table journal_entries
  add constraint journal_entries_author_id_fkey
  foreign key (author_id) references auth.users(id) on delete set null;

-- ============================================================
-- activity_log.actor_id
-- ============================================================
alter table activity_log
  drop constraint if exists activity_log_actor_id_fkey;
alter table activity_log
  add constraint activity_log_actor_id_fkey
  foreign key (actor_id) references auth.users(id) on delete set null;
