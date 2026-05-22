-- One-shot: copy all tasks from "Asbert's Workspace" to "Dyna's Workspace".
--
-- Maps pic_id / department_id / task_watchers.person_id by name —
-- both workspaces have the same people + departments by name (seeded
-- from the same lists), so the lookup works cleanly.
--
-- Copies the task itself, its watchers, and its journal_entries.
-- Does NOT copy activity_log (that's audit history of Asbert's
-- testing — not Dyna's actual work).
--
-- Safety: refuses to run if Dyna's workspace already has any tasks.
--
-- To undo:
--   delete from tasks where workspace_id =
--     (select id from workspaces where name = 'Dyna''s Workspace');
-- (cascades into task_watchers + journal_entries)

do $$
declare
  v_source     uuid;
  v_target     uuid;
  v_task       RECORD;
  v_new_id     uuid;
  v_pic_id     uuid;
  v_dept_id    uuid;
  v_copied     int := 0;
  v_watchers   int := 0;
  v_journal    int := 0;
  v_unmapped   int := 0;
begin
  select id into v_source from workspaces where name = 'Asbert''s Workspace';
  select id into v_target from workspaces where name = 'Dyna''s Workspace';

  if v_source is null then
    raise exception '"Asbert''s Workspace" not found';
  end if;
  if v_target is null then
    raise exception '"Dyna''s Workspace" not found — run seed-dyna-workspace.sql first';
  end if;

  if (select count(*) from tasks where workspace_id = v_target) > 0 then
    raise notice 'Dyna''s workspace already has tasks. Refusing to duplicate.';
    return;
  end if;

  for v_task in
    select
      t.id          as old_id,
      t.title, t.notes, t.status, t.priority,
      t.start_date, t.due_date, t.raised_date,
      t.tags, t.source, t.created_by,
      sp.name       as pic_name,
      sd.name       as dept_name
    from tasks t
    left join people sp      on sp.id = t.pic_id
    left join departments sd on sd.id = t.department_id
    where t.workspace_id = v_source
    order by t.created_at
  loop
    -- Resolve PIC + Department in the target workspace by name
    v_pic_id  := null;
    v_dept_id := null;

    if v_task.pic_name is not null then
      select id into v_pic_id
        from people
        where workspace_id = v_target
          and name = v_task.pic_name
        limit 1;
      if v_pic_id is null then
        raise warning 'PIC "%" not in target workspace — task "%" will be unassigned.',
          v_task.pic_name, v_task.title;
        v_unmapped := v_unmapped + 1;
      end if;
    end if;

    if v_task.dept_name is not null then
      select id into v_dept_id
        from departments
        where workspace_id = v_target
          and name = v_task.dept_name
        limit 1;
    end if;

    -- Insert the task into the target workspace.
    -- task_number, created_at, updated_at all default fresh.
    insert into tasks (
      workspace_id, title, notes, status, priority,
      start_date, due_date, raised_date, tags, source,
      pic_id, department_id, created_by
    )
    values (
      v_target, v_task.title, v_task.notes, v_task.status, v_task.priority,
      v_task.start_date, v_task.due_date, v_task.raised_date, v_task.tags, v_task.source,
      v_pic_id, v_dept_id, v_task.created_by
    )
    returning id into v_new_id;

    -- Copy watchers, mapping each person by name from source → target workspace
    with copied_watchers as (
      insert into task_watchers (task_id, person_id)
      select v_new_id, tp.id
      from task_watchers tw
      join people sp on sp.id = tw.person_id
      join people tp
        on tp.workspace_id = v_target
       and tp.name = sp.name
      where tw.task_id = v_task.old_id
      returning 1
    )
    select count(*) into v_watchers from (
      select v_watchers + count(*) from copied_watchers
    ) _;

    -- Copy journal_entries
    insert into journal_entries (
      task_id, author_id, body, entry_type, status_value, created_at
    )
    select v_new_id, author_id, body, entry_type, status_value, created_at
    from journal_entries
    where task_id = v_task.old_id;

    v_copied := v_copied + 1;
  end loop;

  raise notice 'Copied % tasks. PIC mapping gaps: %.', v_copied, v_unmapped;
end $$;
