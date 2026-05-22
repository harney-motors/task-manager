import { useMemo, useState } from 'react'
import { usePeople, useTasks } from '../lib/queries'
import { isOverdue } from '../lib/dates'
import { picDot, picPill } from '../lib/colors'
import TaskRow from '../components/TaskRow'
import ShareModal from '../components/ShareModal'

// Sentinel value used as `selectedPicId` to surface the unassigned bucket
// (tasks with pic_id === null). Distinct from any UUID so it can't collide.
const UNASSIGNED = '__unassigned__'

// `selectedPicId` and `onSelectPic` are optional — when passed, PicView
// becomes controlled and the parent owns the selection (used by the
// search palette to jump directly to a person). When omitted, PicView
// defaults to the first PIC with tasks.
export default function PicView({ onOpenTask, selectedPicId: controlledId, onSelectPic }) {
  const { data: people = [] } = usePeople()
  const { data: tasks = [], isLoading } = useTasks()

  const unassignedCount = useMemo(
    () => tasks.filter((t) => !t.pic_id && t.status !== 'Done').length,
    [tasks],
  )

  const defaultPicId = useMemo(() => {
    const withTasks = people.find((p) =>
      tasks.some((t) => t.pic_id === p.id),
    )
    return withTasks?.id ?? people[0]?.id ?? null
  }, [people, tasks])

  const [internalPicId, setInternalPicId] = useState(defaultPicId)
  const selectedPicId = controlledId ?? internalPicId
  const setSelectedPicId = onSelectPic ?? setInternalPicId

  const [shareOpen, setShareOpen] = useState(false)

  const isUnassigned = selectedPicId === UNASSIGNED
  const effectivePicId = isUnassigned
    ? UNASSIGNED
    : people.some((p) => p.id === selectedPicId)
      ? selectedPicId
      : defaultPicId

  const selectedPic =
    !isUnassigned && people.find((p) => p.id === effectivePicId)
  const picTasks = useMemo(
    () =>
      isUnassigned
        ? tasks.filter((t) => !t.pic_id)
        : tasks.filter((t) => t.pic_id === effectivePicId),
    [tasks, effectivePicId, isUnassigned],
  )
  const activeCount = picTasks.filter((t) => t.status !== 'Done').length
  const overdueCount = picTasks.filter(
    (t) => t.status !== 'Done' && isOverdue(t.due_date),
  ).length

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Chip selector */}
      <div className="p-4 border-b border-border flex flex-wrap gap-1.5">
        {people.map((p) => {
          const count = tasks.filter(
            (t) => t.pic_id === p.id && t.status !== 'Done',
          ).length
          const isSelected = p.id === effectivePicId && !isUnassigned
          return (
            <button
              key={p.id}
              onClick={() => setSelectedPicId(p.id)}
              className={`px-2.5 py-1 rounded-md text-xs inline-flex items-center gap-1.5 border transition-colors ${
                isSelected
                  ? 'bg-surface-2 border-border-strong text-text font-medium'
                  : 'border-border text-text-2 hover:text-text hover:bg-surface-2'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${picDot(p.color)}`} />
              {p.name.split(' ')[0]}
              {count > 0 && <span className="text-text-3">{count}</span>}
            </button>
          )
        })}
        {/* Unassigned bucket — surfaced even when count is 0 so the user
            can verify nothing is missing an owner. */}
        <button
          onClick={() => setSelectedPicId(UNASSIGNED)}
          className={`px-2.5 py-1 rounded-md text-xs inline-flex items-center gap-1.5 border transition-colors ${
            isUnassigned
              ? 'bg-surface-2 border-border-strong text-text font-medium'
              : 'border-border text-text-2 hover:text-text hover:bg-surface-2'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-text-3/40 border border-text-3/60" />
          Unassigned
          {unassignedCount > 0 && (
            <span className="text-text-3">{unassignedCount}</span>
          )}
        </button>
      </div>

      {/* Header */}
      {selectedPic && (
        <div className="px-4 py-3 bg-surface-2 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${picPill(selectedPic.color)}`}
            >
              {selectedPic.initials}
            </div>
            <div>
              <div className="text-sm font-medium">{selectedPic.name}</div>
              <div className="text-xs text-text-2">
                {selectedPic.title}
                {' · '}
                {activeCount} active
                {overdueCount > 0 && (
                  <span className="text-danger-text font-medium">
                    {' · '}
                    {overdueCount} overdue
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShareOpen(true)}
            disabled={activeCount === 0}
            className="text-xs font-medium bg-success text-white px-3 py-1.5 rounded inline-flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90"
          >
            <i className="ti ti-brand-whatsapp text-sm" />
            Share to WhatsApp
          </button>
        </div>
      )}

      {isUnassigned && (
        <div className="px-4 py-3 bg-surface-2 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-surface border border-dashed border-border-strong flex items-center justify-center text-text-3">
            <i className="ti ti-user-question text-base" />
          </div>
          <div>
            <div className="text-sm font-medium">Unassigned</div>
            <div className="text-xs text-text-2">
              Tasks without a PIC ·{' '}
              {activeCount} active
              {overdueCount > 0 && (
                <span className="text-danger-text font-medium">
                  {' · '}
                  {overdueCount} overdue
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="px-4">
        {isLoading ? (
          <div className="py-10 text-center text-xs text-text-3">Loading…</div>
        ) : picTasks.length === 0 ? (
          <div className="py-10 text-center text-xs text-text-3">
            {isUnassigned
              ? 'Every task has an owner.'
              : selectedPic
                ? `${selectedPic.name.split(' ')[0]} has no tasks`
                : 'No PIC selected'}
          </div>
        ) : (
          picTasks.map((t) => (
            <TaskRow key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
          ))
        )}
      </div>

      {shareOpen && selectedPic && (
        <ShareModal
          pic={selectedPic}
          tasks={picTasks}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}
