import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { generateStandup } from '../api/standup'
import { useToast } from './Toast'
import ModalHeader from './ModalHeader'

// "Generate today's standup" modal. Auto-fires the generation when
// it opens; user can copy the markdown straight to their clipboard
// or close and try again.
export default function StandupModal({ open, onClose }) {
  const { workspace } = useAuth()
  const showToast = useToast()
  const [markdown, setMarkdown] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) {
      setMarkdown('')
      setLoading(false)
      setError(null)
      setCopied(false)
      return
    }
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const res = await generateStandup(workspace?.id)
        if (cancelled) return
        setMarkdown(res.markdown || '')
      } catch (err) {
        if (cancelled) return
        setError(err.message ?? 'Could not generate standup')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [open, workspace?.id])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

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

        <div className="px-5 py-3 text-xs text-text-2 border-b border-border">
          AI-summarised from your owned and watched tasks. Copy-paste straight
          into your team chat.
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
          ) : (
            <pre className="text-xs leading-relaxed bg-surface-2 rounded p-3 whitespace-pre-wrap font-mono">
              {markdown || '_No activity today._'}
            </pre>
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
            onClick={handleCopy}
            disabled={loading || !markdown}
            className={`text-xs px-3 py-1.5 rounded font-medium inline-flex items-center gap-1.5 disabled:opacity-50 ${
              copied
                ? 'bg-success text-white'
                : 'bg-info text-white hover:opacity-90'
            }`}
          >
            <i className={`ti ${copied ? 'ti-check' : 'ti-clipboard'} text-sm`} />
            {copied ? 'Copied!' : 'Copy markdown'}
          </button>
        </div>
      </div>
    </div>
  )
}
