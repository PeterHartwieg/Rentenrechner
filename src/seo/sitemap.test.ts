import { describe, expect, it } from 'vitest'
import { generateSitemap } from './sitemap'
import {
  PUBLIC_ROUTE_IDS,
  buildCanonicalUrl,
  publicRouteRegistry,
} from './publicRouteRegistry'

describe('generateSitemap — content and structure', () => {
  const xml = generateSitemap()

  it('opens with the XML declaration and urlset namespace', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true)
  })

  it('closes with </urlset> and a trailing newline', () => {
    expect(xml.endsWith('</urlset>\n')).toBe(true)
  })

  it('lists every route flagged inSitemap and excludes the others', () => {
    for (const routeId of PUBLIC_ROUTE_IDS) {
      const entry = publicRouteRegistry[routeId]
      const url = buildCanonicalUrl(routeId)
      const present = xml.includes(`<loc>${url}</loc>`)
      if (entry.inSitemap) {
        expect(present, `${routeId} should be listed`).toBe(true)
      } else {
        expect(present, `${routeId} should NOT be listed`).toBe(false)
      }
    }
  })

  it('does not include /404 (locked decision: 404 is noindex)', () => {
    expect(xml).not.toContain('<loc>https://rentenwiki.de/404</loc>')
  })

  it('emits a <lastmod> entry for each listed URL using registry dateModified', () => {
    for (const routeId of PUBLIC_ROUTE_IDS) {
      const entry = publicRouteRegistry[routeId]
      if (!entry.inSitemap) continue
      expect(xml).toContain(`<lastmod>${entry.dateModified}</lastmod>`)
    }
  })

  it('uses absolute https://rentenwiki.de URLs (no relative paths)', () => {
    const locs = xml.match(/<loc>[^<]+<\/loc>/g) ?? []
    expect(locs.length).toBeGreaterThan(0)
    for (const loc of locs) {
      expect(loc).toMatch(/<loc>https:\/\/rentenwiki\.de/)
    }
  })

  it('does not include any share-state query parameter', () => {
    // PRD line 82: share-state URLs (?s=...) must be excluded from canonical
    // indexing. Sitemap is the canonical entry point — assert directly.
    expect(xml).not.toMatch(/\?s=/)
    expect(xml).not.toMatch(/\?topic=/)
  })

  it('is deterministic — same call returns byte-identical output', () => {
    expect(generateSitemap()).toBe(xml)
  })

  it('lists `/` (homepage) as the first canonical URL', () => {
    // Issue #03 acceptance criteria: sitemap.xml includes / as the first
    // canonical URL. Iteration order matches the registry's source order
    // (homepage first, topic pages, 404). Pin this so a future registry
    // re-ordering surfaces in code review.
    const locs = xml.match(/<loc>([^<]+)<\/loc>/g) ?? []
    expect(locs.length).toBeGreaterThan(0)
    const first = locs[0]?.replace(/<\/?loc>/g, '') ?? ''
    expect(first).toBe('https://rentenwiki.de/')
  })
})
