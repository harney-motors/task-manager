# Help section screenshots

The help articles in `src/help/articles/*.md` are currently
text-only. When you're ready to add real screenshots, this file is
the spec for what to capture and how to wire them in.

## What to capture

All screenshots: PNG, ~1400×800 desktop or ~750×1500 mobile, dummy
data (no real customer / vehicle / employee names that you wouldn't
share publicly — the help section ships in the public GitHub repo).

| Filename                  | Article            | What to capture |
|---------------------------|--------------------|-----------------|
| `today-overview.png`      | Getting started    | The Today view, full layout — sidebar visible, three zones (Needs attention / In progress / This week), Mine/Team toggle, 7-day heatmap. |
| `new-task-button.png`     | Getting started    | A tight crop of the blue "+ New task" button at the top of the sidebar (~400×100). |
| `task-modal-tabs.png`     | Working with tasks | The task editor open with the three tabs (Details / Comments / Activity) visible at the top. Show a populated task — title, PIC avatar, due-date pill. |
| `pic-avatar-row.png`      | PICs and watchers  | A single task row in List view, cropped to show the PIC avatar + name on the left. |
| `watchers-section.png`    | PICs and watchers  | The Watchers section inside the task editor — 2–3 watcher avatar pills plus the "+ Add watcher" dropdown. |
| `inbox-tabs.png`          | Inbox              | The Inbox surface with the three primary tabs (Updates / Mentions / Nudges) visible, ideally with a red badge on at least one. |
| `docs-overview.png`       | Docs               | Docs view — sidebar list of docs on the left, the editor on the right, a doc with a title + some markdown content. |
| `share-doc-modal.png`     | Docs               | The Share doc modal open over a doc — workspace-visible toggle + recipient list with at least one invited user. |
| `dup-toast.png`           | Duplicate detection| The "Looks similar to …" toast on top of a list view, with the Open existing action visible. |
| `dup-scan-button.png`     | Duplicate detection| The PIC view header crop showing the "Find duplicates" + "Share to WhatsApp" buttons side by side. |

## How to capture cleanly

- macOS: `Cmd + Shift + 4`, drag to select. Saves to Desktop by default.
- Set window width to ~1400px (or use full mobile viewport at 390×844)
- Use a workspace with **dummy data only** — anything you wouldn't paste in a public Slack
- Compress with tinypng.com if filesize is over 200 KB

## Wiring a screenshot back into an article

1. Drop the PNG into `public/help/` matching the filename in the table above.
2. In the corresponding article (look up the article column above →
   open `src/help/articles/<slug>.md`), insert the image at the right
   spot with:

   ```markdown
   ![Alt text describing the screenshot](/help/today-overview.png)
   ```

3. Rebuild and push. The articles already render markdown images, so
   no code change is needed.

The image-insertion points used to be in the articles (and got
stripped when we decided to ship text-only for now). Roughly:

| Article                | Where the image goes |
|------------------------|----------------------|
| `getting-started.md`   | After "What's on the screen" intro (today-overview); after "+ New task button" sentence (new-task-button) |
| `tasks-basics.md`      | Right after the "Details / Comments / Activity" tab list (task-modal-tabs) |
| `pic-and-watchers.md`  | After the PIC intro paragraph (pic-avatar-row); after the watcher email-notification bullet (watchers-section) |
| `inbox-notifications.md` | After the three-tab bullet list at the top (inbox-tabs) |
| `docs-sharing.md`      | After "+ New doc" paragraph (docs-overview); after "person-plus icon" Sharing intro (share-doc-modal) |
| `duplicate-detection.md` | After the "Open existing" toast quote (dup-toast); after the "Find duplicates" button sentence (dup-scan-button) |
