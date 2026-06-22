# Troubleshooting

The most-reported issues and what to do about each.

## "Type error: Load failed" / a task I just saved disappeared

You're almost certainly on iOS Safari with a flaky cellular connection. Safari kills in-flight network requests when the radio idles or the screen locks, and Tickd's optimistic update rolls the row back when the save fails.

What we did about it: mutations now auto-retry 2× with backoff before rolling back, so most transient blips recover within ~7 seconds. If you actually lose signal entirely:

- A yellow strip appears at the top: **"You're offline. Edits will save when you're back."**
- The strip turns green for a moment when you reconnect: **"Back online — saving your queued changes."**

If you see *neither* strip and the task still disappears, check that your network connection is real (not "connected" with broken DNS). Reload the page if you need to.

## I can't delete a task — "only the task creator or workspace owner can"

The Phase 27 RLS keeps editors from accidentally deleting each other's work. As of Phase 27c, you can also delete tasks you created (`created_by` = you), regardless of role.

If you still can't delete, you're not the creator AND you're not the workspace owner. Options:

- Ask the workspace owner to delete it
- Ask the creator to delete it
- Mark it Done — done tasks drop out of all active views

## I shared a doc and the other person can't see it

A doc has three visibility states:

- 🔒 **Private** — only the author + invited people can read
- 👥 **Workspace** — anyone in this workspace can read

Open the doc → click the **share** (person-plus) icon → confirm the recipient is in the list and has at least "Can view" permission. If they should be able to read but aren't seeing the doc, their account might not be linked to a person record in your workspace yet — ask an admin to confirm via **Settings → People**.

## My emails are going to spam

Three actions, in order of impact:

1. **Verify your domain in Resend** — add SPF, DKIM, and DMARC DNS records. Until done, expect spam-folder placement.
2. **Set `APP_URL`** correctly in Netlify env vars to your production URL with `https://` prefix. The View comment link uses it.
3. **Ask recipients to mark "Not spam"** on the first email and add the sender to their contacts.

There's a "Send test email to me" button in **Settings → Profile → Email notifications** that bypasses the @mention requirement so you can verify delivery without a teammate.

## A duplicate scanner suggestion was wrong

Click **Keep both** on the pair. The dismissal is workspace-wide, so the scanner won't bring up that pair again. (Different tasks with similar wording still get flagged separately — the dismissal is per-pair, not per-task.)

## My phone doesn't show push notifications

Push notifications require:

1. The PWA installed to your home screen (Safari "Share → Add to Home Screen", or Chrome "Install app")
2. Push permission granted on first open
3. The browser/OS not in low-power mode

Without those three, you'll still get the in-app Inbox + email notifications — just no push to wake your device.

## Something else is broken

If you're a workspace owner, **Settings → Errors** shows recent client + server errors with the exact stack trace. That's the fastest way to give a specific report — copy the message + source + the time it happened. Otherwise, screenshot the browser DevTools console and send it.
