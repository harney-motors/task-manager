-- Loop — sample task seed
--
-- Prerequisites:
--   supabase/seed.sql has been run (so workspace, departments, people exist)
--
-- What this does:
--   Inserts ~12 sample tasks across all PICs, with a realistic mix of:
--     - overdue / due today / due this week / unscheduled
--     - Open / In progress / Done
--     - High / Medium / Low priority
--   Dates are relative to current_date, so the data stays meaningful
--   whenever you run this.
--
-- Re-running:
--   Safe — bails if there are already tasks in the workspace.
--   To wipe and redo:
--     delete from tasks where workspace_id =
--       (select id from workspaces where name = 'Asbert''s Workspace');

do $$
declare
  v_workspace uuid;
  -- People lookup
  p_asbert    uuid;
  p_clem      uuid;
  p_stephen   uuid;
  p_richard   uuid;
  p_charlene  uuid;
  p_kieron    uuid;
  p_leslie    uuid;
  p_sasha     uuid;
  p_cymone    uuid;
  -- Department lookup
  d_strategy  uuid;
  d_service   uuid;
  d_sales     uuid;
  d_finance   uuid;
  d_parts     uuid;
  d_ops       uuid;
  v_count     int;
begin
  -- Find workspace
  select id into v_workspace from workspaces where name = 'Asbert''s Workspace' limit 1;
  if v_workspace is null then
    raise exception 'No workspace "Asbert''s Workspace". Run supabase/seed.sql first.';
  end if;

  -- Bail if any tasks already exist for this workspace
  select count(*) into v_count from tasks where workspace_id = v_workspace;
  if v_count > 0 then
    raise notice '% tasks already exist in this workspace, nothing to do.', v_count;
    return;
  end if;

  -- Resolve person + department IDs once
  select id into p_asbert   from people where workspace_id = v_workspace and name = 'Asbert Baptiste';
  select id into p_clem     from people where workspace_id = v_workspace and name = 'Clem Abbott';
  select id into p_stephen  from people where workspace_id = v_workspace and name = 'Stephen Barnes';
  select id into p_richard  from people where workspace_id = v_workspace and name = 'Richard D''Ornellas';
  select id into p_charlene from people where workspace_id = v_workspace and name = 'Charlene Dinard';
  select id into p_kieron   from people where workspace_id = v_workspace and name = 'Kieron Leonard';
  select id into p_leslie   from people where workspace_id = v_workspace and name = 'Leslie Barnes';
  select id into p_sasha    from people where workspace_id = v_workspace and name = 'Sasha Quashie';
  select id into p_cymone   from people where workspace_id = v_workspace and name = 'Cymone Hughes';

  select id into d_strategy from departments where workspace_id = v_workspace and name = 'Strategy';
  select id into d_service  from departments where workspace_id = v_workspace and name = 'Service';
  select id into d_sales    from departments where workspace_id = v_workspace and name = 'Sales';
  select id into d_finance  from departments where workspace_id = v_workspace and name = 'Finance';
  select id into d_parts    from departments where workspace_id = v_workspace and name = 'Parts';
  select id into d_ops      from departments where workspace_id = v_workspace and name = 'Operations';

  -- Tasks: a realistic spread across states + dates
  insert into tasks
    (workspace_id, title, pic_id, department_id, due_date, priority, status, tags, source)
  values
    -- Overdue
    (v_workspace, 'Submit monthly financials to board',
       p_richard, d_finance, current_date - 5, 'High', 'In progress', array['board','reporting'], 'Seed data'),
    (v_workspace, 'Reconcile parts inventory after stock-take',
       p_charlene, d_parts, current_date - 2, 'Medium', 'In progress', array['inventory'], 'Seed data'),
    (v_workspace, 'Reply to PwC audit follow-up',
       p_richard, d_finance, current_date - 1, 'High', 'Open', array['audit'], 'Seed data'),

    -- Due today
    (v_workspace, 'Fix lift bay 2 hydraulics',
       p_clem, d_service, current_date, 'High', 'In progress', array['lift','urgent'], 'Seed data'),
    (v_workspace, 'Approve service bay rota for next week',
       p_clem, d_service, current_date, 'Medium', 'Open', array['scheduling'], 'Seed data'),

    -- Due this week
    (v_workspace, 'Confirm board agenda',
       p_asbert, d_strategy, current_date + 1, 'High', 'Open', array['board'], 'Seed data'),
    (v_workspace, 'Customer follow-up: M. Singh service complaint',
       p_sasha, d_service, current_date + 1, 'Medium', 'Open', array['customer','complaint'], 'Seed data'),
    (v_workspace, 'Warranty claim 2026-0331',
       p_cymone, d_service, current_date + 2, 'Low', 'Open', array['warranty'], 'Seed data'),
    (v_workspace, 'Review Q3 sales pipeline with team',
       p_stephen, d_sales, current_date + 3, 'Medium', 'Open', array['pipeline'], 'Seed data'),
    (v_workspace, 'Order brake pads for Lexus run',
       p_kieron, d_parts, current_date + 5, 'Medium', 'Open', array['parts','order'], 'Seed data'),
    (v_workspace, 'Schedule Q3 team offsite',
       p_leslie, d_ops, current_date + 7, 'Low', 'Open', array['team','planning'], 'Seed data'),

    -- Unscheduled (no due_date) — these land in the inbox panel
    (v_workspace, 'Strategy review prep — competitive landscape',
       p_asbert, d_strategy, null, 'Medium', 'Open', array['planning'], 'Seed data'),

    -- Already done (won't show in either panel by default)
    (v_workspace, 'Submit prior-month KPI deck',
       p_asbert, d_strategy, current_date - 10, 'Medium', 'Done', array['kpi','reporting'], 'Seed data');

  get diagnostics v_count = row_count;
  raise notice 'Inserted % sample tasks into workspace %.', v_count, v_workspace;
end $$;
