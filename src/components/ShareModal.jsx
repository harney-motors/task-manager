import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { formatWhatsAppMessage } from '../lib/share'
import { logActivity } from '../api/activity'

export default function ShareModal({ pic, tasks, onClose }) {
  const { workspace, user } = useAuth()
  const [copied, setCopied] = useState(false)
  const message = formatWhatsAppMessage(pic, tasks)

  useEffect(() => {
    function handler(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      logActivity({
        workspaceId: workspace.id,
        taskId: null,
        actorId: user?.id,
        action: 'share.copied',
        payload: {
          pic_id: pic.id,
          pic_name: pic.name,
          task_count: tasks.filter((t) => t.status !== 'Done').length,
        },
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.warn('clipboard write failed', err)
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/40 z-50 flex items-start sm:items-center justify-center p-2 sm:p-6 overflow-y-auto"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-sm font-medium">Share to my WhatsApp</div>
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text p-1 rounded hover:bg-surface-2"
            aria-label="Close"
          >
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        <div className="px-4 py-3 text-xs text-text-2">
          Copy this and paste it into your WhatsApp chat with{' '}
          <span className="font-medium text-text">{pic.name.split(' ')[0]}</span>
          .
        </div>

        {/* WhatsApp-themed preview */}
        <div className="mx-5 mb-3 rounded-xl p-3 bg-[#ECE5DD]">
          <div className="flex items-center gap-2 pb-2 mb-2 border-b border-black/10">
            <div className="w-7 h-7 rounded-full bg-[#25D366] text-white text-xs flex items-center justify-center font-medium">
              L
            </div>
            <div className="text-xs font-medium text-[#075E54]">Loop · Tasks</div>
          </div>
          <div className="bg-white rounded-xl p-3 text-[12px] leading-relaxed text-[#1f2c34] whitespace-pre-wrap font-mono">
            {message}
          </div>
          <div className="text-[10px] text-[#667781] text-right mt-1">
            Now ✓✓
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 bg-surface-2 border-t border-border">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            className={`text-xs px-3 py-1.5 rounded font-medium inline-flex items-center gap-1.5 transition-colors ${
              copied
                ? 'bg-success text-white'
                : 'bg-success text-white hover:opacity-90'
            }`}
          >
            <i className={`ti ${copied ? 'ti-check' : 'ti-clipboard'} text-sm`} />
            {copied ? 'Copied!' : 'Copy message'}
          </button>
        </div>
      </div>
    </div>
  )
}
