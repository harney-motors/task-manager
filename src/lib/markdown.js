// Shared markdown → HTML renderer used by:
//   - lib/docPrint.js (printable docs)
//   - views/HelpView.jsx (in-app help articles)
//
// Hand-rolled to avoid pulling a ~30 KB markdown library for the small
// subset of markdown the app actually uses. Covered: headings, bold,
// italic, code spans + fenced code, blockquotes, ordered + unordered
// lists, horizontal rules, links, images, paragraphs.
//
// NOT covered (we'll swap in a real library if any of these become
// needed): tables, footnotes, nested lists, task-list checkboxes,
// inline HTML.

export const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

function renderInline(text) {
  // Escape FIRST so any user-supplied < or & doesn't get treated as
  // HTML. Apply markdown patterns afterward on already-safe text.
  let s = escapeHtml(text)

  // Images BEFORE links so the link regex doesn't eat ![alt](url).
  // Renders an inline <img>; styling lives in the consumer's CSS.
  s = s.replace(
    /!\[([^\]]*)\]\(([^)\s]+)\)/g,
    (_m, alt, src) =>
      `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />`,
  )

  // Inline code — process before bold/italic so backticked stars
  // don't get formatted.
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Bold + italic. Bold first (longer marker) so `**x**` doesn't
  // partial-match as italic.
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')

  // Links — [text](url). Keep target=_blank + rel for safety.
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label, href) =>
      `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  )
  return s
}

// Block-level pass. Reads lines, groups into block elements.
export function renderMarkdown(md) {
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0
  let inCodeBlock = false
  let codeLang = ''
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
    const lang = codeLang ? ` data-lang="${escapeHtml(codeLang)}"` : ''
    out.push(`<pre${lang}><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
    codeBuf = []
    codeLang = ''
    inCodeBlock = false
  }

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block: ``` or ```js
    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      if (inCodeBlock) {
        flushCode()
      } else {
        flushPara()
        inCodeBlock = true
        codeLang = fence[1] || ''
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

    // Heading: # h1 → ###### h6
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushPara()
      const level = heading[1].length
      const inner = renderInline(heading[2].trim())
      // Slug for direct anchor links in the help nav.
      const slug = heading[2]
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
      out.push(`<h${level} id="${slug}">${inner}</h${level}>`)
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

    // Blockquote — consecutive lines starting with `>`. Also handles
    // GFM-style admonitions: `> [!NOTE]` / `> [!TIP]` / `> [!WARNING]`
    // by tagging the blockquote with a data-attr the consumer can style.
    if (/^\s*>\s?/.test(line)) {
      flushPara()
      const buf = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      // Strip a leading [!TYPE] tag if present
      const first = buf[0] ?? ''
      const adm = first.match(/^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*$/i)
      let attr = ''
      let rest = buf
      if (adm) {
        attr = ` data-admonition="${adm[1].toLowerCase()}"`
        rest = buf.slice(1)
      }
      const text = rest.join(' ').trim()
      out.push(
        `<blockquote${attr}>${renderInline(text)}</blockquote>`,
      )
      continue
    }

    // Unordered list — consecutive `-`, `*`, or `+` lines
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

    // Ordered list — consecutive `N.` lines
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

    // Plain text — accumulate into current paragraph
    paraBuf.push(line.trim())
    i++
  }
  flushPara()
  flushCode()
  return out.join('\n')
}
