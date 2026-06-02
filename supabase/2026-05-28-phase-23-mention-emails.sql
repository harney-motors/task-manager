-- Phase 23 — Mention emails.
--
-- Adds a per-(workspace, user) opt-out flag for "you got @mentioned"
-- emails. Default `true` so adoption is automatic — mentions are
-- inherently asked-for by the mentioner, and Tickd users have a real
-- working relationship with each other already.
--
-- We keep this on workspace_members rather than a global preference
-- because the same user may be in multiple workspaces with very
-- different expectations (e.g. one work, one volunteer org).

alter table workspace_members
  add column if not exists email_mentions_enabled boolean not null default true;

-- Let users update their own membership row (currently the only
-- column they should be touching is email_mentions_enabled). Postgres
-- RLS can't column-gate updates; we rely on the client to only PATCH
-- this column. Admin operations (role changes, removals) flow through
-- the service-role key in Netlify functions, which bypasses RLS.
drop policy if exists "users update their own memberships" on workspace_members;
create policy "users update their own memberships" on workspace_members
  for update using (user_id = auth.uid());
