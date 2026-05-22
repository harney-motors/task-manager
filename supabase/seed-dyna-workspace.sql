-- Create Dyna's workspace with the same people + departments as Asbert's
-- workspace, with Dyna as the owner.
--
-- Prerequisites:
--   Dyna has signed in once at https://wem-task-manager.netlify.app/
--   (this creates her auth.users row). Confirm by running:
--     select id, email from auth.users where email like 'dyna%';
--   You should see her row before running this script.
--
-- Idempotent: bails if "Dyna's Workspace" already exists.
--
-- What this does NOT do: copy tasks from Asbert's workspace. Dyna's
-- workspace starts empty. She populates it by using the "Import from
-- meeting" AI extractor on her next WEM, or via QuickEntry.

do $$
declare
  DYNA_EMAIL   constant text := 'dyna.harney-barnes@harneymotorsltd.com';
  v_user_id    uuid;
  v_workspace  uuid;
begin
  -- 1. Find Dyna's auth user
  select id into v_user_id from auth.users where email = DYNA_EMAIL;
  if v_user_id is null then
    raise exception
      'No auth.users row for %. Ask Dyna to sign in at the Netlify URL once, then re-run.',
      DYNA_EMAIL;
  end if;

  -- 2. Bail if already seeded
  if exists (select 1 from workspaces where name = 'Dyna''s Workspace') then
    raise notice 'Dyna''s Workspace already exists. Nothing to do.';
    return;
  end if;

  -- 3. Create the workspace
  insert into workspaces (name, created_by)
  values ('Dyna''s Workspace', v_user_id)
  returning id into v_workspace;

  -- 4. Owner membership
  insert into workspace_members (workspace_id, user_id, role)
  values (v_workspace, v_user_id, 'owner');

  -- 5. Departments — 16 total (10 from Asbert's extras + 6 originals)
  insert into departments (workspace_id, name, color) values
    (v_workspace, 'Strategy',       'teal'),
    (v_workspace, 'Service',        'blue'),
    (v_workspace, 'Sales',          'amber'),
    (v_workspace, 'Finance',        'gray'),
    (v_workspace, 'Parts',          'pink'),
    (v_workspace, 'Operations',     'purple'),
    (v_workspace, 'HR',             'pink'),
    (v_workspace, 'IT',             'blue'),
    (v_workspace, 'Training',       'amber'),
    (v_workspace, 'Marketing',      'coral'),
    (v_workspace, 'Facilities',     'gray'),
    (v_workspace, 'Security',       'red'),
    (v_workspace, 'Warranty',       'green'),
    (v_workspace, 'Administration', 'teal'),
    (v_workspace, 'Inventory',      'purple'),
    (v_workspace, 'Storage',        'amber');

  -- 6. People — Dyna's record is linked to her auth.users row via user_id
  --    so she can also appear in PIC dropdowns as herself. Everyone else
  --    has user_id = null until they get their own login.
  insert into people (workspace_id, user_id, name, initials, title, department, role, color) values
    (v_workspace, v_user_id, 'Dyna Harney-Barnes', 'DH', 'General Manager',         null,         'owner', 'blue'),
    (v_workspace, null,      'Asbert Baptiste',    'AB', 'Strategy',                'Strategy',   'pic',   'purple'),
    (v_workspace, null,      'Clem Abbott',        'CA', 'Service Manager',         'Service',    'pic',   'coral'),
    (v_workspace, null,      'Stephen Barnes',     'SB', 'Sales Manager',           'Sales',      'pic',   'pink'),
    (v_workspace, null,      'Richard D''Ornellas','RD', 'Financial Control',       'Finance',    'pic',   'green'),
    (v_workspace, null,      'Charlene Dinard',    'CD', 'Parts Supervisor',        'Parts',      'pic',   'amber'),
    (v_workspace, null,      'Kieron Leonard',     'KL', 'Parts Manager',           'Parts',      'pic',   'red'),
    (v_workspace, null,      'Leslie Barnes',      'LB', 'Operations Manager',      'Operations', 'pic',   'teal'),
    (v_workspace, null,      'Sasha Quashie',      'SQ', 'Service Supervisor',      'Service',    'pic',   'gray'),
    (v_workspace, null,      'Cymone Hughes',      'CH', 'Warranty Administrator',  'Service',    'pic',   'green'),
    -- WEM extras
    (v_workspace, null,      'Errol West',         'EW', 'Service Garage Manager',  'Service',    'pic',   'red'),
    (v_workspace, null,      'Abe',                'AB', 'Admin',                   'Service',    'pic',   'gray'),
    (v_workspace, null,      'Dante',              'DA', 'Service Technician (BYD)','Service',    'pic',   'coral'),
    (v_workspace, null,      'Nicholas',           'NI', 'Service Technician',      'Service',    'pic',   'blue'),
    (v_workspace, null,      'Shaquille',          'SH', 'Service Technician',      'Service',    'pic',   'teal'),
    (v_workspace, null,      'Iandre',             'IA', 'Service Coordinator',     'Service',    'pic',   'amber'),
    (v_workspace, null,      'Ronaldo',            'RO', 'Warranty Administrator',  'Warranty',   'pic',   'green'),
    (v_workspace, null,      'Adino',              'AD', 'Service Technician',      'Service',    'pic',   'purple'),
    (v_workspace, null,      'Glen',               'GL', 'Facilities',              'Facilities', 'pic',   'gray'),
    (v_workspace, null,      'Audrey',             'AU', 'Parts',                   'Parts',      'pic',   'pink'),
    (v_workspace, null,      'Cheryl',             'CH', 'Operations / Marketing',  'Operations', 'pic',   'pink'),
    (v_workspace, null,      'Bretta',             'BR', 'HR',                      'HR',         'pic',   'amber'),
    (v_workspace, null,      'Lavandra',           'LV', 'HR (Onboarding)',         'HR',         'pic',   'teal'),
    (v_workspace, null,      'Hesse',              'HE', 'Service (BYD assignment)','Service',    'pic',   'blue'),
    (v_workspace, null,      'Lami',               'LA', 'Service',                 'Service',    'pic',   'gray'),
    (v_workspace, null,      'Simone',             'SI', 'Ford Recall Coordinator', 'Service',    'pic',   'green'),
    (v_workspace, null,      'Andrew',             'AN', 'Service',                 'Service',    'pic',   'purple'),
    (v_workspace, null,      'Dwight',             'DW', 'Service Technician',      'Service',    'pic',   'red'),
    (v_workspace, null,      'Kevin',              'KV', 'Sales / IT',              'Sales',      'pic',   'blue'),
    (v_workspace, null,      'Tony',               'TO', 'VIP Service',             'Service',    'pic',   'amber'),
    -- External contacts
    (v_workspace, null,      'Mark',               'MK', 'BYD Distributor',         'BYD',        'pic',   'gray'),
    (v_workspace, null,      'Lee',                'LE', 'CDK Representative',      'CDK',        'pic',   'gray');

  raise notice 'Created Dyna''s Workspace (% ) — 16 departments, 32 people.', v_workspace;
end $$;
