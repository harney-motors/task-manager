-- Phase 37 — Recurring tasks
--
-- Adds a single jsonb column to tasks. Recurrence is triggered
-- entirely client-side (when status flips to Done, the mutation
-- rewrites itself to {status:'Open', due_date:next} for tasks with
-- a recurrence_config). No background worker needed for v1.
--
-- recurrence_config shape (when not null):
--   {
--     "period":   "daily" | "weekly" | "monthly" | "yearly"
--                 | "days_after" | "custom",
--     "interval": 3,            -- days for "days_after"; reserved
--                                  for "every N period" in future
--     "weekdays": [1,3,5]       -- 0=Sun..6=Sat, only for "custom"
--   }
--
-- Null means "no recurrence". Removing recurrence is just setting
-- the column back to null, no separate flag needed.

alter table tasks
  add column if not exists recurrence_config jsonb;

-- Partial index — most tasks won't have recurrence, so a partial
-- index over recurring tasks is cheap and lets us cheaply ask
-- "show me all my recurring tasks" in the future.
create index if not exists tasks_recurrence_config_idx
  on tasks ((recurrence_config is not null))
  where recurrence_config is not null;
