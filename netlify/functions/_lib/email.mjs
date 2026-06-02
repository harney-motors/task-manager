// Shared email transport for every Netlify function that sends mail.
//
// Two providers supported:
//   1. Resend (preferred)  — RESEND_API_KEY set → HTTPS API, fastest
//      delivery + analytics, idempotency keys, modern auth.
//   2. SMTP (fallback)     — SMTP_HOST/USER/PASS set → nodemailer.
//      Kept around so existing Gmail / Mailgun / etc setups keep
//      working during the transition.
//
// The shared FROM address is set via EMAIL_FROM (preferred) or
// SMTP_FROM (legacy). Use a friendly form like:
//   EMAIL_FROM = "Tickd <notifications@yourdomain.com>"
//
// Returns { provider: 'resend' | 'smtp', id: '<message id>' } on
// success. Throws with a useful error message on failure.

import { Resend } from 'resend'
import nodemailer from 'nodemailer'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const FROM = process.env.EMAIL_FROM || process.env.SMTP_FROM

// Lazy-init the clients so importing this module doesn't fail when
// env vars are partially set.
let resendClient = null
function getResend() {
  if (!RESEND_API_KEY) return null
  if (!resendClient) resendClient = new Resend(RESEND_API_KEY)
  return resendClient
}

let smtpTransporter = null
function getSmtpTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  }
  return smtpTransporter
}

export function emailProvider() {
  if (RESEND_API_KEY) return 'resend'
  if (SMTP_HOST) return 'smtp'
  return null
}

// `to` accepts a single address or an array.
// `tags` is Resend-only; ignored by the SMTP path. Useful for
// segmenting deliverability dashboards by purpose (mention, digest).
export async function sendEmail({ to, subject, html, text, tags }) {
  if (!FROM) {
    throw new Error(
      'No sender address configured. Set EMAIL_FROM (e.g. "Tickd <notifications@yourdomain.com>")',
    )
  }
  const resend = getResend()
  if (resend) {
    const payload = {
      from: FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }
    if (tags) payload.tags = tags
    const { data, error } = await resend.emails.send(payload)
    if (error) {
      // Resend error shape: { name, message, statusCode }
      const msg =
        error.message ||
        (typeof error === 'string' ? error : JSON.stringify(error))
      throw new Error(`Resend: ${msg}`)
    }
    return { provider: 'resend', id: data?.id ?? null }
  }
  const transporter = getSmtpTransporter()
  if (!transporter) {
    throw new Error(
      'No email provider configured. Set RESEND_API_KEY (preferred) or SMTP_HOST/USER/PASS.',
    )
  }
  const info = await transporter.sendMail({
    from: FROM,
    to,
    subject,
    html,
    text,
  })
  return { provider: 'smtp', id: info.messageId ?? null }
}
