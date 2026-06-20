import { useEffect, useState } from 'react'
import {
  useDeleteTask,
  useDismissDuplicate,
  useScanPicDuplicates,
} from '../lib/queries'
import { useToast } from './Toast'

// On-demand duplicate scanner for a single PIC. Opened from the
// "Scan for duplicates" button in the PIC view. Fires the AI scan,
// renders each suggested pair, and lets the user resolve them.
//
// Resolution actions per pair:
//   - Open A / Open B   — surface the task in the modal (so the user
//                         can manually compare / merge notes)
//   - Delete one        — destructive but the most common resolve
//                         when the same work was written twice
//   - Keep both         — records a dismissal so the pair won't be
//                         re-flagged on future scans
//
// We deliberately don't auto-merge. "Merge" semantics get tricky once
// you account for notes, watchers, subtasks, etc. A manual review +
// delete is safer.
export default function DuplicateScanModal({
  picId,
  picName,
  onClose,
  onOpenTask,
}) {
  const scan = useScanPicDuplicates()
  const dismiss = useDismissDuplicate()
  const deleteTask = useDeleteTask()
  const showToast = useToast()
  const [pairs, setPairs] = useState([])
  const [meta, setMeta] = useState({ total_scanned: 0, hit_cap: false })
  const [resolvedKeys, setResolvedKeys] = useState(() => new Set())

  // Fire the scan once on open. The PIC view passes a stable picId
  // so this won't re-fire spuriously.
  useEffect(() => {
    if (!picId) return
    scan.mutate(picId, {
      onSuccess: (res) => {
        setPairs(res?.pairs ?? [])
        setMeta({
          total_scanned: res?.total_scanned ?? 0,
          hit_cap: !!res?.hit_cap,
        })
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picId])

  function markResolved(pair) {
    setResolvedKeys((prev) =>
      new Set(prev).add(`${pair.task_a_id}|${pair.task_b_id}`),
    )
  }

  function handleKeepBoth(pair) {
    dismiss.mutate(
      { taskAId: pair.task_a_id, taskBId: pair.task_b_id },
      {
        onSuccess: () => {
          markResolved(pair)
          showToast('Marked as not duplicates')
        },
      },
    )
  }
  function handleDelete(pair, side) {
    const targetId = side === 'a' ? pair.task_a_id : pair.task_b_id
    const targetTitle =
      side === 'a' ? pair.task_a?.title : pair.task_b?.title
    if (
      !window.confirm(
        `Delete "${targetTitle ?? 'this task'}"? This cannot be undone.`,
      )
    )
      return
    deleteTask.mutate(targetId, {
      onSuccess: () => {
        markResolved(pair)
        showToast('Task deleted')
      },
    })
  }

  const visiblePairs = pairs.filter(
    (p) => !resolvedKeys.has(`${p.task_a_id}|${p.task_b_id}`),
  )

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto tickd-modal-backdrop"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-2xl overflow-hidden tickd-modal-content">
        <div className="flex items-center justify-between p-4 border-b border-border tickd-sheet-header">
          <div className="min-w-0">
            <div className="text-sm font-medium">Duplicate scan</div>
            <div className="text-[11px] text-text-3 mt-0.5 truncate">
              {picName ? `for ${picName}` : 'for this PIC'}
              {meta.total_scanned > 0 && (
                <span>
                  {' '}
                  · {meta.total_scanned} task{meta.total_scanned === 1 ? '' : 's'} scanned
                  {meta.hit_cap && ' (cap)'}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-3 hover:text-text p-1 rounded hover:bg-surface-2"
            aria-label="Close"
          >
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        <div className="p-5">
          {scan.isPending ? (
            <div className="text-center py-10">
              <i className="ti ti-loader-2 animate-spin text-2xl text-text-3" />
              <div className="text-xs text-text-3 mt-2">
                Scanning… this can take a few seconds.
              </div>
            </div>
          ) : scan.isError ? (
            <div className="text-center py-10">
              <div className="text-xs text-danger-text">
                Couldn&rsquo;t scan: {scan.error?.message}
              </div>
              <button
                type="button"
                onClick={() => picId && scan.mutate(picId)}
                className="mt-3 text-xs px-3 py-1.5 rounded border border-border hover:bg-surface-2"
              >
                Retry
              </button>
            </div>
          ) : visiblePairs.length === 0 ? (
            <div className="text-center py-10">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success-bg text-success-text mb-3">
                <i className="ti ti-checks text-2xl" />
              </div>
              <div className="text-sm font-medium">No duplicates found</div>
              <div className="text-xs text-text-2 mt-1">
                {pairs.length > 0
                  ? "You've resolved everything from this scan."
                  : 'Nothing looks like the same work to me.'}
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {visiblePairs.map((p) => (
                <PairRow
                  key={`${p.task_a_id}|${p.task_b_id}`}
                  pair={p}
                  onOpenTask={onOpenTask}
                  onKeepBoth={() => handleKeepBoth(p)}
                  onDeleteA={() => handleDelete(p, 'a')}
                  onDeleteB={() => handleDelete(p, 'b')}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 bg-surface-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function PairRow({ pair, onOpenTask, onKeepBoth, onDeleteA, onDeleteB }) {
  const confidenceTone =
    pair.confidence === 'high'
      ? 'bg-danger-bg text-danger-text'
      : 'bg-warning-bg text-warning-text'
  return (
    <li className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-surface-2 flex items-center justify-between gap-2 flex-wrap">
        <span
          className={`text-[10px] px-1.5 py-px rounded uppercase tracking-wider font-semibold ${confidenceTone}`}
        >
          {pair.confidence}
        </span>
        <span className="text-[11px] text-text-2 italic flex-1 min-w-0">
          {pair.reason}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
        <PairSide
          task={pair.task_a}
          onOpen={() => onOpenTask?.(pair.task_a_id)}
          onDelete={onDeleteA}
        />
        <PairSide
          task={pair.task_b}
          onOpen={() => onOpenTask?.(pair.task_b_id)}
          onDelete={onDeleteB}
        />
      </div>
      <div className="px-3 py-2 border-t border-border bg-surface-2 flex justify-end">
        <button
          type="button"
          onClick={onKeepBoth}
          className="text-[11px] px-2.5 py-1 rounded border border-border text-text-2 hover:text-text hover:bg-surface inline-flex items-center gap-1"
          title="Mark as not duplicates"
        >
          <i className="ti ti-check text-xs" />
          Keep both
        </button>
      </div>
    </li>
  )
}

function PairSide({ task, onOpen, onDelete }) {
  return (
    <div className="p-3">
      <button
        type="button"
        onClick={onOpen}
        className="text-left w-full"
        title="Open task"
      >
        <div className="text-sm font-medium leading-snug line-clamp-2 hover:underline">
          {task?.title ?? '(deleted)'}
        </div>
        <div className="text-[10px] text-text-3 mt-1 flex items-center gap-2 flex-wrap">
          {task?.due_date && (
            <span>
              <i className="ti ti-calendar text-[10px] mr-0.5" />
              {task.due_date}
            </span>
          )}
          {task?.status && <span>{task.status}</span>}
        </div>
      </button>
      <div className="flex items-center gap-1 mt-2">
        <button
          type="button"
          onClick={onOpen}
          className="text-[10px] px-1.5 py-0.5 rounded text-info hover:bg-info-bg/40"
          title="Open"
        >
          Open
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-[10px] px-1.5 py-0.5 rounded text-danger-text hover:bg-danger-bg/40"
          title="Delete this one"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
