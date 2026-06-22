# PICs and watchers

Two ways someone can be tied to a task. Worth understanding the difference, because filters and notifications behave differently for each.

## PIC — Person In Charge

The PIC is **the one person responsible for the work**. Every task has at most one PIC (or none, if it's unassigned). The PIC's name shows next to the task title throughout the app.

When you change a task's PIC:

- The new PIC gets an email ("Lara assigned you 'Order brake pads'")
- The new PIC gets a push notification if they have the app installed
- An entry lands in the new PIC's Inbox → Updates tab

PICs are filtered by — every view's filter bar has a PIC dropdown, and the "Assigned to me" chip is a quick alias for "PIC = me."

## Watchers

A watcher is someone who **wants to stay informed but doesn't own the work**. Multiple per task. Common cases:

- A manager who delegated the work and wants to track it
- A teammate who depends on the outcome
- The person who originally raised the task before assigning it on

Add a watcher in the task editor's Watchers section. They get:

- A push notification + email when you add them ("Lara added you as a watcher on Q3 review")
- Updates in their Inbox when the status or due date changes
- The task appears in their **Watching** filter chip in List / Grid / Calendar / PIC views

## "Assigned to me" vs "Watching" — what's the difference?

The filter chips in List / Grid / Calendar:

- **Assigned to me** — only tasks where you're the PIC. Strict ownership view.
- **Watching** — only tasks where you're a watcher. Observation view.

A task can match both if you're both PIC and watcher (rare, but possible).

The dashboard's **Mine** scope on Today bundles both together — "everything I touch" — because the dashboard's job is at-a-glance overview. The per-view chips stay tight so the working list isn't muddied.

## Why use a watcher instead of just CC-ing on email?

- Watchers see the task in their app, not just in their inbox
- Updates surface centrally instead of in three different threads
- Watchers can comment and react inside the task — context stays with the work, not in someone's email
- They can opt out per-workspace (Settings → Profile → Email notifications)

## A note on permissions

Being a watcher doesn't grant edit rights. The PIC can change the task's status, fields, and notes; watchers can only read and comment. Workspace editors and owners can edit any task regardless.
