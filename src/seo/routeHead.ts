import type { WebApplication, WebSite, WithContext } from 'schema-dts'
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
  readonly jsonLd: WithContext<WebApplication> | WithContext<WebSite>
}

/** Brand string for `og:site_name`. Centralised so renames stay in one place. */
export const SITE_NAME = 'RentenWiki.de'

/**
 * Build the canonical `<head>` description for a registered public route.
 * Pure function — feed any registry entry, get back a deterministic shape.
 */
export function buildRouteHead(routeId: PublicRouteId): RouteHead {
  const entry = publicRouteRegistry[routeId]
  const canonical = buildCanonicalUrl(routeId)
  const ogImage = SITE_ORIGIN + OG_DEFAULT_IMAGE_PATH

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
): WithContext<WebApplication> | WithContext<WebSite> {
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

  const webSite: WithContext<WebSite> = {
    ...base,
    '@type': 'WebSite',
  }
  return webSite
}
