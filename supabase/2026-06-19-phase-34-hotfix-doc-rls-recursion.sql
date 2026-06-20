-- Phase 34 HOTFIX — break the docs ↔ doc_shares RLS recursion
--
-- Postgres 42P17 ("infinite recursion detected in policy for relation
-- 'docs'") fires on any docs INSERT/UPDATE/SELECT because the Phase 34
-- policies cross-reference each other:
--
--   docs SELECT policy        →  ... id IN (select doc_id from doc_shares where ...)
--   doc_shares SELECT policy  →  ... doc_id IN (select id from docs where created_by = auth.uid())
--
-- When the planner evaluates either side it has to evaluate the other,
-- which retriggers the first, etc.
--
-- Fix: a SECURITY DEFINER function `is_doc_author(_doc_id)` that does
-- the authorship check WITHOUT going through RLS. Then doc_shares
-- policies call the function instead of subquery-ing docs directly.
-- The docs SELECT subquery on doc_shares still applies doc_shares
-- RLS, but doc_shares RLS no longer cycles back, so the recursion is
-- broken.

-- ---------- SECURITY DEFINER helper ----------
create or replace function public.is_doc_author(_doc_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.docs
    where id = _doc_id
      and created_by = auth.uid()
  );
$$;

-- The function should be callable by all authenticated users (it
-- only returns a boolean about THE caller's relationship to a doc).
grant execute on function public.is_doc_author(uuid) to authenticated;

-- ---------- Rewrite doc_shares policies to use the helper ----------

drop policy if exists "author or recipient see shares" on doc_shares;
create policy "author or recipient see shares" on doc_shares
  for select using (
    user_id = auth.uid()
    or public.is_doc_author(doc_id)
    or exists (select 1 from superadmins where user_id = auth.uid())
  );

drop policy if exists "author manages shares" on doc_shares;
create policy "author manages shares" on doc_shares
  for insert with check (
    public.is_doc_author(doc_id)
  );

drop policy if exists "author updates shares" on doc_shares;
create policy "author updates shares" on doc_shares
  for update using (
    public.is_doc_author(doc_id)
  );

drop policy if exists "author removes shares" on doc_shares;
create policy "author removes shares" on doc_shares
  for delete using (
    public.is_doc_author(doc_id)
    or exists (select 1 from superadmins where user_id = auth.uid())
  );
