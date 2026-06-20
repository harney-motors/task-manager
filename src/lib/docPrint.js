// Print/PDF export for docs. Renders the doc's markdown body into a
// clean HTML document inside a hidden iframe, then triggers the
// browser's native print dialog. The user gets:
//   - macOS / Windows / Linux desktop: "Save as PDF" option in the
//     print dialog
//   - mobile Safari / Chrome: "Share → Save to Files (PDF)" via the
//     OS share sheet on the print preview
//
// No new dependencies — the markdown renderer is a small inline
// converter covering the common cases (headings, bold/italic/code,
// lists, blockquotes, links, hr, paragraphs). For richer markdown
// (tables, footnotes) we'd swap in a real library, but our docs
// stick to the basics.

// ---- Markdown → HTML ----------------------------------------------

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

function renderInline(text) {
  // Order matters: escape first, then apply patterns to already-safe
  // text. Code spans are processed earliest so their content isn't
  // mistaken for bold/italic markers.
  let s = escapeHtml(text)
  // `code` — `[^`]+`
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  // **bold**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // *italic* / _italic_  (avoid eating ** by requiring single * with
  // no adjacent *)
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
  // [text](url) — keep target=_blank for safety even though print
  // doesn't follow links; users may save the HTML.
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label, href) =>
      `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${label}</a>`,
  )
  return s
}

// Block-level pass. Iterates line-by-line and groups into block
// elements: headings, lists, blockquotes, hr, code blocks, paragraphs.
function renderBlocks(md) {
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0
  let inCodeBlock = false
  let codeBuf = []
  let paraBuf = []

  function flushPara() {
    if (paraBuf.length === 0) return
    const text = paraBuf.join(' ').trim()
    if (text) out.push(`<p>${renderInline(text)}</p>`)
    paraBuf = []
  }
  function flushCode() {
    if (!inCodeBlock) return
    out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
    codeBuf = []
    inCodeBlock = false
  }

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code blocks ```
    if (/^```/.test(line)) {
      if (inCodeBlock) {
        flushCode()
      } else {
        flushPara()
        inCodeBlock = true
      }
      i++
      continue
    }
    if (inCodeBlock) {
      codeBuf.push(line)
      i++
      continue
    }

    // Blank line → paragraph break
    if (/^\s*$/.test(line)) {
      flushPara()
      i++
      continue
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushPara()
      const level = heading[1].length
      out.push(
        `<h${level}>${renderInline(heading[2].trim())}</h${level}>`,
      )
      i++
      continue
    }

    // Horizontal rule
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      flushPara()
      out.push('<hr />')
      i++
      continue
    }

    // Blockquote (consecutive `>`-prefixed lines)
    if (/^\s*>\s?/.test(line)) {
      flushPara()
      const buf = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      out.push(`<blockquote>${renderInline(buf.join(' '))}</blockquote>`)
      continue
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara()
      const items = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i++
      }
      out.push(
        `<ul>${items.map((t) => `<li>${renderInline(t)}</li>`).join('')}</ul>`,
      )
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara()
      const items = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      out.push(
        `<ol>${items.map((t) => `<li>${renderInline(t)}</li>`).join('')}</ol>`,
      )
      continue
    }

    // Plain text — accumulate into the current paragraph buffer
    paraBuf.push(line.trim())
    i++
  }
  flushPara()
  flushCode()
  return out.join('\n')
}

// ---- Printable HTML wrapper ---------------------------------------

// Builds the standalone HTML document that lives in the print iframe.
// Print stylesheet uses serif body for readability (newspapers /
// books have done this for centuries; doesn't fight the markdown
// flow) and tight headings. Backgrounds are stripped so a colour
// printer doesn't waste ink.
function buildPrintHtml(doc, workspaceName) {
  const titleHtml = escapeHtml(doc.title?.trim() || 'Untitled')
  const bodyHtml = renderBlocks(doc.body ?? '')
  const updatedHtml = doc.updated_at
    ? `Last updated ${escapeHtml(new Date(doc.updated_at).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' }))}`
    : ''
  const wsHtml = workspaceName ? escapeHtml(workspaceName) : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${titleHtml}</title>
  <style>
    @page { margin: 18mm 16mm; }
    html, body { background: #fff; color: #1a1a1a; }
    body {
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.55;
      margin: 0;
      padding: 24px;
      max-width: 760px;
    }
    header {
      border-bottom: 1px solid #d1d5db;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    h1.doc-title {
      font-size: 22pt;
      font-weight: 700;
      margin: 0 0 6px 0;
      line-height: 1.2;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      letter-spacing: -0.02em;
    }
    header .meta {
      font-size: 9.5pt;
      color: #6b7280;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      letter-spacing: -0.01em;
      margin: 1.4em 0 0.4em 0;
      line-height: 1.25;
      page-break-after: avoid;
    }
    h1 { font-size: 18pt; }
    h2 { font-size: 14.5pt; }
    h3 { font-size: 12.5pt; }
    p { margin: 0.55em 0; }
    ul, ol { padding-left: 1.3em; margin: 0.55em 0; }
    li { margin: 0.15em 0; }
    blockquote {
      border-left: 3px solid #d1d5db;
      padding: 4px 12px;
      margin: 0.8em 0;
      color: #4b5563;
      font-style: italic;
      page-break-inside: avoid;
    }
    code {
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.92em;
      background: #f3f4f6;
      padding: 1px 4px;
      border-radius: 3px;
    }
    pre {
      background: #f3f4f6;
      padding: 10px 12px;
      border-radius: 4px;
      overflow-x: auto;
      page-break-inside: avoid;
    }
    pre code { background: transparent; padding: 0; font-size: 10pt; }
    hr {
      border: 0;
      border-top: 1px solid #d1d5db;
      margin: 1.4em 0;
    }
    a {
      color: #185fa5;
      text-decoration: underline;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <header>
    <h1 class="doc-title">${titleHtml}</h1>
    <div class="meta">
      ${[wsHtml, updatedHtml].filter(Boolean).join(' &middot; ')}
    </div>
  </header>
  ${bodyHtml || '<p style="color:#9ca3af;font-style:italic;">(empty document)</p>'}
</body>
</html>`
}

// Open the printable doc in a hidden iframe and trigger print.
// Iframe avoids popup-blocker quirks + leaves the user's current
// view untouched. We clean up the iframe ~500ms after print dialog
// closes (give the browser time to start the job).
export function printDoc({ doc, workspaceName }) {
  if (!doc) return
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const html = buildPrintHtml(doc, workspaceName)

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  const idoc = iframe.contentDocument || iframe.contentWindow?.document
  if (!idoc) {
    document.body.removeChild(iframe)
    // Fallback: open in a new tab so the user can still print.
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
      w.focus()
      w.print()
    }
    return
  }
  idoc.open()
  idoc.write(html)
  idoc.close()

  // Wait for the iframe to settle before printing — gives fonts +
  // layout a chance to finish.
  const trigger = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch (err) {
      console.warn('[doc-print] print() failed', err)
    }
    // Some browsers fire focus events after print closes; give a
    // generous cleanup delay so we don't yank the iframe mid-print.
    setTimeout(() => {
      try {
        document.body.removeChild(iframe)
      } catch {
        /* already removed */
      }
    }, 1500)
  }
  if (idoc.readyState === 'complete') {
    setTimeout(trigger, 80)
  } else {
    iframe.onload = () => setTimeout(trigger, 80)
  }
}
