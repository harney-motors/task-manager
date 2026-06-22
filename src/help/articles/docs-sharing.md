# Docs: write, share, print

Docs are Tickd's notes / references / SOP surface. Markdown editor, private by default, shareable with one person or the whole workspace, printable to PDF.

## Creating a doc

Sidebar → **Docs** → **+ New doc** in the doc list. You get an empty title and an empty body. Both autosave as you type — the tiny "Saving…" badge in the header shows the state.

![Docs view with sidebar list on the left and editor on the right](/help/docs-overview.svg)

## Markdown formatting

The editor is plain markdown; the toolbar above the textarea wraps your selection (or the next thing you type) in the right syntax:

- `# heading`, `## subheading`
- `**bold**`, `*italic*`
- `` `inline code` ``, ``` ```fenced blocks``` ```
- `- bullet`, `1. ordered`
- `> blockquote`
- `[text](https://...)` for links
- `---` for a horizontal rule

There's a floating toolbar that pops up when you select text, mirroring the same actions. The **Make task** button on that toolbar turns the selection into a new task linked back to the doc.

## Privacy — docs are private by default

Every new doc is **private to its author**. No one else can read it unless you explicitly share.

You'll see this state on every doc:

- 🔒 **Private** — only you (and people you invite) can read
- 👥 **Workspace** — anyone in the workspace can read
- (Pre-existing docs from before this rule was added stay Workspace by default — nothing got unshared by surprise.)

## Sharing

Open a doc → click the **person-plus icon** in the header. The Share modal has two controls:

![Doc share modal with workspace toggle and per-user invite list](/help/share-doc-modal.svg)

1. **Anyone in this workspace can read** — flip this on to make the doc workspace-visible. Off keeps it private.
2. **Invite specific people** — pick a workspace member from the dropdown, click Add. Each invitee gets a permission level you can change:
   - **Can view** — read only
   - **Can edit** — full editing rights

You're always the author and your own access can't be revoked. The list always shows you on top with the "Author" tag.

## Print / Save as PDF

The **printer icon** in the doc header opens your browser's print dialog. On every modern desktop and mobile browser, "Save as PDF" is one of the destinations — so the same button covers physical print and PDF export.

The print layout is tuned for actual reading: serif body, sans-serif headings, page-break-avoid on headings and code blocks, A4 / Letter margins. Backgrounds are stripped to save toner.

## Deleting

The trash icon next to the printer button removes the doc. You can delete docs you authored or any doc in a workspace you own.
