# The Inbox: updates, mentions, nudges

The Inbox is where Tickd surfaces things that need your attention. It's deliberately split into three lenses so the signal stays clear:

- **Updates** — events on your tasks (assigned, status changed, became overdue)
- **Mentions** — places you've been tagged in a comment
- **Nudges** — AI-generated suggestions ("Q3 review is overdue", "task X has no progress in 5 days")

Each tab has the same shape: an **Active** filter (what still needs you), an **All** view, and a **Dismissed** view. Click X on any row to dismiss it; the red badge on the tab counts active items only.

## Updates — what just happened to your tasks

Every event on a task you PIC or watch becomes an Update row. Examples you'll see:

- "Lara assigned this to you" — new PIC assignment
- "Asbert flagged a blocker on this" — status went to Blocked
- "Clem moved the due date" — date change
- "This task is past its due date." — synthetic event, fires once per overdue task per due date

Click any row to open the task. Click X to dismiss. **Mark all read** clears the lot.

> [!NOTE]
> Your own actions don't appear in your own Updates feed. Otherwise every status change you made would create a notification for yourself.

## Mentions — when someone @-tags you

Type `@FirstName` in any comment and the person gets a Mentions row (and an email, if they have email notifications on).

Mentions are per-comment, not per-task — if Asbert @-mentions you twice in the same thread, you get two rows. Dismissing one doesn't dismiss the other.

The chip Active / All / Dismissed pattern works the same here.

## Nudges — AI suggestions

A few times a day, Tickd runs a Claude-powered pass over your open tasks and writes "nudges" — observations a good chief-of-staff would surface:

- "Order brake pads is 3 days overdue with no movement"
- "You have 8 tasks due today across 3 PICs — heads up"
- "Clear runway today" — when there's genuinely nothing pressing

Nudges have a severity: urgent / high / medium / low. You can dismiss any nudge. **Dismissed nudges won't be re-raised for 7 days** for the same underlying issue, so you don't see the same suggestion every morning until you actually act on it.

## Emails follow your settings

Every notification kind has an email twin. Control it in **Settings → Profile → Email notifications**. Off-by-default opt-outs are honoured server-side, not just hidden client-side.

## Deep-link from email

When you get a mention / reply / reaction email and click **View comment**, you land in the app on that specific task with the Comments tab already open. Same goes for assignment emails — they deep-link straight to the task in question.
