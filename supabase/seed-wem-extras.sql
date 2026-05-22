-- Adds the additional people + departments referenced in Dyna's WEM CSV
-- to Asbert's workspace. Run AFTER supabase/2026-05-22-phase-2.sql.
--
-- Idempotent: bails if any of the new names already exist.

do $$
declare
  v_workspace uuid;
begin
  select id into v_workspace from workspaces where name = 'Asbert''s Workspace';
  if v_workspace is null then
    raise exception 'No workspace "Asbert''s Workspace". Run supabase/seed.sql first.';
  end if;

  -- Bail if we've already onboarded the WEM extras
  if exists (
    select 1 from people where workspace_id = v_workspace and name = 'Errol West'
  ) then
    raise notice 'WEM extras already seeded.';
    return;
  end if;

  -- Additional departments. Unique constraint on (workspace_id, name) so
  -- ON CONFLICT can skip dupes safely.
  insert into departments (workspace_id, name, color) values
    (v_workspace, 'HR',             'pink'),
    (v_workspace, 'IT',             'blue'),
    (v_workspace, 'Training',       'amber'),
    (v_workspace, 'Marketing',      'coral'),
    (v_workspace, 'Facilities',     'gray'),
    (v_workspace, 'Security',       'red'),
    (v_workspace, 'Warranty',       'green'),
    (v_workspace, 'Administration', 'teal'),
    (v_workspace, 'Inventory',      'purple'),
    (v_workspace, 'Storage',        'amber')
  on conflict (workspace_id, name) do nothing;

  -- Internal team referenced in the CSV
  insert into people (workspace_id, name, initials, title, department, role, color) values
    (v_workspace, 'Errol West',  'EW', 'Service Garage Manager',   'Service',    'pic', 'red'),
    (v_workspace, 'Abe',         'AB', 'Admin',                    'Service',    'pic', 'gray'),
    (v_workspace, 'Dante',       'DA', 'Service Technician (BYD)', 'Service',    'pic', 'coral'),
    (v_workspace, 'Nicholas',    'NI', 'Service Technician',       'Service',    'pic', 'blue'),
    (v_workspace, 'Shaquille',   'SH', 'Service Technician',       'Service',    'pic', 'teal'),
    (v_workspace, 'Iandre',      'IA', 'Service Coordinator',      'Service',    'pic', 'amber'),
    (v_workspace, 'Ronaldo',     'RO', 'Warranty Administrator',   'Warranty',   'pic', 'green'),
    (v_workspace, 'Adino',       'AD', 'Service Technician',       'Service',    'pic', 'purple'),
    (v_workspace, 'Glen',        'GL', 'Facilities',               'Facilities', 'pic', 'gray'),
    (v_workspace, 'Audrey',      'AU', 'Parts',                    'Parts',      'pic', 'pink'),
    (v_workspace, 'Cheryl',      'CH', 'Operations / Marketing',   'Operations', 'pic', 'pink'),
    (v_workspace, 'Bretta',      'BR', 'HR',                       'HR',         'pic', 'amber'),
    (v_workspace, 'Lavandra',    'LV', 'HR (Onboarding)',          'HR',         'pic', 'teal'),
    (v_workspace, 'Hesse',       'HE', 'Service (BYD assignment)', 'Service',    'pic', 'blue'),
    (v_workspace, 'Lami',        'LA', 'Service',                  'Service',    'pic', 'gray'),
    (v_workspace, 'Simone',      'SI', 'Ford Recall Coordinator',  'Service',    'pic', 'green'),
    (v_workspace, 'Andrew',      'AN', 'Service',                  'Service',    'pic', 'purple'),
    (v_workspace, 'Dwight',      'DW', 'Service Technician',       'Service',    'pic', 'red'),
    (v_workspace, 'Kevin',       'KV', 'Sales / IT',               'Sales',      'pic', 'blue'),
    (v_workspace, 'Tony',        'TO', 'VIP Service',              'Service',    'pic', 'amber'),
    -- External contacts (vendors). Department field doubles as the org label.
    (v_workspace, 'Mark',        'MK', 'BYD Distributor',          'BYD',        'pic', 'gray'),
    (v_workspace, 'Lee',         'LE', 'CDK Representative',       'CDK',        'pic', 'gray');

  raise notice 'WEM extras seeded: 22 people, 10 departments.';
end $$;
