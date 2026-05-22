// Apply an AI-generated filter spec from /nl-filter to the app state.
// Resolves first-name → person id and dept name → dept id using the
// already-loaded people / departments lists. Switches view based on
// the AI's hint, and shows a toast with what got applied.

export function applyAiFilter(
  filter,
  { people, departments, setView, setPicViewSelectedId, setGridFilterSignal, showToast },
) {
  const pic = filter.pic_first_name
    ? people.find(
        (p) =>
          p.name.split(' ')[0].toLowerCase() ===
          filter.pic_first_name.toLowerCase(),
      )
    : null
  const dept = filter.department_name
    ? departments.find(
        (d) => d.name.toLowerCase() === filter.department_name.toLowerCase(),
      )
    : null

  const status = filter.include_done
    ? filter.status ?? null
    : filter.status ?? null
  // When include_done is false (default), we want to exclude Done. Our
  // existing Grid filter is a single value — we can't express "not Done".
  // For now: if no specific status is set and include_done is false,
  // we leave status null (shows all) and the user can see Done items
  // mixed in. This is a small fidelity loss in v1 of NL filter.

  const hasAnyFilter = Boolean(pic || dept || status)
  let targetView = filter.view_hint ?? 'list'

  // PIC view is best for "one person's tasks"; Grid handles multi-filter.
  if (pic && !dept && !status) {
    targetView = 'pic'
  } else if (hasAnyFilter) {
    targetView = 'grid'
  }

  setView(targetView)
  if (targetView === 'pic' && pic) {
    setPicViewSelectedId(pic.id)
  }
  if (targetView === 'grid') {
    setGridFilterSignal({
      picId: pic?.id ?? 'all',
      deptId: dept?.id ?? 'all',
      status: status ?? 'all',
      key: Date.now(),
    })
  }

  showToast(filter.query_summary ?? 'Applied AI filter')
}
