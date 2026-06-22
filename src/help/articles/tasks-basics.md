# Working with tasks

A Tickd task is whatever someone needs to do, with whatever metadata makes it findable later — PIC, due date, priority, tags, watchers, status. This article walks the lifecycle.

## Creating a task

There are four ways to make a task:

1. **Quick entry** — type a title in the sidebar's blue **+ New task** box and press Enter. The fastest path.
2. **In a view** — every view has a "+ Add task" row at the top of its lists.
3. **From a meeting note** — paste a transcript into **Import from meeting** (overflow menu) and Tickd extracts the action items via AI.
4. **From a doc** — highlight text in a doc and the floating bubble offers "Make task" with the selection as the title.

> [!TIP]
> Quick entry understands shortcuts inline. `Order brake pads @Lara #strategy due Mon high` creates the task fully populated.

## The task editor

Click any task row to open the editor. The header has the title, due date pill, priority chip, and the PIC avatar. Below that, three tabs:

- **Details** — every editable field
- **Comments** — discussion thread with @mentions and emoji reactions
- **Activity** — read-only history of who changed what and when

### Fields explained

- **Title** — what needs doing
- **PIC** — Person In Charge. Exactly one person; this is who owns the work
- **Watchers** — anyone else who needs to know about it. Multiple. They get pinged on updates but don't "own" it
- **Due date** — when it should be finished. Tasks past this date show as overdue
- **Start date** — when the work picks up (used by Calendar's range; optional)
- **Priority** — High / Medium / Low. Sorts and tints the row
- **Status** — Open / In progress / Done. The checkbox at the left of every row toggles Open ↔ Done
- **Tags** — free-form labels; great for cross-cutting groupings ("legal", "rush")
- **Notes** — markdown details for context

## The four views

| View | Best for | Highlights |
|------|----------|-----------|
| Today | Daily standup, what's hot | Three zones: Needs attention, In progress, This week |
| List | Long-running review of everything | Filters + bulk actions + status quick-tabs |
| Grid | Bulk editing across many tasks | Inline-edit any column; click headers to sort |
| Calendar | Date-driven planning | Drag to reschedule; range from 1 week to a month |
| By PIC | Sharing one person's list | Quick chip selector, "Share to WhatsApp" of the open list |

> [!NOTE]
> All views share the same filter bar (Mine / Watching / PIC / Department / Status / Priority / Tag / Due) so a filter set in List carries over when you switch to Grid. Tabs are how you reshape the SAME data, not separate work pools.

## Finishing a task

Click the circle on the left of any row, or set status to **Done** in the editor. Done tasks stay searchable forever but drop out of the default "Active" filter so they don't clog the list.

If you marked something Done by accident, the checkbox click shows a 5-second undo toast.

## Deleting

The trash icon in the task editor removes a task permanently. You can delete:

- Tasks you created (`created_by` = you)
- Any task in a workspace you own
- Anything if you're a super admin

If you don't see the trash icon, you don't have permission. Ask the workspace owner.
