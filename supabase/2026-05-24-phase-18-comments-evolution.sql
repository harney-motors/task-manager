-- Phase 18 — Evolve journal entries into a comments thread.
--
-- Adds:
--   parent_id  — self-reference for one-level threading (replies).
--   mentions   — array of person ids referenced via @FirstName in body.
--
-- The journal_entries table stays as-is (no rename); the UI just calls
-- it "Comments" going forward. Keeps history + RLS intact, no data
-- migration needed.
--
-- Also enables Realtime replication so new comments push to open
-- clients without polling.

alter table journal_entries
  add column if not exists parent_id uuid references journal_entries(id) on delete cascade;

alter table journal_entries
  add column if not exists mentions uuid[] not null default '{}'::uuid[];

-- Index for thread lookups (children of a given parent)
create index if not exists journal_entries_parent_idx
  on journal_entries(parent_id);

-- Realtime: opt this table into Supabase's replication publication so
-- the client can subscribe. Safe to re-run — Postgres errors gracefully
-- if the table is already in the publication, which we swallow with
-- a do/catch block.
do $$
begin
  alter publication supabase_realtime add table journal_entries;
exception
  when duplicate_object then
    -- already in the publication, fine
    null;
end $$;
