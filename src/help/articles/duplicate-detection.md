# Catching duplicate tasks

Same job, two different titles, two different rows. Common when you raise something via WhatsApp transcript and then someone else writes a similar task from memory later. Tickd catches these two ways.

## After-create check (automatic)

Every time you create a task with a PIC, Tickd compares it to that PIC's existing open tasks via AI. If it finds a likely duplicate, a toast appears:

> *Looks similar to "Get the brake parts in" — **[Open existing]***

![Toast notification showing a similar task with Open existing button](/help/dup-toast.png)

Click **Open existing** to jump to the older task (so you can update it instead). Ignore the toast → no harm done; your new task is still saved.

This fires asynchronously, so the task save itself is never blocked. If Claude is slow or the network is flaky, the worst case is no toast — never a delayed save.

## On-demand scan (manual)

For cleaning up older backlogs, the **By PIC** view has a "Find duplicates" button in the header next to "Share to WhatsApp."

![PIC view header with Find duplicates and Share to WhatsApp buttons](/help/dup-scan-button.png)

Click it → Tickd scans every open task for that PIC (up to 80 at a time) and shows every suspected duplicate pair side-by-side. For each pair you can:

- **Open A / Open B** — jump into either task to compare details
- **Delete this one** — destructive; native confirm dialog
- **Keep both** — records a dismissal so the pair won't be re-flagged on future scans

> [!TIP]
> Use **Keep both** liberally for false positives. The scanner learns your "these are NOT duplicates" decisions and stops bringing them up.

## What counts as a duplicate

The AI is tuned for the **"same action restated"** case — different wording for the same underlying work. It deliberately won't flag:

- Different customer / different vehicle / different invoice number → different work
- A sub-task of a larger task → related, but distinct
- Two recurring tasks ("Weekly status") → unless they obviously refer to the same instance

Confidence is shown per pair:

- **high** — clearly the same work
- **medium** — looks similar; worth checking

## Cost + scale

Each scan is one Claude Haiku call. Trivial cost (fractions of a cent), runs in under 10 seconds for a typical PIC. The 80-task cap keeps it predictable for heavy lists — if you hit the cap, the modal will say "(cap)" so you know to clean up + re-run.
