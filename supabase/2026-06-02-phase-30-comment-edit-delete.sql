-- Phase 30 — Comment edit + delete by author
--
-- Lets every user (PIC included) manage the comments they wrote:
--   - Delete: anytime
--   - Edit:   anytime per RLS; the 15-minute / no-reply window is a
--             UX rule enforced client-side in JournalPanel so users
--             can't quietly "rewrite history" after replies exist.
--
-- The RLS rule is intentionally simple ("author_id = auth.uid()") —
-- it doesn't care about role. PIC, editor, owner all have the same
-- relationship to their own comments.

-- ---------- Track edit timestamps ----------
alter table journal_entries
  add column if not exists updated_at timestamptz;

-- Trigger bumps updated_at only when `body` actually changes — keeps
-- the "edited" badge honest. (Other UPDATE paths, like the
-- search_vector refresh, would otherwise look like edits.)
create or replace function public.bump_journal_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if NEW.body is distinct from OLD.body then
    NEW.updated_at := now();
  end if;
  return NEW;
end;
$$;

drop trigger if exists journal_entries_bump_updated_at on journal_entries;
create trigger journal_entries_bump_updated_at
  before update on journal_entries
  for each row execute function public.bump_journal_updated_at();

-- ---------- RLS: authors can update + delete their own entries ----------
drop policy if exists "authors update own journal entries" on journal_entries;
create policy "authors update own journal entries" on journal_entries
  for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "authors delete own journal entries" on journal_entries;
create policy "authors delete own journal entries" on journal_entries
  for delete
  using (author_id = auth.uid());
