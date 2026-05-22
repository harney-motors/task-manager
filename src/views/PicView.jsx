import { useMemo, useState } from 'react'
import { usePeople, useTasks } from '../lib/queries'
import { isOverdue } from '../lib/dates'
import { picDot, picPill } from '../lib/colors'
import TaskRow from '../components/TaskRow'
import ShareModal from '../components/ShareModal'

export default function PicView({ onOpenTask }) {
  const { data: people = [] } = usePeople()
  const { data: tasks = [], isLoading } = useTasks()

  // Default to the first PIC with at least one task — fall back to first person
  const defaultPicId = useMemo(() => {
    const withTasks = people.find((p) =>
      tasks.some((t) => t.pic_id === p.id),
    )
    return withTasks?.id ?? people[0]?.id ?? null
  }, [people, tasks])

  const [selectedPicId, setSelectedPicId] = useState(defaultPicId)
  const [shareOpen, setShareOpen] = useState(false)

  // Re-default if selected PIC no longer in list (rare)
  const effectivePicId =
    people.some((p) => p.id === selectedPicId) ? selectedPicId : defaultPicId

  const selectedPic = people.find((p) => p.id === effectivePicId)
  const picTasks = useMemo(
    () => tasks.filter((t) => t.pic_id === effectivePicId),
    [tasks, effectivePicId],
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
          const isSelected = p.id === effectivePicId
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

      {/* Task list */}
      <div className="px-4">
        {isLoading ? (
          <div className="py-10 text-center text-xs text-text-3">Loading…</div>
        ) : picTasks.length === 0 ? (
          <div className="py-10 text-center text-xs text-text-3">
            {selectedPic
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
