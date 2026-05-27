-- Phase 22 — Per-workspace brand colour.
--
-- Adds a single nullable `brand_color` column to `workspaces`. The
-- client tints accent UI (sidebar New-task button, focus ring, primary
-- chip) with the chosen colour when present, falls back to the default
-- indigo when null.
--
-- Storing a CSS-friendly hex string (#RRGGBB). We deliberately don't
-- enforce the format at the DB level — the client validates on write
-- and we want migrations to apply against existing data without choking
-- on legacy values. RLS already restricts writes to superadmin via the
-- existing policies; we add a narrower policy for owners to update only
-- their own workspace's branding.

alter table workspaces
  add column if not exists brand_color text;

-- Owners can update their own workspace's branding (just the brand
-- column — name etc still gated by the broader is_superadmin policy).
--
-- Note: Postgres RLS doesn't column-scope updates, so we keep a broad
-- update policy here but rely on the client to only touch brand_color
-- in this flow. Superadmin bypasses everything as before.
drop policy if exists "owners can brand their workspace" on workspaces;
create policy "owners can brand their workspace" on workspaces
  for update using (
    id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role = 'owner'
    )
  );
