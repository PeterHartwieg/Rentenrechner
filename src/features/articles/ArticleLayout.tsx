import { useEffect, useState, type ReactNode } from 'react'
import './ArticleLayout.css'
import { LegalFooter } from '../legal/LegalFooter'
import {
  publicRouteRegistry,
  type PublicRoute,
  type PublicRouteId,
} from '../../seo/publicRouteRegistry'
import { findArticleByPath } from './articleResolver'
import { RULES_YEAR } from '../../rules'
import type { Route } from '../../app/useRoute'
import { ROUTES } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { slugify } from '../../utils/slugify'

const GITHUB_REPO_URL = 'https://github.com/PeterHartwieg/Rentenrechner'

/**
 * Build the default GitHub "edit this article" URL for a route. Each article
 * body lives at `src/features/publicPages/<slug>.body.mdx`, where `<slug>`
 * is the route's canonical path without the leading slash. Without this
 * default, the edit link fell back to the repo root, which dropped readers
 * on the project home instead of the source of the page they were on.
 */
function defaultGithubEditHref(routeId: PublicRouteId): string {
  if (routeId === '/' || routeId === '/artikel' || routeId === '/404'
    || routeId === '/impressum' || routeId === '/datenschutz') {
    return GITHUB_REPO_URL
  }
  const slug = routeId.replace(/^\//, '')
  return `${GITHUB_REPO_URL}/edit/main/src/features/publicPages/${slug}.body.mdx`
}

interface Props {
  /**
   * Canonical registry path for the article (e.g. `/etf-vs-bav`). Drives
   * the H1, summary, "Stand:" line, breadcrumb cluster, and JSON-LD block.
   */
  routeId: PublicRouteId
  /**
   * Article body. Typically the `.mdx` import that used to live inside the
   * `<article className="public-article">` wrapper in the page component.
   */
  children: ReactNode
  /**
   * Optional `navigate` handler — threaded through to LegalFooter so the
   * footer's `Impressum` / `Datenschutz` links use SPA navigation. Defaults
   * to a no-op (SSG prerender path).
   */
  navigate?: (target: Route) => void
  /**
   * Optional override of the GitHub "edit this article" link. Defaults to
   * the repo root URL; per-page sources can pass a more specific path.
   */
  githubEditHref?: string
  /**
   * Optional override of the H1 accent — when set, the last occurrence of
   * this substring inside the registry's `h1` is wrapped in
   * `<em class="article-headline-accent">`. Defaults to no accent.
   */
  accentTerm?: string
}

interface TocItem {
  readonly id: string
  readonly text: string
}

/**
 * Editorial wrapper for every `/features/publicPages/*Page.tsx` (PR 3).
 *
 * Layout — cream background, Newsreader serif body. Desktop three-column
 * grid:
 *   - left rail: auto-derived TOC of `<h2 id>` anchors in the body
 *   - center: H1 + summary + "Wartung / Stand" meta line + body
 *   - right rail: "Zum gleichen Thema" (relatedRoutes) + "Diesen Artikel"
 *     (GitHub edit, PDF deferred to PR 11)
 *
 * Tablet: TOC hides, right rail shrinks. Phone: both rails fold below the
 * article body, TOC hides entirely (in-page anchor jumps remain because the
 * `<h2 id>` anchors live inside the body).
 *
 * The hub article posture (single maintainer, no "Fachprüfung", no fictional
 * bylines, no CC BY-SA 4.0) is hard-coded into the layout — neither the
 * registry nor the page components carry author or licence fields, so this
 * wrapper is the single source of truth for those strings.
 */
export function ArticleLayout({
  routeId,
  children,
  navigate,
  githubEditHref,
  accentTerm,
}: Props) {
  const route = publicRouteRegistry[routeId]
  const clusterEntry = findArticleByPath(routeId)

  // TOC is auto-derived from `<h2 id>` anchors in the article body. We read
  // them once after first paint via useEffect; SSR renders an empty TOC so
  // the desktop column reserves space but stays empty in static HTML. This
  // is acceptable because the in-body `<h2 id>` anchors are still emitted in
  // the static markup, so SEO permalinks (`#section-1`) keep working.
  const [toc, setToc] = useState<readonly TocItem[]>([])
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Synthesise `id` attributes for every `.article-body h2` so anchor
    // jumps work even though the MDX bodies don't carry ids (we don't run a
    // slugger plugin in the MDX pipeline). The id is a slug of the heading
    // text; if a heading already has an id (manually authored), we keep it.
    const headings = Array.from(
      document.querySelectorAll<HTMLHeadingElement>('.article-body h2'),
    )
    const used = new Set<string>()
    const items: TocItem[] = []
    for (const h of headings) {
      const text = h.textContent ?? ''
      // Same uniqueness loop applies to both authored and synthesised ids:
      // an MDX body with two manually-authored `<h2 id="foo">` would
      // otherwise produce duplicate DOM ids and duplicate React keys.
      const base = h.id || slugify(text) || 'section'
      let candidate = base
      let n = 2
      while (used.has(candidate)) {
        candidate = `${base}-${n}`
        n += 1
      }
      if (h.id !== candidate) h.id = candidate
      used.add(candidate)
      items.push({ id: candidate, text })
    }
    // DOM-derived progressive-enhancement state: read once after mount so
    // the desktop TOC reflects the actual rendered article headings. The
    // server-rendered HTML still carries the `<h2>` anchors directly, so
    // SEO permalinks survive without this hook firing (we just don't get
    // the visible TOC on no-JS clients).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToc(items)

    // Direct-fragment-load retry: when the user arrives at e.g.
    // `/bav-rechner/#steuer-und-sv-grenzen-2026`, the browser fires its
    // fragment scroll before this effect assigns the ids — so the initial
    // scroll lands at the top. Now that ids exist, scroll the matching
    // heading into view. Guarded so an unrelated hash (e.g. an MDX-internal
    // jump that doesn't match an `id`) is a no-op.
    if (window.location.hash.length > 1) {
      const target = document.getElementById(window.location.hash.slice(1))
      if (target) target.scrollIntoView()
    }
  }, [routeId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (toc.length === 0) return
    // Defensive: jsdom (vitest) and very old browsers do not implement
    // IntersectionObserver. The active-anchor highlight is an enhancement
    // for visible TOC behaviour on real browsers; without it the first item
    // stays highlighted (handled by the rendering fallback).
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveAnchor(entry.target.id)
            break
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px' },
    )
    for (const item of toc) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [toc])

  const navigateOrNoop: (target: Route) => void = navigate ?? (() => {})
  const editHref = githubEditHref ?? defaultGithubEditHref(routeId)

  // Render the H1: if `accentTerm` is set, wrap its final occurrence in an
  // italic oxblood span (mirrors the LandingPage `<em class="landing-
  // headline-accent">wirklich</em>` pattern). Otherwise render the H1 as
  // plain text.
  const headlineNode = renderHeadline(route.h1, accentTerm)

  // JSON-LD is emitted by `renderRouteHeadHtml(routeId)` via the SSG head
  // pipeline (`buildJsonLd` returns the correct `@type` per registry entry).
  // We deliberately do NOT emit an inline `<JsonLd>` block here — that would
  // duplicate the schema and trip the "single JSON-LD per route" invariant
  // (`/` is the only route where head emission is suppressed in favour of
  // body emission — see `src/seo/routeHead.ts`).

  // Related routes — surfaced as the right-rail "Zum gleichen Thema" card.
  // `relatedRoutes` is inferred as a literal-narrowed tuple by `as const` on
  // the registry, so we widen `slug` to `string` before lookup and use
  // `flatMap` to avoid the awkward filter-with-type-predicate dance.
  type RelatedRow = { readonly slug: string; readonly h1: string }
  const related: readonly RelatedRow[] = route.relatedRoutes.flatMap(
    (slug): readonly RelatedRow[] => {
      const path: string = slug
      if (path === '/') return []
      const sibling = (publicRouteRegistry as Record<string, PublicRoute>)[path]
      if (!sibling) return []
      return [{ slug: path, h1: sibling.h1 }]
    },
  )

  return (
    <div className="article-shell">
      <div className="article-main">
        {/* Breadcrumb row — Start › Artikel › Cluster. Two text links so the
            page surfaces homepage + hub navigation independently of the
            chrome AppHeader, which is critical for tests that render the
            page in isolation. */}
        <nav className="article-breadcrumb" aria-label="Pfad">
          <a
            href="/"
            className="article-breadcrumb-back"
            onClick={(event) => {
              if (!navigate) return
              if (!shouldUseSpaNavigation(event)) return
              event.preventDefault()
              navigate(ROUTES.home)
            }}
          >
            Startseite
          </a>
          <span className="article-breadcrumb-sep" aria-hidden="true">›</span>
          <a
            href="/artikel"
            className="article-breadcrumb-back"
            onClick={(event) => {
              if (!navigate) return
              if (!shouldUseSpaNavigation(event)) return
              event.preventDefault()
              navigate(ROUTES.artikel)
            }}
          >
            Alle Artikel
          </a>
          {clusterEntry && (
            <>
              <span className="article-breadcrumb-sep" aria-hidden="true">›</span>
              <span className="article-breadcrumb-cluster">{clusterEntry.cluster}</span>
            </>
          )}
        </nav>

        <div className="article-grid">
          {/* Left rail — TOC. Hidden on tablet + phone via CSS. */}
          <aside className="article-toc" aria-label="In diesem Artikel">
            <div className="article-toc-kicker">In diesem Artikel</div>
            {toc.length > 0 ? (
              <ol className="article-toc-list">
                {toc.map((item, i) => {
                  const isActive = activeAnchor === item.id || (activeAnchor === null && i === 0)
                  return (
                    <li
                      key={item.id}
                      className={
                        isActive
                          ? 'article-toc-item article-toc-item--active'
                          : 'article-toc-item'
                      }
                    >
                      <a
                        href={`#${item.id}`}
                        className="article-toc-link"
                        aria-current={isActive ? 'location' : undefined}
                      >
                        {item.text}
                      </a>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="article-toc-empty">Inhalt wird geladen …</p>
            )}
          </aside>

          {/* Center — the article body. */}
          <article className="article-body">
            <h1 className="article-headline">{headlineNode}</h1>
            <p className="article-summary">{route.summary}</p>
            <div className="article-meta">
              <span className="article-meta-item">
                <strong className="article-meta-label">Wartung:</strong> Peter Hartwieg
              </span>
              <span className="article-meta-sep" aria-hidden="true">·</span>
              <span className="article-meta-item">
                Stand: {route.dateModified}
              </span>
              <span className="article-meta-sep" aria-hidden="true">·</span>
              <span className="article-meta-item">
                Werte für Deutschland {RULES_YEAR}
              </span>
            </div>

            <a href={route.calculatorCta.href} className="article-cta">
              {route.calculatorCta.label}
            </a>

            {children}
          </article>

          {/* Right rail — related + edit links. */}
          <aside className="article-aside">
            {related.length > 0 && (
              <div className="article-aside-card article-aside-card--related">
                <div className="article-aside-kicker">Zum gleichen Thema</div>
                <ul className="article-aside-list">
                  {related.map((r) => (
                    <li key={r.slug} className="article-aside-list-item">
                      <a href={`${r.slug}/`} className="article-aside-link">
                        {r.h1}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="article-aside-card article-aside-card--meta">
              <div className="article-aside-kicker">Diesen Artikel</div>
              <ul className="article-aside-meta-list">
                <li>
                  <a
                    href={editHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="article-aside-meta-link"
                  >
                    ↗ Auf GitHub bearbeiten
                  </a>
                </li>
              </ul>
              <p className="article-aside-license">
                Quelloffen unter PolyForm Noncommercial 1.0.0 — kommerzielle
                Nutzung lizenzpflichtig.
              </p>
            </div>
          </aside>
        </div>
      </div>

      <p className="article-stand">
        Stand: {route.dateModified} · Werte für Deutschland {RULES_YEAR}
      </p>

      <LegalFooter navigate={navigateOrNoop} />
    </div>
  )
}

/**
 * Render the registry H1 with an optional italic-accent term. If `accentTerm`
 * is supplied and appears in `h1`, the final occurrence is wrapped in an
 * `<em class="article-headline-accent">` (matches the Landing page accent
 * pattern). Otherwise returns plain text.
 *
 * Defensive: case-sensitive substring match, no regex (so accent terms with
 * regex meta characters never crash).
 */
function renderHeadline(h1: string, accentTerm: string | undefined): ReactNode {
  if (!accentTerm) return h1
  const idx = h1.lastIndexOf(accentTerm)
  if (idx === -1) return h1
  const before = h1.slice(0, idx)
  const after = h1.slice(idx + accentTerm.length)
  return (
    <>
      {before}
      <em className="article-headline-accent">{accentTerm}</em>
      {after}
    </>
  )
}
