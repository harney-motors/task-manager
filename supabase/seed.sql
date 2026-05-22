-- Loop — initial workspace seed for Asbert
--
-- Prerequisites:
--   1. supabase/schema.sql has been applied
--   2. You have signed in via magic link at least once
--      (so a row exists in auth.users with your email)
--
-- Before running:
--   * Edit YOUR_EMAIL below to match the email you signed in with
--
-- What this does:
--   * Creates a workspace called "Asbert's Workspace"
--   * Adds you to workspace_members as 'owner'
--   * Inserts the 6 departments from the prototype
--   * Inserts the 10 people from the prototype (you included as a PIC, so
--     tasks can be assigned to you as well as to others)
--
-- Re-running:
--   Safe to no-op if the workspace already exists for this user.
--   To wipe and redo from scratch:
--     delete from workspaces where name = 'Asbert''s Workspace';
--   (cascades into workspace_members, people, departments, tasks…)

do $$
declare
  YOUR_EMAIL    constant text := 'asbert@harneymotorsltd.com';  -- <<< EDIT THIS
  v_user_id     uuid;
  v_workspace   uuid;
begin
  -- 1. Find the auth user
  select id into v_user_id from auth.users where email = YOUR_EMAIL;
  if v_user_id is null then
    raise exception
      'No auth.users row for email %. Sign in at http://localhost:5173 first, then re-run.',
      YOUR_EMAIL;
  end if;

  -- 2. Bail early if we've already seeded a workspace owned by this user
  select w.id into v_workspace
  from workspaces w
  join workspace_members m on m.workspace_id = w.id
  where m.user_id = v_user_id and m.role = 'owner'
  limit 1;
  if v_workspace is not null then
    raise notice 'Workspace % already exists for %, nothing to do.', v_workspace, YOUR_EMAIL;
    return;
  end if;

  -- 3. Create workspace
  insert into workspaces (name, created_by)
  values ('Asbert''s Workspace', v_user_id)
  returning id into v_workspace;

  -- 4. Owner membership
  insert into workspace_members (workspace_id, user_id, role)
  values (v_workspace, v_user_id, 'owner');

  -- 5. Departments
  insert into departments (workspace_id, name, color) values
    (v_workspace, 'Strategy',   'teal'),
    (v_workspace, 'Service',    'blue'),
    (v_workspace, 'Sales',      'amber'),
    (v_workspace, 'Finance',    'gray'),
    (v_workspace, 'Parts',      'pink'),
    (v_workspace, 'Operations', 'purple');

  -- 6. People — mirrors PEOPLE[] from docs/loop-prototype.html
  insert into people (workspace_id, name, initials, title, department, role, color) values
    (v_workspace, 'Dyna Harney-Barnes', 'DH', 'General Manager',         null,         'owner', 'blue'),
    (v_workspace, 'Asbert Baptiste',    'AB', 'Strategy',                'Strategy',   'pic',   'purple'),
    (v_workspace, 'Clem Abbott',        'CA', 'Service Manager',         'Service',    'pic',   'coral'),
    (v_workspace, 'Stephen Barnes',     'SB', 'Sales Manager',           'Sales',      'pic',   'pink'),
    (v_workspace, 'Richard D''Ornellas','RD', 'Financial Control',       'Finance',    'pic',   'green'),
    (v_workspace, 'Charlene Dinard',    'CD', 'Parts Supervisor',        'Parts',      'pic',   'amber'),
    (v_workspace, 'Kieron Leonard',     'KL', 'Parts Manager',           'Parts',      'pic',   'red'),
    (v_workspace, 'Leslie Barnes',      'LB', 'Operations Manager',      'Operations', 'pic',   'teal'),
    (v_workspace, 'Sasha Quashie',      'SQ', 'Service Supervisor',      'Service',    'pic',   'gray'),
    (v_workspace, 'Cymone Hughes',      'CH', 'Warranty Administrator',  'Service',    'pic',   'green');

  raise notice 'Seeded workspace % with 6 departments and 10 people.', v_workspace;
end $$;
