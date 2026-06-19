-- Phase 34 — Doc privacy + sharing
--
-- Docs were workspace-visible-to-all from day one. New requirement:
-- docs are PRIVATE to their author by default, and visibility expands
-- only via explicit sharing. Two dimensions:
--
--   1. `is_workspace_visible boolean`  — flip ON to give every
--      workspace member read access (preserves the old behaviour
--      when the author wants it).
--   2. New `doc_shares` table         — per-user invitations with
--      a permission level (view / edit) so the author can hand a
--      specific person editor access without making the whole
--      workspace privy.
--
-- Backfill rule: EVERY existing doc keeps its current visibility by
-- being marked workspace-visible. The new "private by default" only
-- applies to docs created AFTER this migration runs.
--
-- Author bypass: created_by = auth.uid() always sees + edits + deletes
-- their own doc, regardless of share state.
-- Workspace owner safety net: can DELETE any doc in their workspace
-- (in case a leaver's private doc needs to be cleaned up).

-- ============================================================
-- 1. New columns + table
-- ============================================================

alter table docs
  add column if not exists is_workspace_visible boolean not null default false;

-- Existing docs preserve the previous "everyone can see" behaviour.
-- This UPDATE runs once on first migration; the WHERE filter is a
-- no-op safety guard for re-runs.
update docs set is_workspace_visible = true
  where is_workspace_visible = false
  and created_at < now();

create table if not exists doc_shares (
  doc_id uuid not null references docs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null
    check (permission in ('view', 'edit'))
    default 'view',
  created_at timestamptz not null default now(),
  primary key (doc_id, user_id)
);

create index if not exists doc_shares_user_idx on doc_shares(user_id);
create index if not exists doc_shares_doc_idx on doc_shares(doc_id);

-- ============================================================
-- 2. Replace the docs RLS policies
-- ============================================================

-- READ: author OR (workspace-visible AND workspace member) OR
--       explicit share entry. Superadmins bypass via is_superadmin().
drop policy if exists "workspace members read docs" on docs;
drop policy if exists "author or shared see docs" on docs;
create policy "author or shared see docs" on docs
  for select using (
    created_by = auth.uid()
    or (
      is_workspace_visible
      and workspace_id in (
        select workspace_id from workspace_members
        where user_id = auth.uid()
      )
    )
    or id in (
      select doc_id from doc_shares where user_id = auth.uid()
    )
    or exists (select 1 from superadmins where user_id = auth.uid())
  );

-- INSERT: editors + owners in the target workspace, same as before.
-- New docs default to is_workspace_visible = false so they stay
-- private until the author shares.
drop policy if exists "editors write docs" on docs;
create policy "editors write docs" on docs
  for insert with check (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('editor', 'owner')
    )
  );

-- UPDATE: author OR doc_share with 'edit' permission. The old
-- "any editor can edit any doc" rule no longer applies — that was
-- the previously-shared-by-default behaviour.
drop policy if exists "editors update docs" on docs;
drop policy if exists "author or editor share updates docs" on docs;
create policy "author or editor share updates docs" on docs
  for update using (
    created_by = auth.uid()
    or id in (
      select doc_id from doc_shares
      where user_id = auth.uid() and permission = 'edit'
    )
    or exists (select 1 from superadmins where user_id = auth.uid())
  );

-- DELETE: author OR workspace owner (moderation safety net) OR
-- superadmin. Drops the previous "any editor can delete" policy.
drop policy if exists "editors delete docs" on docs;
drop policy if exists "owners delete docs" on docs;
drop policy if exists "author or owner deletes docs" on docs;
create policy "author or owner deletes docs" on docs
  for delete using (
    created_by = auth.uid()
    or workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role = 'owner'
    )
    or exists (select 1 from superadmins where user_id = auth.uid())
  );

-- ============================================================
-- 3. RLS for doc_shares itself
-- ============================================================

alter table doc_shares enable row level security;

-- READ: only the doc's author or the share's recipient. Other
-- workspace members shouldn't see who has access to someone else's
-- private doc.
drop policy if exists "author or recipient see shares" on doc_shares;
create policy "author or recipient see shares" on doc_shares
  for select using (
    user_id = auth.uid()
    or doc_id in (select id from docs where created_by = auth.uid())
    or exists (select 1 from superadmins where user_id = auth.uid())
  );

-- WRITE: only the doc's author can create / change / remove shares.
drop policy if exists "author manages shares" on doc_shares;
create policy "author manages shares" on doc_shares
  for insert with check (
    doc_id in (select id from docs where created_by = auth.uid())
  );

drop policy if exists "author updates shares" on doc_shares;
create policy "author updates shares" on doc_shares
  for update using (
    doc_id in (select id from docs where created_by = auth.uid())
  );

drop policy if exists "author removes shares" on doc_shares;
create policy "author removes shares" on doc_shares
  for delete using (
    doc_id in (select id from docs where created_by = auth.uid())
    or exists (select 1 from superadmins where user_id = auth.uid())
  );

-- Realtime so the Share modal updates when the doc owner adds/removes
-- recipients in another tab.
do $$
begin
  alter publication supabase_realtime add table doc_shares;
exception when duplicate_object then null;
end $$;
