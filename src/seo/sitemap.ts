import {
  PUBLIC_ROUTE_IDS,
  buildCanonicalUrl,
  publicRouteRegistry,
} from './publicRouteRegistry'

/**
 * Generate `sitemap.xml` content from the public-route registry.
 *
 * Pure function — same input always produces byte-identical output. The vite
 * `closeBundle` hook writes this string to `dist/sitemap.xml`. Tests assert
 * structure and content rather than calling the real build.
 *
 * Decisions pinned in issue #02:
 *   - Only routes with `inSitemap: true` are listed (excludes `/404`).
 *   - URLs are canonical (no `?s=` share-state, no fragments).
 *   - `<lastmod>` is the ISO `dateModified` from the registry — driven by the
 *     statutory-year update cycle, not by build timestamps (which would churn
 *     every deploy and confuse search-engine staleness signals).
 *   - No `<priority>` / `<changefreq>` — Google ignores them, Bing barely uses
 *     them, and Sitemaps Protocol 0.9 marks them optional. Adding them would
 *     introduce drift between intent and behavior.
 */
export function generateSitemap(): string {
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

  for (const routeId of PUBLIC_ROUTE_IDS) {
    const entry = publicRouteRegistry[routeId]
    if (!entry.inSitemap) continue
    const loc = buildCanonicalUrl(routeId)
    lines.push('  <url>')
    lines.push(`    <loc>${escapeXml(loc)}</loc>`)
    lines.push(`    <lastmod>${entry.dateModified}</lastmod>`)
    lines.push('  </url>')
  }

  lines.push('</urlset>')
  // Trailing newline keeps git diffs tidy and matches the standard convention.
  return lines.join('\n') + '\n'
}

/**
 * Minimal XML entity escaper for `<loc>` text content. Sitemap URLs are ASCII
 * after URL-encoding so realistic input only contains `&` (in already-encoded
 * URLs); the other entities are defensive.
 */
function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
