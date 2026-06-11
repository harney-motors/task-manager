-- Phase 31 — Comment reactions
--
-- Slack-style emoji reactions on journal entries (comments). A user
-- can have multiple distinct emojis on one comment (a 👍 and a 🎉)
-- but not the same emoji twice — the composite primary key gives us
-- that constraint for free.

create table if not exists comment_reactions (
  entry_id uuid not null references journal_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id, emoji)
);

create index if not exists comment_reactions_entry_idx
  on comment_reactions(entry_id);

-- Realtime so reactions pop in for everyone viewing the same task.
do $$
begin
  alter publication supabase_realtime add table comment_reactions;
exception
  when duplicate_object then null;
end $$;

alter table comment_reactions enable row level security;

-- SELECT: anyone who can see the journal entry can see its reactions.
-- We inherit the entry's reachability rule via task RLS.
drop policy if exists "users see reactions on entries they can see"
  on comment_reactions;
create policy "users see reactions on entries they can see"
  on comment_reactions
  for select using (
    entry_id in (select id from journal_entries)
  );

-- INSERT: only as yourself, and only on entries you can see.
drop policy if exists "users add own reactions" on comment_reactions;
create policy "users add own reactions" on comment_reactions
  for insert with check (
    user_id = auth.uid()
    and entry_id in (select id from journal_entries)
  );

-- DELETE: only your own reactions.
drop policy if exists "users remove own reactions" on comment_reactions;
create policy "users remove own reactions" on comment_reactions
  for delete using (user_id = auth.uid());
