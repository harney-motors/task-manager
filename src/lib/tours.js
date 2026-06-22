// Tour definitions. A tour is { id, name, steps: [{ target, title,
// body, placement }] }. The id is used to remember "user finished
// this" via localStorage so the autofire-on-first-login doesn't
// re-fire on every visit.
//
// `target` is a CSS selector — usually a data-tour="<name>" attribute
// added to the actual DOM element (we tag stable hooks rather than
// chasing class names, which churn with restyles).
//
// `placement` is one of 'top' | 'bottom' | 'left' | 'right' — used by
// the popover positioner to pick a side. If the target is missing or
// off-screen, the popover falls back to centred.

export const TOURS = {
  welcome: {
    id: 'welcome-v1',
    name: 'Welcome to Tickd',
    steps: [
      {
        target: null, // no spotlight on the first step — full overview
        title: 'Welcome to Tickd',
        body: 'A quick 5-step tour. You can dismiss this anytime and replay from the Help page.',
      },
      {
        target: '[data-tour="sidebar-new-task"]',
        title: 'Add tasks fast',
        body: 'The + New task button is your shortcut from anywhere. Press / on the keyboard for the same thing without clicking.',
        placement: 'right',
      },
      {
        target: '[data-tour="sidebar-views"]',
        title: 'Reshape the same data',
        body: 'Today / List / Grid / By PIC / Calendar all show the SAME tasks in different shapes. Filters carry between them.',
        placement: 'right',
      },
      {
        target: '[data-tour="sidebar-inbox"]',
        title: 'Stay on top of changes',
        body: 'The Inbox surfaces updates on your tasks, mentions, and AI nudges. Dismiss what you have handled; the badge shows what is left.',
        placement: 'right',
      },
      {
        target: '[data-tour="sidebar-docs"]',
        title: 'Notes that travel with the work',
        body: 'Docs are private to you by default. Share with one teammate, the whole workspace, or export to PDF. The Help page (where you can replay this tour) lives just above.',
        placement: 'right',
      },
      {
        target: null,
        title: "You're set",
        body: 'Open the Help page any time for full articles. The button is in the sidebar near the bottom.',
      },
    ],
  },
}

export function getTour(id) {
  return Object.values(TOURS).find((t) => t.id === id) ?? null
}
