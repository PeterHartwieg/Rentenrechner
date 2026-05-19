import { useMemo } from 'react'
import './ArticleHubPage.css'
import { LegalFooter } from '../legal/LegalFooter'
import { JsonLd } from '../../seo/JsonLd'
import {
  buildCanonicalUrl,
  publicRouteRegistry,
} from '../../seo/publicRouteRegistry'
import {
  countAllArticles,
  countArticlesInCluster,
  getLatestArticleModified,
  resolveHubGroups,
} from './articleResolver'
import { RULES_YEAR } from '../../rules'
import type { Route } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'

interface Props {
  navigate?: (target: Route) => void
}

/**
 * `/artikel` — editorial index over every clustered topic page.
 *
 * Re-uses the same `HUB_CLUSTERS` taxonomy the landing hub uses (5 buckets,
 * 10 entries today) so the two hubs cannot drift. Per-cluster article counts
 * are sourced via `countArticlesInCluster()` and the latest `dateModified`
 * across all articles is shown in the kicker (no hardcoded "47 Beiträge").
 *
 * Posture (per PR 3 handoff): no fictional authors. Each card surfaces the
 * route's `h1`, `summary`, and a "Stand: <dateModified>" line — that's the
 * only by-line we can stand behind for a single-maintainer project.
 *
 * JSON-LD: `WebPage` block describing the hub itself. Individual article
 * pages keep their own `WebApplication` / `Article` blocks.
 */
export function ArticleHubPage({ navigate }: Props) {
  const route = publicRouteRegistry['/artikel']
  const canonical = buildCanonicalUrl('/artikel')
  const groups = useMemo(() => resolveHubGroups(), [])
  const total = countAllArticles()
  const latest = getLatestArticleModified()
  const navigateOrNoop: (target: Route) => void = navigate ?? (() => {})

  const webPageJsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org' as const,
      '@type': 'WebPage' as const,
      '@id': canonical,
      url: canonical,
      name: route.title,
      headline: route.h1,
      description: route.summary,
      inLanguage: 'de-DE',
      dateModified: route.dateModified,
      ...(route.datePublished ? { datePublished: route.datePublished } : {}),
      isPartOf: {
        '@type': 'WebSite' as const,
        '@id': buildCanonicalUrl('/'),
        url: buildCanonicalUrl('/'),
        name: 'RentenWiki.de',
      },
    }),
    [canonical, route.title, route.h1, route.summary, route.dateModified, route.datePublished],
  )

  return (
    <div className="hub-shell">
      <div className="hub-main">
        <header className="hub-lead">
          <div className="hub-kicker">
            Artikel · {total} Beiträge · zuletzt aktualisiert {latest}
          </div>
          <h1 className="hub-headline">{route.h1}</h1>
          <p className="hub-dek">
            Erklärungen zu Begriffen, Produkten und Rechtsfragen rund um die
            deutsche Altersvorsorge. Jede Seite ist quelloffen und kann auf
            GitHub kommentiert oder verbessert werden.
          </p>
        </header>

        <div className="hub-groups">
          {groups.map((group) => (
            <section key={group.heading} className="hub-group" aria-labelledby={`hub-group-${slugify(group.heading)}`}>
              <div className="hub-group-head">
                <h2
                  id={`hub-group-${slugify(group.heading)}`}
                  className="hub-group-heading"
                >
                  {group.heading}
                </h2>
                <span className="hub-group-count">
                  {countArticlesInCluster(group.heading)} Artikel
                </span>
              </div>
              <div className="hub-group-grid">
                {group.entries.map((entry) => (
                  <article key={entry.path} className="hub-card">
                    <h3 className="hub-card-title">
                      <a
                        href={`${entry.path}/`}
                        className="hub-card-link"
                        onClick={(event) => {
                          if (!navigate) return
                          if (!shouldUseSpaNavigation(event)) return
                          event.preventDefault()
                          navigate(entry.path as Route)
                        }}
                      >
                        {entry.label}
                      </a>
                    </h3>
                    <p className="hub-card-dek">{entry.route.summary}</p>
                    <div className="hub-card-meta">
                      Stand: {entry.route.dateModified}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <p className="hub-stand">
        Stand: {route.dateModified} · Werte für Deutschland {RULES_YEAR}
      </p>

      <LegalFooter navigate={navigateOrNoop} />

      <JsonLd data={webPageJsonLd} />
    </div>
  )
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
