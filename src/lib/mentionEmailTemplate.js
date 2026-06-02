// Mention-email HTML template — shared between the send-side Netlify
// function (notify-mention.mjs) and the preview surfaces in Settings
// + Super admin. ESM exports so both client and Node runtimes import
// the same source of truth.
//
// The template is intentionally inline-styled (no <style> blocks).
// Gmail strips <style> in many cases; inlining gives every major
// client the same render. Logo is a Unicode mark, no asset hosting.

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

// Render the HTML body. Inputs:
//   recipientName     — first name of the mentioned user
//   mentionerName     — first name (or full) of the comment author
//   taskTitle         — the task the comment is on
//   commentExcerpt    — the comment body, untrusted
//   workspaceName     — for the header tag
//   workspaceBrandColor — optional hex; tints buttons + accents
//   taskUrl           — deep-link into the app, e.g. https://tickd.app/?task=<id>
//   appUrl            — base app URL for the brand link
//   unsubscribeUrl    — link to Settings → Profile → email toggle
//
// Returns { subject, html, text } so the function can attach all three.
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
  const safeRecipient = escapeHtml(firstName(recipientName) || 'there')
  const safeMentioner = escapeHtml(mentionerName || 'A teammate')
  const safeTask = escapeHtml(truncate(taskTitle || '(untitled task)', 120))
  const safeComment = escapeHtml(truncate(commentExcerpt || '', 320))
  const safeWorkspace = escapeHtml(workspaceName || 'your workspace')
  const accent = sanitizeHex(workspaceBrandColor) || '#6366F1'
  const safeTaskUrl = sanitizeUrl(taskUrl) || '#'
  const safeAppUrl = sanitizeUrl(appUrl) || '#'
  const safeUnsubUrl = sanitizeUrl(unsubscribeUrl) || '#'

  const subject = `${mentionerName ? mentionerName + ' mentioned you' : 'You were mentioned'} on "${truncate(taskTitle || 'a task', 60)}"`

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1F2937;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4F4F5;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#FFFFFF;border-radius:14px;border:1px solid #E5E7EB;overflow:hidden;">
            <!-- Brand header -->
            <tr>
              <td style="padding:18px 24px;border-bottom:1px solid #F1F1F4;">
                <a href="${safeAppUrl}" style="color:#1F2937;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.2px;">
                  <span style="display:inline-block;vertical-align:middle;width:22px;height:22px;border-radius:6px;background:${accent};color:#FFFFFF;text-align:center;line-height:22px;font-size:12px;font-weight:700;margin-right:8px;">T</span>
                  Tickd
                </a>
                <span style="float:right;color:#6B7280;font-size:12px;line-height:22px;">${safeWorkspace}</span>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:24px 24px 8px 24px;">
                <p style="margin:0 0 6px 0;color:#6B7280;font-size:12px;letter-spacing:0.4px;text-transform:uppercase;font-weight:600;">
                  @ Mention
                </p>
                <h1 style="margin:0 0 4px 0;font-size:18px;font-weight:600;line-height:1.4;color:#1F2937;">
                  ${safeMentioner} mentioned you
                </h1>
                <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.5;">
                  on <strong style="color:#1F2937;font-weight:600;">${safeTask}</strong>
                </p>
              </td>
            </tr>

            <!-- Quote -->
            <tr>
              <td style="padding:16px 24px;">
                <div style="border-left:3px solid ${accent};background:#FAFAFB;padding:12px 14px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.55;color:#374151;white-space:pre-wrap;">${safeComment || '<span style="color:#9CA3AF;font-style:italic;">(empty comment)</span>'}</div>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td style="padding:8px 24px 24px 24px;">
                <a href="${safeTaskUrl}" style="display:inline-block;background:${accent};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">
                  Open task →
                </a>
                <span style="display:inline-block;margin-left:10px;font-size:12px;color:#6B7280;line-height:34px;vertical-align:middle;">
                  Hi ${safeRecipient}, they're waiting on your read.
                </span>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:14px 24px;border-top:1px solid #F1F1F4;background:#FAFAFB;font-size:11px;color:#9CA3AF;line-height:1.55;">
                You receive these because you were @mentioned in ${safeWorkspace}.
                <a href="${safeUnsubUrl}" style="color:#6B7280;text-decoration:underline;">Turn off mention emails</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text =
    `${mentionerName || 'Someone'} mentioned you on "${taskTitle || 'a task'}" in ${workspaceName || 'your workspace'}.\n\n` +
    `${commentExcerpt || ''}\n\n` +
    `Open it: ${safeTaskUrl}\n\n` +
    `To stop these emails, visit ${safeUnsubUrl}`

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

function sanitizeUrl(u) {
  if (!u) return null
  const s = String(u).trim()
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  return null
}
