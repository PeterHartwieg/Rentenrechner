import { describe, expect, it } from 'vitest'
import {
  PUBLIC_ROUTE_IDS,
  buildCanonicalUrl,
  getPublicRoute,
  publicRouteRegistry,
  stripShareStateFromUrl,
  SITE_ORIGIN,
  OG_DEFAULT_IMAGE_PATH,
  type PublicRouteId,
} from './publicRouteRegistry'

describe('publicRouteRegistry — entry shape', () => {
  it('exposes the registered routes from issue #02', () => {
    // Snapshot the canonical paths so adding a new route shows up as a diff
    // in code review (rather than hiding behind a `Object.keys` length test).
    expect(PUBLIC_ROUTE_IDS).toEqual(['/', '/rentenluecke-rechner', '/404'])
  })

  it.each(PUBLIC_ROUTE_IDS)(
    'route %s carries title, meta description, canonical, H1, summary, dateModified, robots',
    (routeId) => {
      const entry = publicRouteRegistry[routeId]
      expect(entry.canonical).toBe(routeId)
      expect(entry.title.length).toBeGreaterThan(10)
      expect(entry.metaDescription.length).toBeGreaterThan(40)
      expect(entry.metaDescription.length).toBeLessThanOrEqual(220)
      expect(entry.h1.length).toBeGreaterThan(5)
      expect(entry.summary.length).toBeGreaterThan(30)
      expect(entry.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // Robots policy must be one of the two allowed values for static SSG.
      expect(['index,follow', 'noindex,follow']).toContain(entry.robots)
    },
  )

  it('uses RentenWiki.de brand string in every public-facing title', () => {
    // PRD US-27: public copy must use RentenWiki.de, not "Rentenrechner".
    for (const routeId of PUBLIC_ROUTE_IDS) {
      const entry = publicRouteRegistry[routeId]
      expect(entry.title).toContain('RentenWiki.de')
    }
  })

  it('marks /404 as noindex,follow and not in sitemap', () => {
    expect(publicRouteRegistry['/404'].robots).toBe('noindex,follow')
    expect(publicRouteRegistry['/404'].inSitemap).toBe(false)
  })

  it('marks the homepage and topic page as indexable and in sitemap', () => {
    expect(publicRouteRegistry['/'].robots).toBe('index,follow')
    expect(publicRouteRegistry['/'].inSitemap).toBe(true)
    expect(publicRouteRegistry['/rentenluecke-rechner'].robots).toBe('index,follow')
    expect(publicRouteRegistry['/rentenluecke-rechner'].inSitemap).toBe(true)
  })

  it('every calculator CTA points at "/" (issue #13 deferred)', () => {
    // The `?topic=<slug>` preselection mechanism is deferred to issue #13.
    // This slice ships plain `/` for every CTA — capturing that here so the
    // change is visible if a later edit accidentally regresses to a deep link.
    for (const routeId of PUBLIC_ROUTE_IDS) {
      expect(publicRouteRegistry[routeId].calculatorCta.href).toBe('/')
    }
  })
})

describe('PublicRouteId — derived from registry keys', () => {
  it('PUBLIC_ROUTE_IDS values are valid PublicRouteId types', () => {
    // Compile-time assertion: assigning a registry key into PublicRouteId
    // must succeed. The runtime assertion is trivial; the value is the type
    // check failing on an unrelated change.
    const id: PublicRouteId = '/rentenluecke-rechner'
    expect(publicRouteRegistry[id]).toBeDefined()
  })
})

describe('getPublicRoute', () => {
  it('returns the entry for a known route', () => {
    expect(getPublicRoute('/')?.h1).toBe(publicRouteRegistry['/'].h1)
    expect(getPublicRoute('/rentenluecke-rechner')?.canonical).toBe('/rentenluecke-rechner')
  })

  it('returns undefined for an unknown route', () => {
    expect(getPublicRoute('/does-not-exist')).toBeUndefined()
  })
})

describe('buildCanonicalUrl', () => {
  it('builds an absolute URL for the homepage with a trailing slash', () => {
    expect(buildCanonicalUrl('/')).toBe(`${SITE_ORIGIN}/`)
  })

  it('builds an absolute URL for topic pages without trailing slash', () => {
    expect(buildCanonicalUrl('/rentenluecke-rechner')).toBe(
      `${SITE_ORIGIN}/rentenluecke-rechner`,
    )
  })

  it('builds an absolute URL for /404', () => {
    expect(buildCanonicalUrl('/404')).toBe(`${SITE_ORIGIN}/404`)
  })

  it('uses the rentenwiki.de origin (no internal "Rentenrechner" hostname)', () => {
    // PRD US-27: public surfaces never use the internal working name.
    for (const routeId of PUBLIC_ROUTE_IDS) {
      const url = buildCanonicalUrl(routeId)
      expect(url.startsWith('https://rentenwiki.de')).toBe(true)
      expect(url).not.toContain('rentenrechner')
    }
  })
})

describe('stripShareStateFromUrl — canonical strip', () => {
  it('removes the share-state query parameter (?s=)', () => {
    // urlShare.ts encodes profile + assumptions into the `s` parameter.
    // Canonical surfaces (sitemap, <link rel="canonical">) must never carry it.
    const original = 'https://rentenwiki.de/?s=eyJ0ZXN0Ijp0cnVlfQ'
    const stripped = stripShareStateFromUrl(original)
    expect(stripped).toBe('https://rentenwiki.de/')
  })

  it('removes the deferred ?topic=<slug> parameter (issue #13)', () => {
    const original = 'https://rentenwiki.de/?topic=rentenluecke'
    const stripped = stripShareStateFromUrl(original)
    expect(stripped).toBe('https://rentenwiki.de/')
  })

  it('removes utm_* parameters defensively', () => {
    const original = 'https://rentenwiki.de/?utm_source=newsletter&utm_medium=email'
    const stripped = stripShareStateFromUrl(original)
    expect(stripped).toBe('https://rentenwiki.de/')
  })

  it('preserves unrelated query parameters', () => {
    // We only strip the 3 known categories; other params (e.g. accessibility
    // toggles or future feature flags) survive the canonical strip.
    const original = 'https://rentenwiki.de/?lang=de'
    const stripped = stripShareStateFromUrl(original)
    expect(stripped).toBe('https://rentenwiki.de/?lang=de')
  })

  it('drops the URL fragment', () => {
    const original = 'https://rentenwiki.de/rentenluecke-rechner#faq'
    const stripped = stripShareStateFromUrl(original)
    expect(stripped).toBe('https://rentenwiki.de/rentenluecke-rechner')
  })

  it('returns the input unchanged for non-URL strings', () => {
    expect(stripShareStateFromUrl('not a url')).toBe('not a url')
  })
})

describe('OG_DEFAULT_IMAGE_PATH', () => {
  it('points at the shared brand placeholder (per-route cards in issue #08)', () => {
    expect(OG_DEFAULT_IMAGE_PATH).toBe('/og/default.png')
  })
})
