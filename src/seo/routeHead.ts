import type { Article, WebApplication, WebSite, WithContext } from 'schema-dts'
import {
  OG_DEFAULT_IMAGE_PATH,
  SITE_ORIGIN,
  buildCanonicalUrl,
  publicRouteRegistry,
  type PublicRouteId,
  type PublicRoute,
} from './publicRouteRegistry'

/**
 * Pure description of the `<head>` content for a public route. The SSG
 * prerender pass renders this into a string and injects it into the static
 * HTML; the runtime app does not need to manage these tags.
 *
 * Tests run against this shape directly without booting jsdom.
 *
 * `jsonLd` is `null` for routes whose page wrapper emits JSON-LD inline in
 * the body via the `<JsonLd>` React component. The homepage uses this branch
 * because it emits three blocks (WebSite, Organization, WebApplication —
 * issue #03), all of which live in the LandingPage body so they share one
 * authoring path.
 */
export interface RouteHead {
  readonly title: string
  readonly metaDescription: string
  readonly canonical: string
  readonly robots: string
  readonly ogTitle: string
  readonly ogDescription: string
  readonly ogUrl: string
  readonly ogImage: string
  readonly ogType: 'website'
  readonly ogSiteName: string
  readonly twitterCard: 'summary_large_image'
  readonly twitterTitle: string
  readonly twitterDescription: string
  readonly twitterImage: string
  readonly jsonLd: WithContext<WebApplication> | WithContext<WebSite> | WithContext<Article> | null
}

/** Brand string for `og:site_name`. Centralised so renames stay in one place. */
export const SITE_NAME = 'RentenWiki.de'

/**
 * Convention-over-config per-route OG image path (issue #08).
 *
 * In-sitemap, non-`/404` routes resolve to `/og/${slug}.png` where
 * `slug = canonical.slice(1)` (homepage `/` maps to `/og/home.png`).
 * Other routes — `/404` and any future non-sitemap entries — fall back
 * to the brand-only `OG_DEFAULT_IMAGE_PATH` placeholder.
 *
 * Mirrors `slugForRoute` in `scripts/generate-og-images.mjs`. Keep in sync.
 *
 * Returns the path component only (leading `/`); callers prepend
 * `SITE_ORIGIN` for absolute URLs in meta tags.
 */
export function routeOgImagePath(route: PublicRoute): string {
  if (!route.inSitemap || route.canonical === '/404') {
    return OG_DEFAULT_IMAGE_PATH
  }
  const slug = route.canonical === '/' ? 'home' : route.canonical.slice(1)
  return `/og/${slug}.png`
}

/**
 * Build the canonical `<head>` description for a registered public route.
 * Pure function — feed any registry entry, get back a deterministic shape.
 */
export function buildRouteHead(routeId: PublicRouteId): RouteHead {
  const entry = publicRouteRegistry[routeId]
  const canonical = buildCanonicalUrl(routeId)
  const ogImage = SITE_ORIGIN + routeOgImagePath(entry)

  return {
    title: entry.title,
    metaDescription: entry.metaDescription,
    canonical,
    robots: entry.robots,
    ogTitle: entry.title,
    ogDescription: entry.metaDescription,
    ogUrl: canonical,
    ogImage,
    ogType: 'website',
    ogSiteName: SITE_NAME,
    twitterCard: 'summary_large_image',
    twitterTitle: entry.title,
    twitterDescription: entry.metaDescription,
    twitterImage: ogImage,
    jsonLd: buildJsonLd(entry, canonical),
  }
}

/**
 * Build the JSON-LD object for a route. Only references that are visible on
 * the rendered page may appear here — Google's structured-data guidelines
 * forbid markup that doesn't match visible content.
 *
 * Returns `null` for the homepage `/`: the LandingPage renders three blocks
 * (WebSite, Organization, WebApplication) inline in its body via the typed
 * `<JsonLd>` component (issue #03). Keeping head emission here would either
 * duplicate the WebApplication block or split JSON-LD across two emission
 * paths. We keep the head pipeline for `/rentenluecke-rechner` and `/404`
 * unchanged.
 *
 * Visible-content audit (verified in unit tests):
 *   - `name` ↔ `<title>` (rendered into the page chrome)
 *   - `description` ↔ `summary` (rendered as page lead paragraph)
 *   - `url` ↔ canonical (linked from internal navigation)
 *   - `inLanguage` ↔ `<html lang="de">`
 *   - `dateModified` ↔ rendered "Stand 2026-05-06" line in the page body
 */
function buildJsonLd(
  entry: PublicRoute,
  canonical: string,
): WithContext<WebApplication> | WithContext<WebSite> | WithContext<Article> | null {
  // Homepage emits its three JSON-LD blocks via the LandingPage body
  // (`buildHomeWebSiteJsonLd` + `buildHomeOrganizationJsonLd` +
  // `buildHomeWebApplicationJsonLd`). Skip head emission to avoid duplication.
  if (entry.canonical === '/') return null

  const base = {
    '@context': 'https://schema.org' as const,
    name: entry.title,
    description: entry.summary,
    url: canonical,
    inLanguage: 'de-DE',
    dateModified: entry.dateModified,
  }

  if (entry.jsonLdType === 'WebApplication') {
    const webApp: WithContext<WebApplication> = {
      ...base,
      '@type': 'WebApplication',
      applicationCategory: 'FinanceApplication',
      // The calculator is offered free of charge — communicating this in
      // structured data matches the visible "kostenlos" copy.
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'EUR',
      },
    }
    return webApp
  }

  if (entry.jsonLdType === 'Article') {
    // Comparison/explanatory pages (e.g. /riester-vs-altersvorsorgedepot)
    // use `Article` per the locked decision in issue #05.
    // Visible-content audit:
    //   - `headline` ↔ rendered H1 on the page
    //   - `description` ↔ summary rendered as page lead paragraph
    //   - `datePublished` ↔ falls back to `dateModified` when registry entry
    //     lacks an explicit publication date (backward-compatible default).
    //   - `dateModified` ↔ rendered "Stand …" line
    //   - `author` ↔ Organization block on homepage (RentenWiki.de itself
    //     is the editorial author of the calculator content; matches
    //     `publisher` because we are a single-org publication).
    //   - `publisher` ↔ Organization block on homepage (consistent legalName)
    //   - `mainEntityOfPage` ↔ canonical URL (tells search engines that this
    //     Article is the primary entity of the canonical WebPage).
    const article: WithContext<Article> = {
      ...base,
      '@type': 'Article',
      headline: entry.h1,
      image: SITE_ORIGIN + routeOgImagePath(entry),
      datePublished: entry.datePublished ?? entry.dateModified,
      author: {
        '@type': 'Organization',
        name: 'RentenWiki.de',
        url: SITE_ORIGIN,
      },
      publisher: {
        '@type': 'Organization',
        name: 'RentenWiki.de',
        url: SITE_ORIGIN,
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': canonical,
      },
    }
    return article
  }

  const webSite: WithContext<WebSite> = {
    ...base,
    '@type': 'WebSite',
  }
  return webSite
}
