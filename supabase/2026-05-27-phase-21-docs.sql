-- Phase 21 — Docs area.
--
-- A new top-level "Docs" surface that lives alongside Tasks: free-form
-- markdown documents owned by a workspace. v1 ships as a flat list
-- (no folders, no nesting) with title + body. Folders + collaborative
-- edit + presence can come later without breaking this schema.
--
-- Permissions:
--   - workspace members read all docs in their workspace
--   - editors + owners can write
--   - PICs are read-only (matches their RLS posture elsewhere)
--   - superadmins bypass everything via the existing is_superadmin() helper

create table if not exists docs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  title         text not null default 'Untitled',
  body          text not null default '',
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists docs_workspace_idx on docs(workspace_id);
create index if not exists docs_updated_idx on docs(workspace_id, updated_at desc);

alter table docs enable row level security;

-- Read: any workspace member (any role, including PICs).
drop policy if exists "workspace members read docs" on docs;
create policy "workspace members read docs" on docs
  for select using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

-- Insert: editor + owner roles only (PICs cannot create docs).
drop policy if exists "editors write docs" on docs;
create policy "editors write docs" on docs
  for insert with check (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('editor', 'owner')
    )
  );

-- Update: same gate as insert.
drop policy if exists "editors update docs" on docs;
create policy "editors update docs" on docs
  for update using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('editor', 'owner')
    )
  );

-- Delete: owners only (more conservative than update).
drop policy if exists "owners delete docs" on docs;
create policy "owners delete docs" on docs
  for delete using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- Touch `updated_at` automatically. Mirrors the trigger we use on tasks.
create or replace function set_docs_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_docs_updated_at on docs;
create trigger trg_docs_updated_at
  before update on docs
  for each row execute function set_docs_updated_at();
