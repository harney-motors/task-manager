-- Phase 15.5 — Link existing user to existing person
--
-- The original linking path (admin-create-user.mjs) only fires when
-- creating a brand-new auth user. For the case where both the user
-- and the person row already exist (most common: someone signed in
-- via magic-link before the admin set them up, OR linking was
-- skipped at create time), we need a separate RPC.
--
-- SECURITY DEFINER so it can update people regardless of the
-- caller's workspace_members role. Gated by superadmin membership.

create or replace function admin_link_person(
  p_person_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from superadmins where user_id = auth.uid()) then
    raise exception 'Superadmin access required';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Target user does not exist';
  end if;
  if not exists (select 1 from people where id = p_person_id) then
    raise exception 'Person not found';
  end if;
  update people set user_id = p_user_id where id = p_person_id;
end;
$$;

create or replace function admin_unlink_person(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from superadmins where user_id = auth.uid()) then
    raise exception 'Superadmin access required';
  end if;
  update people set user_id = null where id = p_person_id;
end;
$$;

grant execute on function admin_link_person(uuid, uuid) to authenticated;
grant execute on function admin_unlink_person(uuid) to authenticated;
