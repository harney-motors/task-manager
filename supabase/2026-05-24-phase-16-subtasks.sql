-- Phase 16 — Subtasks / checklists
--
-- Stored as JSONB on the task itself (not a separate table) since
-- subtasks are conceptually owned by their parent task and we never
-- need to query across them. Shape:
--   [
--     { "id": "uuid", "title": "string", "done": boolean, "created_at": iso }
--   ]
-- Client generates ids via crypto.randomUUID() so we don't round-trip
-- the DB on every toggle.

alter table tasks
  add column if not exists subtasks jsonb not null default '[]'::jsonb;
