import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ARTICLES, articlesByCategory, findArticle } from '../help/manifest'
import { renderMarkdown } from '../lib/markdown'
import { printDoc } from '../lib/docPrint'
import { TOURS } from '../lib/tours'

// In-app help section. Two layouts in one component:
//
//   - Index   — articles grouped by category, with a search box
//   - Article — title + rendered markdown body + a "Take the tour"
//               trigger and a "Print / Save as PDF" button
//
// The active article is driven by the URL param `?article=<slug>`
// so links between articles (and bookmarks) work without extra
// routing infrastructure.
export default function HelpView({ onStartTour }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const slug = searchParams.get('article')
  const article = slug ? findArticle(slug) : null
  const [search, setSearch] = useState('')

  // Scroll to top whenever the active article changes — long markdown
  // bodies otherwise inherit the previous scroll position.
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
  }, [slug])

  if (article) {
    return (
      <ArticleView
        article={article}
        onBack={() =>
          setSearchParams(
            (prev) => {
              prev.delete('article')
              return prev
            },
            { replace: false },
          )
        }
        onStartTour={onStartTour}
      />
    )
  }
  return (
    <IndexView
      search={search}
      onSearchChange={setSearch}
      onOpen={(s) =>
        setSearchParams(
          (prev) => {
            prev.set('article', s)
            return prev
          },
          { replace: false },
        )
      }
      onStartTour={onStartTour}
    />
  )
}

// -------------------------------------------------------------------
// Index — search box, category groups, "Take the tour" entry point
// -------------------------------------------------------------------
function IndexView({ search, onSearchChange, onOpen, onStartTour }) {
  const groups = useMemo(() => articlesByCategory(), [])

  // Search: case-insensitive substring across title + summary + body.
  // Cheap because articles are pre-loaded as strings at build time.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    const out = []
    for (const g of groups) {
      const hits = g.articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.body.toLowerCase().includes(q),
      )
      if (hits.length > 0) out.push({ ...g, articles: hits })
    }
    return out
  }, [groups, search])

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Help</h1>
        <p className="text-sm text-text-2 mt-1">
          How to use Tickd. Browse articles below, or{' '}
          <button
            type="button"
            onClick={() => onStartTour?.(TOURS.welcome.id)}
            className="text-info hover:underline"
          >
            take the welcome tour
          </button>{' '}
          for a 5-step walk-through inside the app.
        </p>
      </header>

      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search articles…"
        className="w-full mb-5 px-3 py-2 text-sm rounded-lg border border-border bg-surface outline-none focus:border-info"
      />

      {filtered.length === 0 ? (
        <div className="text-sm text-text-3 py-10 text-center">
          No articles match &ldquo;{search}&rdquo;.
        </div>
      ) : (
        filtered.map((g) => (
          <section key={g.category} className="mb-6">
            <h2 className="text-[11px] uppercase tracking-wider text-text-3 font-semibold mb-2">
              {g.category}
            </h2>
            <ul className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border">
              {g.articles.map((a) => (
                <li key={a.slug}>
                  <button
                    type="button"
                    onClick={() => onOpen(a.slug)}
                    className="w-full text-left px-4 py-3 hover:bg-surface-2 active:bg-surface-3 transition-colors"
                  >
                    <div className="text-sm font-medium">{a.title}</div>
                    <div className="text-xs text-text-2 mt-0.5 leading-snug">
                      {a.summary}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

// -------------------------------------------------------------------
// Article view — markdown body, breadcrumb, PDF export, tour link
// -------------------------------------------------------------------
function ArticleView({ article, onBack, onStartTour }) {
  const html = useMemo(() => renderMarkdown(article.body), [article.body])

  function handlePrint() {
    // Reuse the same print pipeline as docs — a hidden iframe + the
    // browser's native print dialog. Build a "doc"-shaped object so
    // printDoc's existing builder works without modification.
    printDoc({
      doc: {
        title: article.title,
        body: article.body,
      },
      workspaceName: 'Tickd Help',
    })
  }

  return (
    <article className="max-w-3xl mx-auto">
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-text-2 hover:text-text inline-flex items-center gap-1"
        >
          <i className="ti ti-arrow-left text-sm" />
          All articles
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onStartTour?.(TOURS.welcome.id)}
            className="text-xs px-2.5 py-1.5 rounded-md border border-border text-text-2 hover:text-text hover:bg-surface-2 inline-flex items-center gap-1.5"
            title="Replay the in-app onboarding tour"
          >
            <i className="ti ti-map-2 text-sm" />
            <span>Take the tour</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="text-xs px-2.5 py-1.5 rounded-md border border-border text-text-2 hover:text-text hover:bg-surface-2 inline-flex items-center gap-1.5"
            title="Print or save as PDF"
          >
            <i className="ti ti-printer text-sm" />
            <span>Print / PDF</span>
          </button>
        </div>
      </div>

      <div className="text-[11px] uppercase tracking-wider text-text-3 font-semibold mb-1">
        {article.category}
      </div>
      <div
        className="help-prose"
        // The shared markdown renderer outputs trusted HTML built from
        // string content we control (articles ship as static .md files
        // in the repo). Safe to inject.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  )
}
