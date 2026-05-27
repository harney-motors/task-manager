import { useEffect, useMemo, useState } from 'react'
import { usePeople, useDepartments, useCreateTask } from '../lib/queries'
import { useAuth } from '../auth/AuthProvider'
import { useToast } from './Toast'
import { extractTasksFromTranscript } from '../api/aiExtract'
import { addWatcher } from '../api/watchers'
import { useDictation } from '../lib/useDictation'
import { picPill, statusPill } from '../lib/colors'
import ModalHeader from './ModalHeader'
import {
  BUILTIN_TEMPLATES,
  deleteUserTemplate,
  loadUserTemplates,
  saveUserTemplate,
} from '../lib/meetingTemplates'

const SAMPLE_PLACEHOLDER = `Paste meeting notes or transcript here. e.g.

WEM 2026-05-22
- Asbert to confirm board agenda by Friday
- Clem to fix lift bay 2 hydraulics — urgent
- Richard to reply to PwC audit follow-up next week
- Ongoing: monthly Takata recall visits (Iandre)
…`

export default function ExtractFromMeetingModal({ open, onClose }) {
  const { workspace, user } = useAuth()
  const { data: people = [] } = usePeople()
  const { data: departments = [] } = useDepartments()
  const createTask = useCreateTask()
  const showToast = useToast()

  const [transcript, setTranscript] = useState('')
  const [drafts, setDrafts] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [extracting, setExtracting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  // Templates — workspace-scoped list of built-ins + user saves.
  // Refreshes on open so a save in a previous session is visible.
  const [userTemplates, setUserTemplates] = useState([])
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const allTemplates = useMemo(
    () => [...BUILTIN_TEMPLATES, ...userTemplates],
    [userTemplates],
  )

  // Voice dictation for live meeting notes. Each final chunk appends
  // a newline so successive utterances land on separate lines —
  // closer to how transcripts actually read.
  const dict = useDictation({
    onResult: (chunk) => {
      const trimmed = chunk.trim()
      if (!trimmed) return
      setTranscript((prev) =>
        prev ? `${prev.replace(/\s+$/, '')}\n${trimmed}` : trimmed,
      )
    },
  })

  useEffect(() => {
    if (!open) {
      setTranscript('')
      setDrafts([])
      setSelected(new Set())
      setError(null)
      setExtracting(false)
      setCreating(false)
      setShowTemplatePicker(false)
      setShowSaveDialog(false)
      setNewTemplateName('')
      if (dict.listening) dict.stop()
    } else {
      // Re-read user templates each time we open so we pick up edits
      // made in another tab / session.
      setUserTemplates(loadUserTemplates(workspace?.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace?.id])

  function applyTemplate(tmpl) {
    if (!tmpl) return
    // If the user already has text, confirm before overwrite (the
    // template completely replaces what's there).
    if (transcript.trim().length > 0) {
      if (
        !confirm(
          `Replace your current notes with the "${tmpl.name}" template?`,
        )
      )
        return
    }
    setTranscript(tmpl.body)
    setShowTemplatePicker(false)
  }

  function handleSaveTemplate() {
    const name = newTemplateName.trim()
    if (!name || !transcript.trim()) return
    saveUserTemplate(workspace?.id, { name, body: transcript })
    setUserTemplates(loadUserTemplates(workspace?.id))
    setNewTemplateName('')
    setShowSaveDialog(false)
    showToast(`Saved "${name}" as an agenda template`)
  }

  function handleDeleteTemplate(id) {
    const next = deleteUserTemplate(workspace?.id, id)
    setUserTemplates(next)
  }

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (e.key === 'Escape' && !extracting && !creating) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, extracting, creating, onClose])

  if (!open) return null

  function findPerson(firstName) {
    if (!firstName) return null
    const norm = firstName.toLowerCase().trim()
    return (
      people.find((p) => p.name.split(' ')[0].toLowerCase() === norm) ?? null
    )
  }

  function findDepartment(name) {
    if (!name) return null
    const norm = name.toLowerCase().trim()
    return departments.find((d) => d.name.toLowerCase() === norm) ?? null
  }

  async function handleExtract() {
    if (!transcript.trim()) return
    setExtracting(true)
    setError(null)
    setDrafts([])
    try {
      const result = await extractTasksFromTranscript(transcript, {
        workspaceId: workspace.id,
      })
      const enriched = (result.tasks ?? []).map((t, idx) => {
        const pic = findPerson(t.pic_first_name)
        const dept = findDepartment(t.department)
        const watcherPeople = (t.watcher_first_names ?? [])
          .map(findPerson)
          .filter(Boolean)
          .filter((p) => p.id !== pic?.id)
        return {
          ...t,
          _idx: idx,
          _pic: pic,
          _dept: dept,
          _watchers: watcherPeople,
        }
      })
      setDrafts(enriched)
      setSelected(new Set(enriched.map((d) => d._idx)))
      if (enriched.length === 0) {
        setError('No action items found in that transcript.')
      }
    } catch (err) {
      setError(err.message ?? 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  async function handleCreate() {
    const toCreate = drafts.filter((d) => selected.has(d._idx))
    if (toCreate.length === 0) return
    setCreating(true)
    let created = 0
    let failed = 0
    for (const draft of toCreate) {
      try {
        const task = await new Promise((resolve, reject) => {
          createTask.mutate(
            {
              title: draft.title,
              pic_id: draft._pic?.id ?? null,
              department_id: draft._dept?.id ?? null,
              due_date: draft.due_date || null,
              priority: draft.priority,
              status: draft.status,
              source: `Meeting (AI · ${new Date().toISOString().slice(0, 10)})`,
              notes: draft.source_quote ?? null,
            },
            {
              onSuccess: (data) => resolve(data),
              onError: (err) => reject(err),
            },
          )
        })
        // Attach watchers (fire-and-forget)
        for (const w of draft._watchers ?? []) {
          addWatcher(task.id, w.id).catch(() => {})
        }
        created++
      } catch {
        failed++
      }
    }
    setCreating(false)
    if (failed === 0) {
      showToast(
        `Created ${created} task${created === 1 ? '' : 's'} from the meeting.`,
      )
    } else {
      showToast(
        `Created ${created}, failed ${failed}. Check the failed items.`,
        { type: 'error' },
      )
    }
    if (failed === 0) onClose()
  }

  function toggle(idx) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === drafts.length) setSelected(new Set())
    else setSelected(new Set(drafts.map((d) => d._idx)))
  }

  const hasDrafts = drafts.length > 0
  const selectedCount = selected.size

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && !extracting && !creating && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto tickd-modal-backdrop"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] tickd-modal-content">
        <ModalHeader
          title="Import from meeting"
          icon="ti-sparkles"
          onClose={extracting || creating ? () => {} : onClose}
        />

        {!hasDrafts ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-3 text-xs text-text-2 border-b border-border">
              Paste meeting notes or a transcript. Claude will extract the
              action items, infer PICs by first name, and pre-fill dates,
              priority, and status. You review before anything saves.
            </div>

            {/* Agenda template picker. Pre-fill a meeting skeleton from
                a built-in or saved template, then fill in the blanks.
                The dropdown sits between the helper text and the
                textarea so it reads as "shape the page first, then
                write into it" — the established Notion / Slack /
                ClickUp template-picker pattern. */}
            <div className="px-5 pt-3 pb-1 flex items-center gap-2 flex-wrap relative">
              <button
                type="button"
                onClick={() => setShowTemplatePicker((x) => !x)}
                className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-surface hover:bg-surface-2 inline-flex items-center gap-1.5"
                disabled={extracting}
              >
                <i className="ti ti-template text-sm" />
                Use a template
                <i className="ti ti-chevron-down text-xs text-text-3" />
              </button>
              {transcript.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSaveDialog(true)}
                  className="text-xs px-2.5 py-1.5 rounded-md border border-border text-text-2 hover:text-text hover:bg-surface-2 inline-flex items-center gap-1.5"
                  disabled={extracting}
                  title="Save current notes as a reusable template"
                >
                  <i className="ti ti-device-floppy text-sm" />
                  Save as template
                </button>
              )}
              {showTemplatePicker && (
                <div className="absolute top-full left-5 right-5 sm:right-auto mt-1 sm:w-72 max-w-[calc(100vw-3rem)] max-h-80 overflow-y-auto bg-surface border border-border rounded-md shadow-lg z-10">
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-text-3 border-b border-border">
                    Built-in
                  </div>
                  {BUILTIN_TEMPLATES.map((t) => (
                    <TemplateRow
                      key={t.id}
                      tmpl={t}
                      onPick={() => applyTemplate(t)}
                    />
                  ))}
                  {userTemplates.length > 0 && (
                    <>
                      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-text-3 border-y border-border bg-surface-2/50">
                        Saved
                      </div>
                      {userTemplates.map((t) => (
                        <TemplateRow
                          key={t.id}
                          tmpl={t}
                          onPick={() => applyTemplate(t)}
                          onDelete={() => handleDeleteTemplate(t.id)}
                        />
                      ))}
                    </>
                  )}
                </div>
              )}
              {showSaveDialog && (
                <div className="absolute top-full left-5 right-5 sm:left-auto sm:right-5 mt-1 sm:w-72 max-w-[calc(100vw-3rem)] bg-surface border border-border rounded-md shadow-lg z-10 p-3">
                  <div className="text-xs text-text-2 mb-2">
                    Save the current notes as a reusable agenda?
                  </div>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="Template name"
                    className="w-full text-sm px-2 py-1 border border-border rounded bg-surface outline-none focus:border-info mb-2"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTemplate()
                      if (e.key === 'Escape') setShowSaveDialog(false)
                    }}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowSaveDialog(false)}
                      className="text-xs px-2.5 py-1 rounded text-text-3 hover:text-text"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveTemplate}
                      disabled={!newTemplateName.trim()}
                      className="text-xs px-2.5 py-1 rounded bg-info text-white font-medium disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative flex-1 m-5 mt-3 mb-2 min-h-[260px] flex">
              <textarea
                value={
                  dict.listening && dict.interim
                    ? `${transcript}${transcript ? '\n' : ''}${dict.interim}`
                    : transcript
                }
                onChange={(e) => {
                  if (dict.listening) return // interim text owns the field
                  setTranscript(e.target.value)
                }}
                placeholder={
                  dict.listening
                    ? 'Listening… speak your notes'
                    : SAMPLE_PLACEHOLDER
                }
                disabled={extracting}
                className="w-full p-3 pr-12 border border-border rounded-md text-sm bg-bg outline-none focus:border-info resize-none font-mono leading-relaxed"
              />
              {dict.supported && (
                <button
                  type="button"
                  onClick={() =>
                    dict.listening ? dict.stop() : dict.start()
                  }
                  disabled={extracting}
                  title={
                    dict.listening
                      ? 'Stop dictating'
                      : 'Dictate notes (Web Speech API)'
                  }
                  className={`absolute top-2 right-2 p-2 rounded ${
                    dict.listening
                      ? 'bg-danger-bg text-danger-text animate-pulse'
                      : 'text-text-3 hover:text-text hover:bg-surface-2 border border-border bg-surface'
                  }`}
                  aria-label={
                    dict.listening ? 'Stop dictating' : 'Dictate notes'
                  }
                >
                  <i
                    className={`ti ${dict.listening ? 'ti-microphone-filled' : 'ti-microphone'} text-base`}
                  />
                </button>
              )}
            </div>
            {error && (
              <p className="px-5 pb-2 text-xs text-danger-text">{error}</p>
            )}
            <div className="px-5 pb-2 text-[11px] text-text-3">
              Max 50,000 characters. Workspace context (people, departments) is
              sent along automatically.
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 bg-surface-2 border-t border-border">
              <button
                onClick={onClose}
                disabled={extracting}
                className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExtract}
                disabled={!transcript.trim() || extracting}
                className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {extracting ? (
                  <>
                    <i className="ti ti-loader-2 animate-spin text-sm" />
                    Extracting (up to a minute)…
                  </>
                ) : (
                  <>
                    <i className="ti ti-sparkles text-sm" />
                    Extract tasks
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-text-2">
                Found <span className="font-medium text-text">{drafts.length}</span>{' '}
                action item{drafts.length === 1 ? '' : 's'}. Uncheck any you
                don&rsquo;t want to create.
              </div>
              <button
                onClick={toggleAll}
                className="text-[11px] text-text-3 underline hover:text-text"
              >
                {selectedCount === drafts.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {drafts.map((d) => {
                const isSelected = selected.has(d._idx)
                return (
                  <div
                    key={d._idx}
                    className={`border rounded-lg p-3 transition-colors ${
                      isSelected
                        ? 'border-border bg-surface'
                        : 'border-border bg-surface-2 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(d._idx)}
                        className="mt-1 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{d.title}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {d._pic ? (
                            <span
                              className={`px-1.5 py-px rounded text-[10px] font-medium ${picPill(d._pic.color)}`}
                            >
                              {d._pic.name.split(' ')[0]}
                            </span>
                          ) : d.pic_first_name ? (
                            <span className="px-1.5 py-px rounded text-[10px] bg-danger-bg text-danger-text">
                              ? {d.pic_first_name}
                            </span>
                          ) : (
                            <span className="text-[10px] text-text-3">
                              Unassigned
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-px rounded-full text-[10px] font-medium ${statusPill(d.status)}`}
                          >
                            {d.status}
                          </span>
                          <span className="text-[10px] text-text-2">
                            {d.priority}
                          </span>
                          {d._dept && (
                            <span className="text-[10px] text-text-2">
                              · {d._dept.name}
                            </span>
                          )}
                          {d.due_date && (
                            <span className="text-[10px] text-text-2">
                              · due {d.due_date}
                            </span>
                          )}
                          {(d._watchers ?? []).length > 0 && (
                            <span className="text-[10px] text-text-3">
                              + {d._watchers.map((w) => w.name.split(' ')[0]).join(', ')}
                            </span>
                          )}
                        </div>
                        {d.source_quote && (
                          <div className="text-[11px] text-text-3 italic mt-1.5 line-clamp-2">
                            &ldquo;{d.source_quote}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {error && (
              <p className="px-5 pb-2 text-xs text-danger-text">{error}</p>
            )}

            <div className="flex justify-between gap-2 px-4 py-3 bg-surface-2 border-t border-border">
              <button
                onClick={() => {
                  setDrafts([])
                  setSelected(new Set())
                }}
                disabled={creating}
                className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface disabled:opacity-50"
              >
                ← Back / try again
              </button>
              <button
                onClick={handleCreate}
                disabled={selectedCount === 0 || creating}
                className="text-xs px-3 py-1.5 rounded bg-info text-white font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {creating ? (
                  <>
                    <i className="ti ti-loader-2 animate-spin text-sm" />
                    Creating…
                  </>
                ) : (
                  <>
                    <i className="ti ti-plus text-sm" />
                    Create {selectedCount} task{selectedCount === 1 ? '' : 's'}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// One row in the template picker dropdown. Built-ins show their
// description; user templates show a delete (×) action on hover.
function TemplateRow({ tmpl, onPick, onDelete }) {
  return (
    <div className="group flex items-start gap-2 px-3 py-2 hover:bg-surface-2 cursor-pointer border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onPick}
        className="flex-1 text-left flex items-start gap-2"
      >
        {tmpl.icon && (
          <i className={`ti ${tmpl.icon} text-base text-info flex-shrink-0 mt-0.5`} />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{tmpl.name}</div>
          {tmpl.description && (
            <div className="text-[11px] text-text-3 line-clamp-2 leading-snug">
              {tmpl.description}
            </div>
          )}
        </div>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (confirm(`Delete "${tmpl.name}" template?`)) onDelete()
          }}
          className="opacity-0 group-hover:opacity-100 text-text-3 hover:text-danger-text p-1"
          aria-label="Delete template"
        >
          <i className="ti ti-x text-xs" />
        </button>
      )}
    </div>
  )
}
