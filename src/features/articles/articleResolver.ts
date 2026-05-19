// ---------------------------------------------------------------------------
// articleResolver.ts — typed resolution between HUB_CLUSTERS (taxonomy /
// label source) and publicRouteRegistry (canonical metadata source).
//
// PR 3. Used by:
//   - ArticleHubPage to render the cream/serif `/artikel` index.
//   - ArticleLayout to render the breadcrumb cluster + "Stand:" line.
//
// Mirrors the fail-fast pattern from `src/features/landing/hubClusters.ts`
// (`resolveFeaturedArticles`): any drift between the two sources of truth
// throws at module-evaluation time so a missing entry can never silently
// shrink the hub.
//
// Trailing-slash policy: HUB_CLUSTERS hrefs carry a trailing slash for SEO /
// hosting reasons. publicRouteRegistry keys do not. This module normalises
// the hub hrefs to the registry's slash-free form so callers can index by
// the canonical path they already use elsewhere (e.g. `Route` literals).
// ---------------------------------------------------------------------------

import { HUB_CLUSTERS } from '../landing/hubClusters'
import {
  publicRouteRegistry,
  type PublicRoute,
  type PublicRouteId,
} from '../../seo/publicRouteRegistry'

/** Strip a trailing slash unless the path is just "/". */
function stripSlash(href: string): string {
  return href.length > 1 && href.endsWith('/') ? href.slice(0, -1) : href
}

export interface ArticleEntry {
  /** Canonical registry path (no trailing slash, e.g. `/etf-vs-bav`). */
  readonly path: string
  /** Hub-cluster label (visible link text on the landing hub). */
  readonly label: string
  /** HUB_CLUSTERS cluster heading this entry belongs to (e.g. "bAV und ETF"). */
  readonly cluster: string
  /** Full PublicRoute metadata (title, h1, summary, dateModified, ...). */
  readonly route: PublicRoute
}

export interface ArticleClusterGroup {
  readonly heading: string
  readonly entries: readonly ArticleEntry[]
}

/**
 * Walk HUB_CLUSTERS once, resolve every link's canonical path against
 * publicRouteRegistry, and group the results by cluster heading.
 *
 * Throws at module-evaluation time if a cluster link references a path that
 * is not in publicRouteRegistry. This guards two sources of truth (taxonomy
 * vs. metadata) from drifting silently.
 */
export function resolveHubGroups(): readonly ArticleClusterGroup[] {
  return HUB_CLUSTERS.map((cluster) => ({
    heading: cluster.heading,
    entries: cluster.links.map((link) => {
      const path = stripSlash(link.href)
      const route = (publicRouteRegistry as Record<string, PublicRoute>)[path]
      if (!route) {
        throw new Error(
          `resolveHubGroups: HUB_CLUSTERS link "${link.href}" (normalised to "${path}") ` +
            `has no matching entry in publicRouteRegistry. Add the registry entry ` +
            `or remove the cluster link.`,
        )
      }
      return {
        path,
        label: link.label,
        cluster: cluster.heading,
        route,
      }
    }),
  }))
}

/**
 * Locate the cluster + entry for a given registry path. Returns `null` if
 * the path is not in any cluster (e.g. `/`, `/impressum`, `/artikel`, `/404`).
 *
 * Used by ArticleLayout to render the "← Alle Artikel · {cluster}" breadcrumb.
 */
export function findArticleByPath(path: string): ArticleEntry | null {
  for (const cluster of HUB_CLUSTERS) {
    for (const link of cluster.links) {
      const canonical = stripSlash(link.href)
      if (canonical === path) {
        const route = (publicRouteRegistry as Record<string, PublicRoute>)[canonical]
        if (!route) return null
        return {
          path: canonical,
          label: link.label,
          cluster: cluster.heading,
          route,
        }
      }
    }
  }
  return null
}

/**
 * Count the entries in the cluster whose heading matches. Used by the hub
 * page's "X Artikel" mono kicker. Returns 0 for unknown headings rather than
 * throwing, since rendering loops over the same source list — drift is
 * impossible by construction.
 */
export function countArticlesInCluster(heading: string): number {
  const cluster = HUB_CLUSTERS.find((c) => c.heading === heading)
  return cluster ? cluster.links.length : 0
}

/**
 * The most-recent `dateModified` across every clustered article. Powers the
 * hub kicker ("zuletzt aktualisiert YYYY-MM-DD"). Returns the hub route's
 * own `dateModified` if it is newer than any article's (covers freshly
 * launched hubs whose article dates are older).
 */
export function getLatestArticleModified(): string {
  let latest = ''
  for (const cluster of HUB_CLUSTERS) {
    for (const link of cluster.links) {
      const path = stripSlash(link.href)
      const route = (publicRouteRegistry as Record<string, PublicRoute>)[path]
      if (route && route.dateModified > latest) {
        latest = route.dateModified
      }
    }
  }
  const hub = (publicRouteRegistry as Record<string, PublicRoute>)['/artikel']
  if (hub && hub.dateModified > latest) latest = hub.dateModified
  return latest
}

/**
 * Total number of clustered articles. Mirrors `countHubArticles()` from
 * `hubClusters.ts` but kept here so article-side callers don't have to reach
 * across the feature boundary into landing.
 */
export function countAllArticles(): number {
  return HUB_CLUSTERS.reduce((acc, c) => acc + c.links.length, 0)
}

/**
 * Type guard: which registry paths are valid `ArticleLayout` routeIds.
 * Currently every non-`/`, non-legal, non-404 route — but defined explicitly
 * so future legal pages or non-article topic pages can opt out by being
 * absent from the cluster list.
 */
export function isArticleRoute(routeId: PublicRouteId): boolean {
  return findArticleByPath(routeId) !== null
}

/**
 * Routes that wear the editorial chrome (cream bg + serif H1). PR 3
 * promotes the Artikel hub + every clustered topic page; PR 4 will add
 * `/methode`. The landing view is editorial too but that flag lives in
 * `App.tsx` since it depends on runtime state (`calculatorView`), not the
 * route alone.
 */
export function isEditorialChromeRoute(routeId: string): boolean {
  if (routeId === '/artikel') return true
  return findArticleByPath(routeId) !== null
}
