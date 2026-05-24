// Content-loading skeletons with a real left-to-right shimmer (the
// Linear / Notion / ClickUp idiom). Each Block is a bg-surface-2
// underlay with the .tickd-shimmer gradient sweep overlaid.
//
// Variants:
//   <Skeleton rows={5} />          — basic row stack
//   <Skeleton rows={5} height={48} /> — taller rows
//   <Skeleton.Block className="..." /> — single block, freely sized
//   <Skeleton.TaskRow />           — matches the actual TaskRow shape
//                                    (circle + title line + meta line)

function Skeleton({ rows = 3, height = 40, className = '' }) {
  return (
    <div className={`py-3 space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Block
          key={i}
          style={{ height: `${height}px` }}
          className="w-full"
        />
      ))}
    </div>
  )
}

function Block({ className = '', style }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-surface-2 ${className}`}
      style={style}
    >
      <div className="absolute inset-0 tickd-shimmer" />
    </div>
  )
}

// Mimics the TaskRow layout — circular toggle on the left, title
// line up top, shorter meta line below. Looks like content is about
// to appear, not just a generic loading bar.
function TaskRow() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Block className="w-5 h-5 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Block className="h-3.5 w-3/4 rounded" />
        <Block className="h-2.5 w-1/2 rounded" />
      </div>
      <Block className="w-16 h-5 rounded-full flex-shrink-0" />
    </div>
  )
}

// Stack of TaskRow skeletons separated by dividers — drop into a
// list panel while data loads.
function TaskRows({ rows = 5, className = '' }) {
  return (
    <div className={`divide-y divide-border ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <TaskRow key={i} />
      ))}
    </div>
  )
}

Skeleton.Block = Block
Skeleton.TaskRow = TaskRow
Skeleton.TaskRows = TaskRows

export default Skeleton
