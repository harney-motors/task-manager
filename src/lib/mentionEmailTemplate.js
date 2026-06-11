// Mention-email HTML template — shared between the send-side Netlify
// function (notify-mention.mjs) and the preview surfaces in Settings
// + Super admin. ESM exports so both client and Node runtimes import
// the same source of truth.
//
// Visual model is the ClickUp mention email: one card with the task
// title + a divider + the mention block (avatar chip + body with
// inline @-mention pills), then a big centred CTA, a "or reply" hint,
// and a slim brand + unsubscribe footer.
//
// Inlined styles only — Gmail strips <style> blocks; inlining is the
// only way to get the same render across every major client.

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

// Replace `@FirstName` tokens in already-escaped text with inline
// indigo-pill spans. We accept any \w+ sequence after @ — the
// mentioner's intent is what matters, not whether we recognise the
// name on this side.
function highlightMentions(escapedText, accentBg, accentText) {
  if (!escapedText) return ''
  return escapedText.replace(
    /(^|\s)@([A-Za-z][\w-]*)/g,
    (_match, lead, name) =>
      `${lead}<span style="display:inline-block;background:${accentBg};color:${accentText};font-weight:600;padding:1px 6px;border-radius:4px;">@${name}</span>`,
  )
}

// Two-letter initials from a full name. "Niffell Bique" → "NB",
// "Asbert" → "AS", empty → "··".
function initials(name) {
  if (!name) return '··'
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '··'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// Render the @mention email. Returns { subject, html, text }.
//
//   recipientName       — first name of the mentioned user (header line)
//   mentionerName       — full name of the comment author (avatar + line)
//   taskTitle           — the task the comment is on
//   commentExcerpt      — comment body (untrusted; escaped + mention-highlighted)
//   workspaceName       — shown under the task title as breadcrumb
//   workspaceBrandColor — optional hex; tints CTA, avatar, mention pills
//   taskUrl             — deep-link into the app (e.g. https://tickd.app/?task=<id>&focus=comments)
//   appUrl              — base app URL for the brand link
//   unsubscribeUrl      — link to Settings → Profile → email toggle
export function renderMentionEmail({
  recipientName,
  mentionerName,
  taskTitle,
  commentExcerpt,
  workspaceName,
  workspaceBrandColor,
  taskUrl,
  appUrl,
  unsubscribeUrl,
}) {
  const accent = sanitizeHex(workspaceBrandColor) || '#185FA5'
  const accentTint = withAlpha(accent, 0.12)
  const safeMentioner = escapeHtml(mentionerName || 'A teammate')
  const commentHtml = highlightMentions(
    escapeHtml(truncate(commentExcerpt || '', 600)),
    accentTint,
    accent,
  )
  const subject = `${mentionerName || 'Someone'} mentioned you on "${truncate(taskTitle || 'a task', 60)}"`
  const actorBlockHtml = `
    <div style="font-size:14px;line-height:1.5;color:#1F2937;">
      <span style="color:#374151;">${safeMentioner}</span>
      <span style="font-weight:600;color:#1F2937;"> mentioned you</span>
    </div>
    <div style="font-size:14px;line-height:1.6;color:#374151;margin-top:14px;padding-left:40px;white-space:pre-wrap;">${commentHtml || '<span style="color:#9CA3AF;font-style:italic;">(empty comment)</span>'}</div>
  `
  return renderEnvelope({
    subject,
    taskTitle,
    workspaceName,
    workspaceBrandColor,
    taskUrl,
    appUrl,
    unsubscribeUrl,
    recipientName,
    actorName: mentionerName,
    actorBlockHtml,
    ctaLabel: 'View comment',
    helperLine: 'or reply to add a comment',
    plainBody:
      `${mentionerName || 'Someone'} mentioned you on "${taskTitle || 'a task'}"\n` +
      `(${workspaceName || 'workspace'})\n\n` +
      `${commentExcerpt || ''}\n`,
  })
}

// Render the reply email. Sent when teammate B replies to A's
// top-level comment. A gets pinged so they know their thread moved.
//
//   recipientName       — first name of the original commenter
//   replierName         — full name of the person who replied
//   taskTitle           — task the thread sits on
//   replyExcerpt        — body of the reply
//   originalExcerpt     — body of the comment being replied to (for context)
export function renderReplyEmail({
  recipientName,
  replierName,
  taskTitle,
  replyExcerpt,
  originalExcerpt,
  workspaceName,
  workspaceBrandColor,
  taskUrl,
  appUrl,
  unsubscribeUrl,
}) {
  const accent = sanitizeHex(workspaceBrandColor) || '#185FA5'
  const accentTint = withAlpha(accent, 0.12)
  const safeReplier = escapeHtml(replierName || 'A teammate')
  const replyHtml = highlightMentions(
    escapeHtml(truncate(replyExcerpt || '', 600)),
    accentTint,
    accent,
  )
  const originalHtml = escapeHtml(truncate(originalExcerpt || '', 200))
  const subject = `${replierName || 'Someone'} replied to your comment on "${truncate(taskTitle || 'a task', 60)}"`
  const actorBlockHtml = `
    <div style="font-size:14px;line-height:1.5;color:#1F2937;">
      <span style="color:#374151;">${safeReplier}</span>
      <span style="font-weight:600;color:#1F2937;"> replied to your comment</span>
    </div>
    ${
      originalHtml
        ? `<div style="font-size:12px;line-height:1.5;color:#9CA3AF;margin-top:14px;padding-left:40px;border-left:3px solid #E5E7EB;padding-left:10px;margin-left:40px;font-style:italic;">"${originalHtml}"</div>`
        : ''
    }
    <div style="font-size:14px;line-height:1.6;color:#374151;margin-top:14px;padding-left:40px;white-space:pre-wrap;">${replyHtml || '<span style="color:#9CA3AF;font-style:italic;">(empty reply)</span>'}</div>
  `
  return renderEnvelope({
    subject,
    taskTitle,
    workspaceName,
    workspaceBrandColor,
    taskUrl,
    appUrl,
    unsubscribeUrl,
    recipientName,
    actorName: replierName,
    actorBlockHtml,
    ctaLabel: 'View reply',
    helperLine: 'or reply to continue the thread',
    plainBody:
      `${replierName || 'Someone'} replied to your comment on "${taskTitle || 'a task'}"\n` +
      `(${workspaceName || 'workspace'})\n\n` +
      (originalExcerpt ? `Your comment: "${originalExcerpt}"\n\n` : '') +
      `Reply: ${replyExcerpt || ''}\n`,
  })
}

// Render the reaction email. Sent when teammate B adds an emoji
// reaction to A's comment.
//
//   reactorName         — full name of the person who reacted
//   emoji               — the emoji character itself (e.g. '👍')
//   commentExcerpt      — body of the comment being reacted to
export function renderReactionEmail({
  recipientName,
  reactorName,
  emoji,
  taskTitle,
  commentExcerpt,
  workspaceName,
  workspaceBrandColor,
  taskUrl,
  appUrl,
  unsubscribeUrl,
}) {
  const accent = sanitizeHex(workspaceBrandColor) || '#185FA5'
  const accentTint = withAlpha(accent, 0.12)
  const safeReactor = escapeHtml(reactorName || 'A teammate')
  const safeEmoji = escapeHtml(emoji || '·')
  const commentHtml = highlightMentions(
    escapeHtml(truncate(commentExcerpt || '', 400)),
    accentTint,
    accent,
  )
  const subject = `${reactorName || 'Someone'} reacted ${safeEmoji} on "${truncate(taskTitle || 'a task', 60)}"`
  const actorBlockHtml = `
    <div style="font-size:14px;line-height:1.5;color:#1F2937;">
      <span style="color:#374151;">${safeReactor}</span>
      <span style="font-weight:600;color:#1F2937;"> reacted</span>
      <span style="display:inline-block;font-size:18px;line-height:1;vertical-align:middle;margin-left:4px;">${safeEmoji}</span>
      <span style="font-weight:600;color:#1F2937;"> to your comment</span>
    </div>
    <div style="font-size:14px;line-height:1.6;color:#374151;margin-top:14px;padding-left:40px;white-space:pre-wrap;">${commentHtml || '<span style="color:#9CA3AF;font-style:italic;">(empty comment)</span>'}</div>
  `
  return renderEnvelope({
    subject,
    taskTitle,
    workspaceName,
    workspaceBrandColor,
    taskUrl,
    appUrl,
    unsubscribeUrl,
    recipientName,
    actorName: reactorName,
    actorBlockHtml,
    ctaLabel: 'View comment',
    helperLine: 'or react / reply back',
    plainBody:
      `${reactorName || 'Someone'} reacted ${emoji || ''} to your comment on "${taskTitle || 'a task'}"\n` +
      `(${workspaceName || 'workspace'})\n\n` +
      `Your comment: "${commentExcerpt || ''}"\n`,
  })
}

// Shared envelope: card header + actor block + CTA + footer. All three
// comment emails share the same chrome so brand voice + deliverability
// behavior stay consistent.
function renderEnvelope({
  subject,
  taskTitle,
  workspaceName,
  workspaceBrandColor,
  taskUrl,
  appUrl,
  unsubscribeUrl,
  recipientName,
  actorName,
  actorBlockHtml,
  ctaLabel,
  helperLine,
  plainBody,
}) {
  const accent = sanitizeHex(workspaceBrandColor) || '#185FA5'
  const accentTint = withAlpha(accent, 0.12)
  const safeTask = escapeHtml(truncate(taskTitle || '(untitled task)', 140))
  const safeWorkspace = escapeHtml(workspaceName || 'Workspace')
  const safeRecipient = escapeHtml(firstName(recipientName) || 'there')
  const avatarInitials = escapeHtml(initials(actorName))
  // Defensive URL handling: if the task URL doesn't pass sanitizeUrl
  // (most often because the calling function couldn't resolve a real
  // APP_URL), fall through to the app URL instead of '#'. A bare '#'
  // gets rewritten by Gmail into its internal "stay on this email"
  // anchor format (mail.google.com/#m_<id>_), which surprises users
  // who think the CTA was meant to leave the inbox. Better to land
  // them on the app's homepage than nowhere.
  const safeAppUrl = sanitizeUrl(appUrl) || 'https://localhost'
  const safeTaskUrl = sanitizeUrl(taskUrl) || safeAppUrl
  const safeUnsubUrl = sanitizeUrl(unsubscribeUrl) || safeAppUrl

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#FAFAFB;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter','Segoe UI',Roboto,sans-serif;color:#1F2937;-webkit-font-smoothing:antialiased;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAFAFB;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">

            <!-- Combined card: task header + mention block -->
            <tr>
              <td style="background:#FFFFFF;border-radius:12px;border:1px solid #E8E9EE;overflow:hidden;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <!-- Task header row -->
                  <tr>
                    <td style="padding:18px 20px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td valign="top" width="36" style="padding-right:12px;">
                            <span style="display:inline-block;width:28px;height:28px;border-radius:6px;background:${accentTint};color:${accent};text-align:center;line-height:28px;font-size:14px;font-weight:600;">✓</span>
                          </td>
                          <td valign="top">
                            <div style="font-size:16px;font-weight:600;line-height:1.35;color:#1F2937;">${safeTask}</div>
                            <div style="font-size:12px;line-height:1.5;color:#9CA3AF;margin-top:2px;">${safeWorkspace} / Tasks</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <!-- Divider -->
                  <tr>
                    <td style="border-top:1px solid #F1F2F5;"></td>
                  </tr>
                  <!-- Actor block — provided by the calling render function -->
                  <tr>
                    <td style="padding:18px 20px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td valign="top" width="36" style="padding-right:12px;">
                            <span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:${accent};color:#FFFFFF;text-align:center;line-height:28px;font-size:11px;font-weight:600;letter-spacing:0.5px;">${avatarInitials}</span>
                          </td>
                          <td valign="top">
                            ${actorBlockHtml}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Spacer -->
            <tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>

            <!-- CTA -->
            <tr>
              <td align="center">
                <a href="${safeTaskUrl}" style="display:inline-block;background:${accent};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:14px 56px;border-radius:8px;letter-spacing:0.1px;">
                  ${escapeHtml(ctaLabel || 'View comment')}
                </a>
              </td>
            </tr>

            <!-- Helper line -->
            <tr>
              <td align="center" style="padding-top:14px;font-size:12px;color:#9CA3AF;">
                ${escapeHtml(helperLine || 'or reply to add a comment')}
              </td>
            </tr>

            <!-- Spacer -->
            <tr><td style="height:40px;line-height:40px;font-size:0;">&nbsp;</td></tr>

            <!-- Footer -->
            <tr>
              <td style="padding:0 4px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td valign="middle">
                      <a href="${safeAppUrl}" style="color:#6B7280;text-decoration:none;font-weight:600;font-size:13px;letter-spacing:0.1px;">
                        <span style="display:inline-block;vertical-align:middle;width:20px;height:20px;border-radius:5px;background:${accent};color:#FFFFFF;text-align:center;line-height:20px;font-size:11px;font-weight:700;margin-right:6px;">T</span>
                        <span style="vertical-align:middle;">Tickd</span>
                      </a>
                    </td>
                    <td valign="middle" align="right">
                      <a href="${safeUnsubUrl}" style="color:#9CA3AF;text-decoration:none;font-size:12px;">
                        Manage email notifications
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Copyright -->
            <tr>
              <td align="center" style="padding-top:24px;font-size:11px;color:#C2C5CC;">
                © ${new Date().getFullYear()} ${safeWorkspace} via Tickd · Hi ${safeRecipient}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text =
    `${plainBody || ''}\n` +
    `${ctaLabel || 'View comment'}: ${safeTaskUrl}\n` +
    `${helperLine || 'or reply to add a comment'}.\n\n` +
    `Manage email notifications: ${safeUnsubUrl}`

  return { subject, html, text }
}

function firstName(full) {
  if (!full) return ''
  return String(full).trim().split(/\s+/)[0]
}

function truncate(s, max) {
  if (!s) return ''
  const str = String(s)
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function sanitizeHex(h) {
  if (!h) return null
  const s = String(h).trim()
  if (/^#[0-9a-f]{6}$/i.test(s)) return s
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return (
      '#' +
      s
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('')
    )
  }
  return null
}

// Soft pastel from a hex by mixing toward white. Used for the inline
// @mention pill background — `rgba()` would also work but some older
// email clients render rgba inconsistently; hex is bulletproof.
function withAlpha(hex, alpha) {
  const clean = sanitizeHex(hex)
  if (!clean) return '#EEF2FF'
  const r = parseInt(clean.slice(1, 3), 16)
  const g = parseInt(clean.slice(3, 5), 16)
  const b = parseInt(clean.slice(5, 7), 16)
  // Mix toward white at (1 - alpha)
  const mix = (c) => Math.round(c * alpha + 255 * (1 - alpha))
  const toHex = (n) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
}

function sanitizeUrl(u) {
  if (!u) return null
  const s = String(u).trim()
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  return null
}
