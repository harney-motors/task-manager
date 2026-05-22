-- Link Asbert's person record to his auth.users row so his name shows
-- in the activity feed as "You" / "Asbert Baptiste" instead of "Someone".
-- One-shot. Idempotent.
--
-- Dyna's workspace already does this via the seed-dyna-workspace.sql block;
-- Asbert's workspace was seeded earlier without the link, so this catches up.

update people
set user_id = (
  select id from auth.users
  where email = 'asbert@harneymotorsltd.com'
)
where workspace_id = (
    select id from workspaces where name = 'Asbert''s Workspace'
  )
  and name = 'Asbert Baptiste'
  and user_id is null;
