# Loop — Build Plan

**Goal:** Ship a working v1 task manager that Dyna uses daily, built solo with Claude Code as pair programmer, on React + Vite + Supabase + Netlify.

**Working assumption:** ~6–10 weekends to a usable v1, ~12–16 weekends to something polished enough that you'd put it in front of a paying customer.

---

## 1. Architecture decisions locked in

These are the answers to questions Claude Code will ask you. Pin this document open so you can paste these in when prompted.

| Decision | Choice | Reason |
|---|---|---|
| Frontend | React 18 + Vite | You've shipped this with HML dashboard; fastest dev loop |
| Styling | Tailwind CSS | Avoids the CSS sprawl of the prototype; faster to maintain |
| Backend | Supabase (Postgres + Auth + RLS) | One service, auto-generated API, you've already evaluated it |
| Hosting | Netlify | You've deployed there; auto-deploys from GitHub |
| Auth | Supabase Auth with magic link email | No passwords to manage; Dyna's email is her login |
| Multi-tenancy | Workspace-scoped with RLS | One Dyna workspace now, more later, no migration |
| State management | TanStack Query (formerly React Query) | Server state, caching, optimistic updates — replaces Redux |
| Routing | React Router v6 | Standard, well-documented |
| Date handling | `date-fns` | Lighter than moment; you've used it in HML |
| Drag-drop | `@dnd-kit/core` | Modern, accessible, works with React 18 |
| Forms | Native React (no library) | Forms are small; libraries are overkill |
| Icons | Tabler Icons (web font) | Same as prototype, free, comprehensive |
| WhatsApp | Twilio API | For sending to Dyna's own number only |
| Email | Resend or Supabase's built-in SMTP | Resend is cleaner for transactional |
| Voice | Web Speech API (browser-native) | Free, no setup, works in Chrome/Edge/Safari |

---

## 2. Three roles, three views of the same data

This is the most important architectural choice in the plan. Get this right and everything else falls into place.

**Superadmin (you)**
- Can see all workspaces, all users
- Cannot see task content within any workspace unless added as a member
- Manages billing, system health, feature flags
- Implemented as a flag on the user record: `is_superadmin = true`

**Owner (Dyna in her workspace)**
- Full access to all tasks, people, settings within her workspace
- Can invite editors and add PICs
- Implemented as a row in `workspace_members` with `role = 'owner'`

**Editor / PIC**
- Editor: can create and modify tasks in the workspace
- PIC: contact record that receives tasks; may optionally have a user account
- Both implemented in `people` table; users-with-login also have a `workspace_members` row

**Why this matters for v1:** You can be a superadmin AND a member of your own workspace (with your own tasks). Dyna can be the owner of her workspace. If you ever add yourself as an editor in her workspace, you'd see her tasks — but only because she explicitly added you. Default state: separate workspaces, no cross-visibility.

---

## 3. Database schema — paste this into Supabase SQL editor

Run these statements in order. Each block is independently re-runnable.

### 3.1 Workspaces (the tenancy boundary)

```sql
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

alter table workspaces enable row level security;

create policy "members see their workspaces" on workspaces
  for select using (
    id in (select workspace_id from workspace_members where user_id = auth.uid())
    or exists (select 1 from auth.users where id = auth.uid() and raw_app_meta_data->>'is_superadmin' = 'true')
  );
```

### 3.2 Workspace members (who can do what in each workspace)

```sql
create table workspace_members (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  created_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

alter table workspace_members enable row level security;

create policy "users see their own memberships" on workspace_members
  for select using (user_id = auth.uid());
```

### 3.3 People (PICs, optionally linked to user accounts)

```sql
create table people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,  -- nullable: linked when PIC becomes user
  name text not null,
  initials text,
  title text,
  department text,
  role text not null check (role in ('owner', 'editor', 'pic')),
  color text not null default 'gray',
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table people enable row level security;

create policy "workspace members see all people in their workspace" on people
  for all using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

create index people_workspace_idx on people(workspace_id);
```

### 3.4 Departments

```sql
create table departments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  name text not null,
  color text not null default 'gray',
  created_at timestamptz default now(),
  unique (workspace_id, name)
);

alter table departments enable row level security;

create policy "workspace members see all departments in their workspace" on departments
  for all using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );
```

### 3.5 Tasks (the heart of everything)

```sql
create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  task_number serial,  -- the T-0142 you display in the UI
  title text not null,
  notes text,
  pic_id uuid references people(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  start_date date,
  due_date date,
  priority text default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  status text default 'Open' check (status in ('Open', 'In progress', 'Done')),
  tags text[] default '{}',
  source text default 'Manual entry',
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tasks enable row level security;

-- Workspace members see all tasks in their workspace
create policy "workspace members see tasks" on tasks
  for all using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

-- Future: PICs (with linked user accounts) can see tasks assigned to them
-- Add this when Dyna decides to link a PIC to a real user
create policy "PICs see their own tasks" on tasks
  for select using (
    pic_id in (select id from people where user_id = auth.uid())
  );

create index tasks_workspace_idx on tasks(workspace_id);
create index tasks_pic_idx on tasks(pic_id);
create index tasks_due_idx on tasks(due_date);
create index tasks_status_idx on tasks(status);

-- Auto-update updated_at
create or replace function update_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_updated_at before update on tasks
  for each row execute function update_updated_at();
```

### 3.6 Journal entries

```sql
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade not null,
  author_id uuid references auth.users(id),
  body text not null,
  entry_type text default 'note' check (entry_type in ('note', 'status_change')),
  status_value text,  -- populated when entry_type = 'status_change'
  created_at timestamptz default now()
);

alter table journal_entries enable row level security;

create policy "users see journal for tasks they can see" on journal_entries
  for all using (
    task_id in (select id from tasks)
  );

create index journal_task_idx on journal_entries(task_id);
```

### 3.7 Activity log (for the recent activity feed)

```sql
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  actor_id uuid references auth.users(id),
  task_id uuid references tasks(id) on delete cascade,
  action text not null,
  payload jsonb,
  created_at timestamptz default now()
);

alter table activity_log enable row level security;

create policy "workspace members see activity" on activity_log
  for all using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

create index activity_workspace_idx on activity_log(workspace_id, created_at desc);
```

That's the entire schema. Seven tables. You should be able to paste these in inside 5 minutes.

---

## 4. File structure for the React app

When Claude Code asks "where should this file go?", point it here.

```
loop/
├── src/
│   ├── main.jsx                    # entry point
│   ├── App.jsx                     # router + auth guard
│   ├── lib/
│   │   ├── supabase.js             # supabase client singleton
│   │   ├── dates.js                # date helpers (today, isOverdue, formatRelative)
│   │   ├── colors.js               # PIC color → bg/text class lookup
│   │   └── queries.js              # TanStack Query keys + fetchers
│   ├── auth/
│   │   ├── Login.jsx               # magic link sign-in
│   │   └── AuthProvider.jsx        # context for current user + workspace
│   ├── components/
│   │   ├── ui/                     # primitives: Button, Pill, IconButton, Modal
│   │   ├── TaskRow.jsx
│   │   ├── TaskModal.jsx
│   │   ├── JournalPanel.jsx
│   │   ├── QuickEntry.jsx
│   │   ├── ViewTabs.jsx
│   │   ├── Metrics.jsx
│   │   └── ShareModal.jsx
│   ├── views/
│   │   ├── ListView.jsx
│   │   ├── GridView.jsx
│   │   ├── PicView.jsx
│   │   ├── CalendarView.jsx
│   │   └── SettingsView.jsx
│   ├── api/
│   │   ├── tasks.js                # createTask, updateTask, deleteTask
│   │   ├── people.js               # CRUD on people
│   │   ├── journal.js
│   │   └── share.js                # generates WhatsApp message + calls Twilio
│   └── styles/
│       └── globals.css             # tailwind directives + CSS vars from prototype
├── public/
├── netlify/
│   └── functions/                  # serverless functions for Twilio/Resend
│       ├── send-whatsapp.js
│       └── send-email.js
├── .env.local                      # SUPABASE_URL, SUPABASE_ANON_KEY, etc
├── package.json
├── tailwind.config.js
├── vite.config.js
└── netlify.toml
```

**The rule:** if a file is more than 200 lines, it's doing too much — split it. The prototype's giant inline approach is fine for a sketch; production code is small focused files.

---

## 5. Build sequence — eight chunks

Each chunk ends with a working, deployable app that does a bit more than the previous one. **Never start a chunk without finishing the previous one** — half-finished features pile up faster than you can debug them.

### Chunk 1 — Foundation (Weekend 1)

**Goal:** Empty React app deployed to Netlify, connected to Supabase, with a working magic-link login.

What you build:
- Vite + React app initialized
- Tailwind configured with the prototype's CSS variables ported over
- Supabase project created, schema from section 3 applied
- Magic link login working — Dyna can log in, you can log in
- Workspace seeding script: creates "Dyna's Workspace", makes her the owner, creates the 10 people
- Netlify connected to GitHub, auto-deploy on push

End-of-chunk test: You and Dyna can both log in. You see a stub homepage. Network tab shows your session token.

### Chunk 2 — List view + quick entry (Weekend 2)

**Goal:** Type a task, press Enter, see it appear. Click a row, see a stub modal.

What you build:
- List view component that fetches tasks from Supabase via TanStack Query
- Quick entry input with the same first-name detection logic from the prototype
- Empty TaskModal that just shows the task title
- The greeting bar with today's date and basic counts

End-of-chunk test: You can add 5 tasks via the input. They appear immediately (optimistic update). Refresh the page; they're still there.

### Chunk 3 — Task modal (Weekend 3)

**Goal:** Full task editing — every field in the modal saves to the database.

What you build:
- PIC dropdown populated from `people` table
- Department dropdown
- Date picker, priority, status, tags
- Optimistic updates so the UI feels instant
- The journal sidebar (still single-author for v1)
- Activity log entries written when fields change

End-of-chunk test: Edit a task's PIC. Close the modal. Refresh. Change persisted.

### Chunk 4 — Grid view (Weekend 4)

**Goal:** Same data, spreadsheet-style. Inline editing for PIC, department, due date.

What you build:
- Grid view component using the same data hook as List
- Inline dropdowns for PIC, department
- Inline date picker
- "Group by PIC" toggle that collapses rows under PIC headers
- Filter bar (basic: by PIC, by department, by status)

End-of-chunk test: Change Asbert's task PIC to Clem in the grid. The change is reflected in the List view immediately.

### Chunk 5 — PIC view + share to WhatsApp (Weekend 5)

**Goal:** The signature feature works end-to-end.

What you build:
- PIC view with chip selector
- Twilio account setup, Netlify function for `send-whatsapp.js`
- Message formatter that builds the WhatsApp-formatted string from real task data
- Share modal with preview before sending
- Activity log entry when share is sent

End-of-chunk test: Dyna selects Clem, taps Share, taps Send. Her phone gets a WhatsApp message with Clem's task list. She forwards it to Clem. Workflow complete.

### Chunk 6 — Calendar with drag-drop (Weekend 6)

**Goal:** Calendar view with 1 week, 2 week, month ranges. Drag tasks to reschedule.

What you build:
- Calendar view component
- Range toggle (1w / 2w / month)
- `@dnd-kit` integration for dragging task chips between days
- Day detail panel below the grid
- Optimistic update on drop, with rollback if Supabase update fails

End-of-chunk test: Drag a task from Thursday to Friday. Check Supabase dashboard — `due_date` updated. Refresh the page — task still on Friday.

### Chunk 7 — Settings (Weekend 7)

**Goal:** Dyna can add a new PIC or department without Claude Code's help.

What you build:
- Settings view with left nav (People, Departments, etc.)
- Add Person modal with color picker
- Add Department flow
- Edit and deactivate (soft delete) for both
- "My profile" tab for the current user

End-of-chunk test: Dyna adds "John Smith" as a Service PIC. He appears in the PIC view chips immediately.

### Chunk 8 — Polish + ship (Weekend 8)

**Goal:** Remove sharp edges, make it feel finished.

What you build:
- Loading states (skeletons, spinners) for slow networks
- Empty states for every view ("No tasks yet — type one above")
- Error handling for network failures (toast + retry)
- Keyboard shortcuts: `Esc` closes modals, `/` focuses quick entry, `g+l` goes to list, etc.
- A real "Today" view: opens to a stripped-down read-only screen Dyna can glance at first thing in the morning
- Final visual pass — every spacing, every transition

End-of-chunk test: You hand Dyna a link and walk away. Two weeks later she's still using it.

---

## 6. Three integrations, in order

These are the only external services you depend on. Wire them in the order below.

### 6.1 Twilio (WhatsApp send) — Chunk 5

1. Create a Twilio account, buy a WhatsApp-enabled number (~$5/month + per-message fees)
2. In the Twilio console, link the number to WhatsApp Business
3. Approve a single message template: "Loop task list — {{1}}" with body `{{2}}` (Meta will need to review this)
4. Store `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` in Netlify environment variables
5. Build the Netlify function `send-whatsapp.js` that takes a workspace_id, a target phone number (always Dyna's), and a message body
6. From the React app, call the function via fetch

**Gotcha:** Meta's template approval can take 1–3 days. Apply for the template *before* you need it.

### 6.2 Resend or Supabase email (email send) — between Chunks 5 and 6

Not strictly required for v1 since Dyna uses WhatsApp. Build this only if Dyna asks for it. The mechanics are identical to Twilio: store an API key, build a Netlify function, call it from React.

### 6.3 Web Speech API (voice input) — Chunk 8 polish

Browser-native, no setup, no API key. The hard part is UI feedback (showing "Listening...", handling permissions, fallback for unsupported browsers).

```javascript
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = 'en-US';
recognition.continuous = false;
recognition.onresult = (event) => {
  const text = event.results[0][0].transcript;
  // Insert into quick entry input
};
```

That's the entire integration. Safari, Chrome, and Edge all support it. Firefox doesn't — show a "voice not supported in this browser" message.

---

## 7. The "stop here for v1" checklist

You will be tempted to add things. Don't. Ship v1 when these are all true:

- [ ] Both you and Dyna can log in
- [ ] Dyna can add tasks via typing
- [ ] Dyna can enrich tasks in the grid (PIC, department, due, priority, status, tags)
- [ ] Dyna can view by PIC
- [ ] Dyna can view by calendar (1w / 2w / month)
- [ ] Dyna can drag tasks between calendar days
- [ ] Dyna can share a PIC's list to her own WhatsApp
- [ ] Dyna can add journal entries to a task
- [ ] Dyna can manage people and departments in settings
- [ ] You can also do all the above for your own workspace, independently
- [ ] The app works on Dyna's laptop and her phone (basic responsive)
- [ ] No data loss when a tab is closed mid-edit (optimistic updates + retry)

Things that explicitly do NOT belong in v1:
- ❌ Recurring tasks
- ❌ Subtasks or task dependencies
- ❌ File attachments
- ❌ Multiple comment authors on the journal
- ❌ PIC reply parsing ("1 done" via WhatsApp inbound)
- ❌ Apple Calendar sync
- ❌ Mobile native app
- ❌ AI command parsing ("move all tagged urgent to Friday")
- ❌ Dark mode toggle (let it follow OS for now)
- ❌ Notifications (other than the WhatsApp share)
- ❌ Search beyond the basic filter bar
- ❌ Bulk operations (multi-select tasks)
- ❌ Custom fields
- ❌ A marketplace, a billing page, a landing page

Every one of those is a real feature. None belong in v1.

---

## 8. Working with Claude Code — the prompts

When you sit down to work, open Claude Code in the project directory and start a session with a prompt like this:

> I'm building Loop, a task manager for executives. I'm a beginner-to-intermediate developer working with you as pair programmer. Read `/BUILD_PLAN.md` for the full context. Today I want to work on Chunk N — [describe goal]. Before you write any code, walk me through what you're about to do and ask any clarifying questions.

The "walk me through it" prompt is the most important sentence. Don't let Claude Code just generate 400 lines while you watch — make it explain, then approve.

Other useful prompts during the build:

- *"Why did you choose [pattern] here? What were the alternatives?"* — learns the reasoning
- *"This component is getting long. Should we split it? Where?"* — prevents the 1000-line file
- *"Show me what this would look like if we used [other approach] instead."* — explores tradeoffs
- *"What's the simplest version of this that would work?"* — fights scope creep
- *"What can go wrong with this?"* — surfaces edge cases before they bite

---

## 9. When you're stuck

Three things to try, in order:

1. **Describe the bug in plain English to Claude Code.** Don't paste the error first. Describe what you expected vs what happened. Often the act of writing it reveals the issue.
2. **Check the network tab.** 90% of "the app is broken" turns out to be a 401, a 404, or a CORS error. Network tab shows it instantly.
3. **Revert and rebuild that one chunk.** If a chunk gets tangled beyond repair, `git revert` to the start of that chunk and rebuild it. Cheaper than untangling.

---

## 10. After v1 ships

Two weeks of daily use by Dyna is the validation gate. If she's still using it after two weeks, v1 worked.

The natural v1.5 features, in order of value:
1. **Apple Calendar `.ics` export** — read-only subscription URL so her calendar app shows tasks (high value, low effort)
2. **Editor accounts** — Dyna invites her EA to also enter tasks (medium effort, opens the product up)
3. **PIC reply parsing** — Clem texts "T-0143 done" and it updates the status (high value, medium effort with Twilio webhooks)
4. **AI command bar** — "move all of Sarah's overdue tasks to next week" (high value, medium effort with Claude API)
5. **Recurring tasks** — "every Friday, submit weekly KPI report" (medium value, surprisingly tricky to design)

If you keep moving down that list, you're three to six months from a sellable product. But the *only* way you get there is by shipping v1 first and letting it earn the right to grow.

---

*Generated for the Loop project — May 2026 — Justin Harney*
