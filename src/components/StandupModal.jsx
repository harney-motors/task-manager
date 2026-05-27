import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { generateStandup } from '../api/standup'
import { useToast } from './Toast'
import ModalHeader from './ModalHeader'

// "Generate today's standup" modal.
//
// Used to auto-fire generation on open with no choices. Now opens with
// a pre-flight options panel so the user picks scope (mine vs team),
// period (today vs yesterday-today), tone (brief vs detailed), and
// output format (markdown vs plain) BEFORE spending an LLM call. The
// chosen options persist across opens (localStorage) so the next time
// you "summon" a standup it remembers your style.
//
// After generation, options stay visible so the user can regenerate
// with different choices without closing + reopening.

const STORAGE_KEY = 'tickd:standup-options'

const DEFAULTS = {
  scope: 'mine',     // 'mine' | 'team'
  period: 'today',   // 'today' | 'yesterday-today'
  tone: 'brief',     // 'brief' | 'detailed'
  format: 'markdown', // 'markdown' | 'plain'
}

function loadSavedOptions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

export default function StandupModal({ open, onClose }) {
  const { workspace } = useAuth()
  const showToast = useToast()
  const [options, setOptions] = useState(loadSavedOptions)
  const [markdown, setMarkdown] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  // Reset transient state when the modal re-opens, but keep options
  // (they were loaded from localStorage on mount).
  useEffect(() => {
    if (!open) {
      setMarkdown('')
      setLoading(false)
      setError(null)
      setCopied(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function updateOption(patch) {
    setOptions((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // localStorage disabled — silently skip
      }
      return next
    })
  }

  async function runGenerate() {
    setLoading(true)
    setError(null)
    setCopied(false)
    try {
      const res = await generateStandup(workspace?.id, options)
      setMarkdown(res.markdown || '')
    } catch (err) {
      setError(err.message ?? 'Could not generate standup')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      showToast('Standup copied — paste in Slack / WhatsApp / email.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('Could not copy. Select and copy manually.', { type: 'error' })
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-2 sm:p-10 overflow-y-auto tickd-modal-backdrop"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] tickd-modal-content">
        <ModalHeader
          title="Today's standup"
          icon="ti-clipboard-text"
          onClose={onClose}
        />

        {/* Pre-flight options. Sit above the output so the user picks
            their lens BEFORE the LLM call — saves a generate-then-tweak
            loop. Choices persist to localStorage so the same prefs are
            ready next time. */}
        <div className="px-4 py-3 border-b border-border bg-surface-2/40 space-y-2.5">
          <OptionRow label="Scope">
            <PillToggle
              value={options.scope}
              onChange={(v) => updateOption({ scope: v })}
              options={[
                { value: 'mine', label: 'My day', icon: 'ti-user' },
                { value: 'team', label: 'Whole team', icon: 'ti-users' },
              ]}
            />
          </OptionRow>
          <OptionRow label="Period">
            <PillToggle
              value={options.period}
              onChange={(v) => updateOption({ period: v })}
              options={[
                { value: 'today', label: 'Today', icon: 'ti-calendar' },
                {
                  value: 'yesterday-today',
                  label: 'Yesterday + today',
                  icon: 'ti-calendar-week',
                },
              ]}
            />
          </OptionRow>
          <OptionRow label="Tone">
            <PillToggle
              value={options.tone}
              onChange={(v) => updateOption({ tone: v })}
              options={[
                { value: 'brief', label: 'Brief', icon: 'ti-line-height' },
                { value: 'detailed', label: 'Detailed', icon: 'ti-list-details' },
              ]}
            />
          </OptionRow>
          <OptionRow label="Format">
            <PillToggle
              value={options.format}
              onChange={(v) => updateOption({ format: v })}
              options={[
                { value: 'markdown', label: 'Markdown', icon: 'ti-markdown' },
                { value: 'plain', label: 'Plain text', icon: 'ti-align-left' },
              ]}
            />
          </OptionRow>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-10 text-center text-xs text-text-3 inline-flex items-center gap-2 justify-center w-full">
              <i className="ti ti-loader-2 animate-spin text-base" />
              Composing your standup…
            </div>
          ) : error ? (
            <div className="text-xs text-danger-text p-3 rounded border border-danger-bg bg-danger-bg/30">
              {error}
            </div>
          ) : markdown ? (
            <pre className="text-xs leading-relaxed bg-surface-2 rounded p-3 whitespace-pre-wrap font-mono">
              {markdown}
            </pre>
          ) : (
            <div className="text-xs text-text-3 text-center py-8">
              Pick your options above, then hit{' '}
              <span className="font-medium text-text-2">Generate</span>.
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-surface-2 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface"
          >
            Close
          </button>
          <button
            onClick={runGenerate}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded font-medium inline-flex items-center gap-1.5 disabled:opacity-50 border border-border hover:bg-surface"
            title={markdown ? 'Regenerate with current options' : 'Generate'}
          >
            <i
              className={`ti ${
                loading
                  ? 'ti-loader-2 animate-spin'
                  : markdown
                    ? 'ti-refresh'
                    : 'ti-sparkles'
              } text-sm`}
            />
            {markdown ? 'Regenerate' : 'Generate'}
          </button>
          <button
            onClick={handleCopy}
            disabled={loading || !markdown}
            className={`text-xs px-3 py-1.5 rounded font-medium inline-flex items-center gap-1.5 disabled:opacity-50 ${
              copied
                ? 'bg-success text-white'
                : 'bg-info text-white hover:opacity-90'
            }`}
          >
            <i className={`ti ${copied ? 'ti-check' : 'ti-clipboard'} text-sm`} />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Single row of the options panel — left-aligned label + right-aligned
// pill-toggle group. Stacks under sm so the labels don't get cramped.
function OptionRow({ label, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
      <div className="text-[11px] uppercase tracking-wider text-text-3 font-medium sm:w-20 flex-shrink-0">
        {label}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

// 2-up segmented control. The active option uses the info-tinted style
// already used elsewhere (filter chips, etc) for consistency.
function PillToggle({ value, onChange, options }) {
  return (
    <div className="inline-flex p-0.5 bg-surface-2 rounded-md border border-border">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`text-[11px] sm:text-xs px-2.5 py-1 rounded inline-flex items-center gap-1 transition-colors ${
              active
                ? 'bg-surface text-text font-medium shadow-sm'
                : 'text-text-2 hover:text-text'
            }`}
          >
            <i className={`ti ${opt.icon} text-sm`} />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
