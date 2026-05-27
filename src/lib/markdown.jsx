// Lightweight markdown → React renderer.
//
// Why custom (not `marked` or `react-markdown`): both ship ~30-60 KB
// to the bundle. v1 docs only need headings, paragraphs, lists, bold,
// italic, code, links — a couple hundred lines covers it. We can swap
// in a heavier library later if doc complexity grows.
//
// Safety: we DON'T support raw HTML. The renderer only emits known
// React elements, so user input can't inject scripts. The link href
// is sanitised to allow http(s) and mailto only.

import { Fragment } from 'react'

const HEADING_RE = /^(#{1,6})\s+(.+)$/
const HR_RE = /^---+$/
const ORDERED_LIST_RE = /^(\d+)\.\s+(.+)$/
const UNORDERED_LIST_RE = /^[-*+]\s+(.+)$/
const QUOTE_RE = /^>\s?(.*)$/
const CODE_FENCE_RE = /^```(.*)$/
const CHECKBOX_RE = /^\[([ x])\]\s+(.+)$/i

export function renderMarkdown(source) {
  if (!source) return null
  const lines = String(source).replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block ```lang ... ```
    const fence = line.match(CODE_FENCE_RE)
    if (fence) {
      const codeLines = []
      i++
      while (i < lines.length && !CODE_FENCE_RE.test(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      blocks.push({ type: 'code', value: codeLines.join('\n') })
      continue
    }

    // Headings
    const h = line.match(HEADING_RE)
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length, value: h[2] })
      i++
      continue
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // Blockquote
    if (QUOTE_RE.test(line)) {
      const quoteLines = []
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoteLines.push(lines[i].match(QUOTE_RE)[1])
        i++
      }
      blocks.push({ type: 'quote', value: quoteLines.join('\n') })
      continue
    }

    // Lists — collect contiguous items.
    if (UNORDERED_LIST_RE.test(line) || ORDERED_LIST_RE.test(line)) {
      const ordered = ORDERED_LIST_RE.test(line)
      const re = ordered ? ORDERED_LIST_RE : UNORDERED_LIST_RE
      const items = []
      while (i < lines.length && re.test(lines[i])) {
        const m = lines[i].match(re)
        const itemBody = ordered ? m[2] : m[1]
        items.push(itemBody)
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    // Blank lines just break paragraphs.
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph — collect non-blank lines.
    const paragraphLines = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !HEADING_RE.test(lines[i]) &&
      !HR_RE.test(lines[i]) &&
      !UNORDERED_LIST_RE.test(lines[i]) &&
      !ORDERED_LIST_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !CODE_FENCE_RE.test(lines[i])
    ) {
      paragraphLines.push(lines[i])
      i++
    }
    blocks.push({ type: 'paragraph', value: paragraphLines.join('\n') })
  }

  return blocks.map((b, idx) => renderBlock(b, idx))
}

function renderBlock(block, key) {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}`
      const classes = [
        'text-2xl font-semibold tracking-tight mt-6 mb-3',
        'text-xl font-semibold tracking-tight mt-5 mb-2',
        'text-lg font-semibold mt-4 mb-2',
        'text-base font-semibold mt-3 mb-1',
        'text-sm font-semibold mt-3 mb-1 text-text-2',
        'text-xs font-semibold uppercase tracking-wider mt-2 mb-1 text-text-3',
      ][block.level - 1]
      return (
        <Tag key={key} className={classes}>
          {renderInline(block.value)}
        </Tag>
      )
    }
    case 'hr':
      return <hr key={key} className="my-4 border-t border-border" />
    case 'quote':
      return (
        <blockquote
          key={key}
          className="my-3 pl-3 border-l-4 border-border text-text-2 italic"
        >
          {renderMarkdown(block.value)}
        </blockquote>
      )
    case 'code':
      return (
        <pre
          key={key}
          className="my-3 p-3 rounded-md bg-surface-2 border border-border text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre"
        >
          {block.value}
        </pre>
      )
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      const listClass = block.ordered
        ? 'list-decimal pl-6 my-2 space-y-1'
        : 'list-disc pl-6 my-2 space-y-1'
      return (
        <Tag key={key} className={listClass}>
          {block.items.map((it, j) => (
            <li key={j} className="text-sm leading-relaxed">
              {renderListItem(it)}
            </li>
          ))}
        </Tag>
      )
    }
    case 'paragraph':
    default:
      return (
        <p key={key} className="text-sm leading-relaxed my-2">
          {renderInline(block.value)}
        </p>
      )
  }
}

function renderListItem(body) {
  // GitHub-style checklists: [ ] / [x]
  const cb = body.match(CHECKBOX_RE)
  if (cb) {
    const checked = cb[1].toLowerCase() === 'x'
    return (
      <span className="inline-flex items-baseline gap-2">
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="translate-y-0.5"
        />
        <span className={checked ? 'line-through text-text-3' : ''}>
          {renderInline(cb[2])}
        </span>
      </span>
    )
  }
  return renderInline(body)
}

// Inline tokens: bold (**x** / __x__), italic (*x* / _x_), inline code
// (`x`), links ([text](href)). Processed in order via a small tokenizer.
function renderInline(text) {
  if (!text) return null
  const tokens = tokenizeInline(text)
  return tokens.map((t, i) => {
    switch (t.type) {
      case 'bold':
        return (
          <strong key={i} className="font-semibold">
            {renderInline(t.value)}
          </strong>
        )
      case 'italic':
        return (
          <em key={i} className="italic">
            {renderInline(t.value)}
          </em>
        )
      case 'code':
        return (
          <code
            key={i}
            className="px-1 py-0.5 rounded bg-surface-2 border border-border text-[12px] font-mono"
          >
            {t.value}
          </code>
        )
      case 'link': {
        const href = sanitizeHref(t.href)
        if (!href) {
          return <Fragment key={i}>{renderInline(t.value)}</Fragment>
        }
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-info hover:underline"
          >
            {renderInline(t.value)}
          </a>
        )
      }
      case 'text':
      default:
        return <Fragment key={i}>{t.value}</Fragment>
    }
  })
}

function tokenizeInline(text) {
  const tokens = []
  let i = 0
  while (i < text.length) {
    // Inline code (single backticks). Greedy until the closing tick.
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        tokens.push({ type: 'code', value: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    // Bold **x** or __x__
    if (text.slice(i, i + 2) === '**' || text.slice(i, i + 2) === '__') {
      const delim = text.slice(i, i + 2)
      const end = text.indexOf(delim, i + 2)
      if (end !== -1) {
        tokens.push({ type: 'bold', value: text.slice(i + 2, end) })
        i = end + 2
        continue
      }
    }
    // Italic *x* or _x_ — only when not following alphanumeric (so
    // "foo_bar" doesn't trigger).
    if ((text[i] === '*' || text[i] === '_') && (i === 0 || /\s|[^\w]/.test(text[i - 1]))) {
      const delim = text[i]
      const end = text.indexOf(delim, i + 1)
      if (end !== -1 && end > i + 1) {
        tokens.push({ type: 'italic', value: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    // Links [text](href)
    if (text[i] === '[') {
      const closeBracket = text.indexOf(']', i + 1)
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2)
        if (closeParen !== -1) {
          tokens.push({
            type: 'link',
            value: text.slice(i + 1, closeBracket),
            href: text.slice(closeBracket + 2, closeParen),
          })
          i = closeParen + 1
          continue
        }
      }
    }
    // Plain run — accumulate until the next special char.
    let j = i
    while (
      j < text.length &&
      text[j] !== '`' &&
      text[j] !== '*' &&
      text[j] !== '_' &&
      text[j] !== '['
    ) {
      j++
    }
    if (j === i) {
      // No special handler matched — emit a single char to make progress.
      tokens.push({ type: 'text', value: text[i] })
      i++
    } else {
      tokens.push({ type: 'text', value: text.slice(i, j) })
      i = j
    }
  }
  // Merge adjacent text tokens.
  return tokens.reduce((acc, t) => {
    const last = acc[acc.length - 1]
    if (t.type === 'text' && last?.type === 'text') {
      last.value += t.value
    } else {
      acc.push({ ...t })
    }
    return acc
  }, [])
}

function sanitizeHref(href) {
  if (!href) return null
  const trimmed = href.trim()
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('/')
  ) {
    return trimmed
  }
  return null
}
