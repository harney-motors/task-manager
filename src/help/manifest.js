// Help-article index. Articles live as raw markdown next to this
// file; Vite's `?raw` import loads them at build time as plain
// strings. To add a new article:
//   1. Create src/help/articles/<slug>.md
//   2. Add an entry to ARTICLES below
//   3. Drop any screenshots into /public/help/ and reference them
//      from the markdown as ![alt](/help/<file>.png)
//
// Each entry's `summary` is shown on the help index card; the body
// is the full markdown. `category` groups articles in the list view;
// `order` controls the within-category sort.

import gettingStarted from './articles/getting-started.md?raw'
import tasksBasics from './articles/tasks-basics.md?raw'
import inboxNotifications from './articles/inbox-notifications.md?raw'
import docsSharing from './articles/docs-sharing.md?raw'
import picAndWatchers from './articles/pic-and-watchers.md?raw'
import duplicateDetection from './articles/duplicate-detection.md?raw'
import shortcuts from './articles/keyboard-shortcuts.md?raw'
import troubleshooting from './articles/troubleshooting.md?raw'

export const ARTICLES = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    category: 'Basics',
    order: 1,
    summary: 'A 5-minute tour of the Tickd layout and your first task.',
    body: gettingStarted,
  },
  {
    slug: 'tasks-basics',
    title: 'Working with tasks',
    category: 'Basics',
    order: 2,
    summary:
      'How to create, edit, assign, schedule, and finish tasks across the four views.',
    body: tasksBasics,
  },
  {
    slug: 'pic-and-watchers',
    title: 'PICs and watchers',
    category: 'Basics',
    order: 3,
    summary:
      'The two ways someone can be tied to a task — who owns the work vs who keeps an eye on it.',
    body: picAndWatchers,
  },
  {
    slug: 'inbox-notifications',
    title: 'The Inbox: updates, mentions, nudges',
    category: 'Notifications',
    order: 1,
    summary:
      'Where Tickd surfaces what needs your attention — and how to dismiss things you have already handled.',
    body: inboxNotifications,
  },
  {
    slug: 'docs-sharing',
    title: 'Docs: write, share, print',
    category: 'Docs',
    order: 1,
    summary:
      'Docs are private by default. How to share with one person, the whole workspace, or export to PDF.',
    body: docsSharing,
  },
  {
    slug: 'duplicate-detection',
    title: 'Catching duplicate tasks',
    category: 'Workflow',
    order: 1,
    summary:
      'How Tickd flags duplicates after a create, plus the on-demand scan in the PIC view.',
    body: duplicateDetection,
  },
  {
    slug: 'keyboard-shortcuts',
    title: 'Keyboard shortcuts',
    category: 'Reference',
    order: 1,
    summary: 'The hotkeys that make Tickd faster than clicking.',
    body: shortcuts,
  },
  {
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    category: 'Reference',
    order: 2,
    summary:
      'What to do if something is acting strangely — offline indicator, stuck saves, missing tasks.',
    body: troubleshooting,
  },
]

// Stable category order for the help index. Anything not in this
// list falls through to the end, sorted alphabetically.
export const CATEGORY_ORDER = [
  'Basics',
  'Notifications',
  'Docs',
  'Workflow',
  'Reference',
]

export function findArticle(slug) {
  return ARTICLES.find((a) => a.slug === slug) ?? null
}

export function articlesByCategory() {
  const groups = new Map()
  for (const a of ARTICLES) {
    if (!groups.has(a.category)) groups.set(a.category, [])
    groups.get(a.category).push(a)
  }
  // Sort entries inside each category by `order`, then title.
  for (const list of groups.values()) {
    list.sort(
      (x, y) =>
        (x.order ?? 99) - (y.order ?? 99) || x.title.localeCompare(y.title),
    )
  }
  // Stable category sort.
  const orderedCats = [...groups.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a)
    const bi = CATEGORY_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
  return orderedCats.map((cat) => ({ category: cat, articles: groups.get(cat) }))
}
