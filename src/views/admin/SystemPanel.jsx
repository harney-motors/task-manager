import { useState } from 'react'
import { useAdminSystemStats } from '../../lib/queries'
import { renderMentionEmail } from '../../lib/mentionEmailTemplate'

function Stat({ label, value, icon }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-text-2 text-xs mb-2">
        <i className={`ti ${icon} text-sm`} />
        <span>{label}</span>
      </div>
      <div className="text-2xl font-medium tracking-tight">{value ?? '—'}</div>
    </div>
  )
}

export default function SystemPanel() {
  const { data: stats, isLoading } = useAdminSystemStats()

  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-text-3">Loading…</div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <Stat label="Auth users" value={stats?.total_users} icon="ti-users" />
        <Stat label="Superadmins" value={stats?.total_superadmins} icon="ti-shield-lock" />
        <Stat label="Workspaces" value={stats?.total_workspaces} icon="ti-building" />
        <Stat label="Tasks" value={stats?.total_tasks} icon="ti-checkbox" />
        <Stat label="People records" value={stats?.total_people} icon="ti-user" />
        <Stat label="Activity entries" value={stats?.total_activity} icon="ti-history" />
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 text-xs text-text-2 space-y-2">
        <div className="text-sm font-medium text-text">Notes</div>
        <p>
          These are raw counts. They include archived/deactivated records.
        </p>
        <p>
          Anthropic API usage (cost of meeting extractions + NL queries) and
          Supabase storage usage aren&rsquo;t aggregated here yet — pull those
          from the Anthropic and Supabase dashboards directly.
        </p>
      </div>

      <MentionEmailPreview />
    </div>
  )
}

// Admin-only preview of the mention-email template. Lets superadmins
// confirm what their users see before any SMTP config goes live.
// Read-only — toggling opt-out is a per-user concern surfaced in
// each user's Settings → Profile panel.
function MentionEmailPreview() {
  const [brand, setBrand] = useState('#185FA5')
  const sample = renderMentionEmail({
    recipientName: 'Sasha',
    mentionerName: 'Asbert',
    taskTitle: 'Order brake pads for the Lexus run',
    commentExcerpt:
      "Heads-up @Sasha — we'll need the part number from last Friday's invoice. Can you pull it in the morning?",
    workspaceName: 'Harney Motors',
    workspaceBrandColor: brand,
    taskUrl: '#',
    appUrl: '#',
    unsubscribeUrl: '#',
  })
  return (
    <div className="mt-5 bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Mention email — preview</div>
          <div className="text-[11px] text-text-3 mt-0.5">
            What users see when they&rsquo;re @mentioned in a comment.
            Default-on; opt-out lives in Settings → Profile.
          </div>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer text-[11px] text-text-2">
          <span>Test brand colour</span>
          <input
            type="color"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="w-8 h-8 rounded-md border border-border cursor-pointer bg-transparent"
          />
          <span className="font-mono text-text-3">{brand}</span>
        </label>
      </div>
      <div className="px-5 py-2 text-[11px] text-text-3 bg-surface-2 border-b border-border">
        <span className="font-medium text-text-2">Subject:</span>{' '}
        {sample.subject}
      </div>
      <iframe
        title="Mention email admin preview"
        sandbox=""
        srcDoc={sample.html}
        className="w-full h-[460px] bg-white"
      />
    </div>
  )
}
