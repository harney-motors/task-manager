// First-run guidance shown when a workspace has no people OR no tasks.
// Replaces the bare empty panels with a 3-step "what to do next"
// guide so a brand-new user has somewhere to go.
//
// Rendered by TodayView (and PicHomeView's empty case) when the
// active workspace is essentially empty.

export default function EmptyWorkspaceGuide({
  hasPeople,
  hasTasks,
  onOpenSettings,
  onFocusQuickEntry,
}) {
  // Step 1 done = at least one person exists. Step 2 done = at least
  // one task exists. We render whichever is incomplete plus a small
  // contextual nudge.
  const steps = [
    {
      done: hasPeople,
      icon: 'ti-users',
      title: 'Add the people you work with',
      body: 'Add a PIC for each person so you can assign tasks by first name.',
      action: hasPeople
        ? null
        : {
            label: 'Open People settings',
            onClick: onOpenSettings,
          },
    },
    {
      done: hasTasks,
      icon: 'ti-bolt',
      title: 'Add your first task',
      body:
        'Type a task in the quick entry above. Mention a first name and Tickd auto-assigns. Try: “Asbert to confirm board agenda by Friday”.',
      action: hasTasks
        ? null
        : {
            label: 'Jump to quick entry',
            onClick: onFocusQuickEntry,
          },
    },
    {
      done: false, // always advisory
      icon: 'ti-sparkles',
      title: 'Try the AI',
      body:
        'Press Cmd+K, then type something like “show me Errol’s overdue” or “mark all due tomorrow as Done”. Tickd previews before any changes apply.',
    },
  ]

  return (
    <div className="bg-surface border border-border rounded-xl p-6 sm:p-8">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-info-bg text-info-text mb-3">
          <i className="ti ti-rocket text-xl" />
        </div>
        <h2 className="text-lg font-medium">Welcome to Tickd</h2>
        <p className="text-xs text-text-2 mt-1 max-w-md mx-auto">
          A short setup gets you to a useful state in under a minute.
        </p>
      </div>

      <ol className="space-y-3">
        {steps.map((step, idx) => (
          <li
            key={idx}
            className="flex items-start gap-3 rounded-lg border border-border p-3"
          >
            <div
              className={`flex-shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-medium ${
                step.done
                  ? 'bg-success-bg text-success-text'
                  : 'bg-surface-2 text-text-2'
              }`}
            >
              {step.done ? <i className="ti ti-check text-sm" /> : idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <i className={`ti ${step.icon} text-text-3 text-sm`} />
                {step.title}
              </div>
              <p className="text-xs text-text-2 mt-1 leading-relaxed">
                {step.body}
              </p>
              {step.action && (
                <button
                  onClick={step.action.onClick}
                  className="text-xs mt-2 inline-flex items-center gap-1 px-2 py-1 rounded border border-info text-info-text hover:bg-info-bg"
                >
                  {step.action.label}
                  <i className="ti ti-arrow-right text-xs" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
