-- Phase 26 — Let editors (not just owners) delete docs.
--
-- Phase 21 restricted DELETE on docs to owners only. In practice
-- editors create + edit most docs, so they need the matching delete
-- right or the UI's delete button silently no-ops (RLS returns 0
-- rows deleted, which supabase-js treats as success). Result: users
-- click delete and "nothing happens" with no error feedback.
--
-- Widening the policy to (editor, owner) matches how every other
-- doc operation already works. PICs remain read-only.

drop policy if exists "owners delete docs" on docs;
drop policy if exists "editors delete docs" on docs;
create policy "editors delete docs" on docs
  for delete using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('editor', 'owner')
    )
  );
