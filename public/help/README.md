# Help section screenshots

The articles in `src/help/articles/*.md` reference images from this
directory. Until you replace them with real screenshots, each filename
below has a styled SVG placeholder so the help section renders cleanly
(no broken-image icons).

## What to capture

All screenshots: PNG, ~1400×800 desktop or ~750×1500 mobile, dummy data
(no real customer / vehicle / employee names that you wouldn't share).

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
- Use the Tickd workspace with **dummy data only** — anything you wouldn't paste in a public Slack
- Compress with tinypng.com if filesize is over 200 KB

## Replacing a placeholder

Articles currently reference `.svg` files (the placeholders shipped in
this directory). When you have a real screenshot:

**Option A — keep the filename, change format.** Save your PNG as e.g.
`today-overview.png`, then in `src/help/articles/getting-started.md`
change `/help/today-overview.svg` → `/help/today-overview.png`. Delete
the old `.svg` placeholder so you don't ship dead files.

**Option B — overwrite the SVG.** If you export your screenshot AS an
SVG (Figma can do this), save it as `today-overview.svg` and don't
touch the markdown. Less common but valid.

The mapping of which article references which file is in the table
above.
