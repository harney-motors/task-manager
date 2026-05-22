-- Phase 3 search migration
-- Adds tsvector + GIN indexes for fast workspace search across tasks,
-- people, and journal_entries. Triggers keep the vectors in sync on
-- every insert/update. Existing rows are backfilled at the end.
-- Idempotent: re-runnable.

-- ============================================================
-- 1. Columns
-- ============================================================
alter table tasks            add column if not exists search_vector tsvector;
alter table people           add column if not exists search_vector tsvector;
alter table journal_entries  add column if not exists search_vector tsvector;

-- ============================================================
-- 2. Triggers
-- ============================================================

create or replace function tasks_search_vector_fn() returns trigger as $$
begin
  new.search_vector := to_tsvector('english',
    coalesce(new.title, '')  || ' ' ||
    coalesce(new.notes, '')  || ' ' ||
    coalesce(new.source, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '')
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_search_vector_update on tasks;
create trigger tasks_search_vector_update
  before insert or update on tasks
  for each row execute function tasks_search_vector_fn();


create or replace function people_search_vector_fn() returns trigger as $$
begin
  new.search_vector := to_tsvector('english',
    coalesce(new.name, '')       || ' ' ||
    coalesce(new.title, '')      || ' ' ||
    coalesce(new.department, '')
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists people_search_vector_update on people;
create trigger people_search_vector_update
  before insert or update on people
  for each row execute function people_search_vector_fn();


create or replace function journal_search_vector_fn() returns trigger as $$
begin
  new.search_vector := to_tsvector('english', coalesce(new.body, ''));
  return new;
end;
$$ language plpgsql;

drop trigger if exists journal_search_vector_update on journal_entries;
create trigger journal_search_vector_update
  before insert or update on journal_entries
  for each row execute function journal_search_vector_fn();

-- ============================================================
-- 3. Backfill existing rows
-- ============================================================
update tasks set search_vector = to_tsvector('english',
  coalesce(title, '')  || ' ' ||
  coalesce(notes, '')  || ' ' ||
  coalesce(source, '') || ' ' ||
  coalesce(array_to_string(tags, ' '), '')
);

update people set search_vector = to_tsvector('english',
  coalesce(name, '')       || ' ' ||
  coalesce(title, '')      || ' ' ||
  coalesce(department, '')
);

update journal_entries set search_vector = to_tsvector('english', coalesce(body, ''));

-- ============================================================
-- 4. GIN indexes
-- ============================================================
create index if not exists tasks_search_idx            on tasks            using gin(search_vector);
create index if not exists people_search_idx           on people           using gin(search_vector);
create index if not exists journal_entries_search_idx  on journal_entries  using gin(search_vector);
