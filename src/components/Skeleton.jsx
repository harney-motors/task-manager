// Generic shimmer skeleton. Replaces "Loading…" text wherever lists are loading.
//
// Usage:
//   <Skeleton rows={5} />              // basic row stack
//   <Skeleton rows={5} height={48} />  // taller rows
//   <Skeleton.Block className="..." /> // single block, freely sized

function Skeleton({ rows = 3, height = 40, className = '' }) {
  return (
    <div className={`py-3 space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-md bg-surface-2 animate-pulse"
          style={{ height: `${height}px` }}
        />
      ))}
    </div>
  )
}

function Block({ className = '', style }) {
  return (
    <div
      className={`rounded-md bg-surface-2 animate-pulse ${className}`}
      style={style}
    />
  )
}

Skeleton.Block = Block

export default Skeleton
