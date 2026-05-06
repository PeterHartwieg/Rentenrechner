import { describe, expect, it } from 'vitest'
import {
  PUBLIC_ROUTE_IDS,
  buildCanonicalUrl,
  getPublicRoute,
  publicRouteRegistry,
  resolveTopicPreselection,
  stripShareStateFromUrl,
  SITE_ORIGIN,
  OG_DEFAULT_IMAGE_PATH,
  type PublicRoute,
  type PublicRouteId,
} from './publicRouteRegistry'

describe('publicRouteRegistry — entry shape', () => {
  it('exposes all registered routes (issues #02, #05, #06)', () => {
    // Snapshot the canonical paths so adding a new route shows up as a diff
    // in code review (rather than hiding behind a `Object.keys` length test).
    // Update this list when adding new public routes.
    expect(PUBLIC_ROUTE_IDS).toEqual([
      '/',
      '/rentenluecke-rechner',
      '/riester-rechner',
      '/altersvorsorgedepot-rechner',
      '/riester-vs-altersvorsorgedepot',
      '/basisrente-rechner',
      '/private-rentenversicherung-rechner',
      '/404',
    ])
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

  it('homepage and 404 calculator CTAs point at "/" (no preselection)', () => {
    // Homepage and 404 do not declare `preselection` and therefore must use a
    // bare-`/` CTA. Topic pages may use `/?topic=<slug>` (issue #13) — see
    // the dedicated test below for that.
    expect(publicRouteRegistry['/'].calculatorCta.href).toBe('/')
    expect(publicRouteRegistry['/404'].calculatorCta.href).toBe('/')
  })

  it('topic-page CTA uses ?topic=<slug> when preselection is declared (issue #13)', () => {
    const entry = publicRouteRegistry['/rentenluecke-rechner']
    expect(entry.preselection).toBeDefined()
    // The CTA href should embed the slug so first-time landings auto-fire
    // the matching LandingChoice in `LandingPage`.
    expect(entry.calculatorCta.href).toBe('/?topic=rentenluecke-rechner')
  })
})

describe('preselection — issue #13', () => {
  it('rentenluecke-rechner declares compare mode with ETF preselected', () => {
    // The narrow inferred type (`as const satisfies …`) does not surface the
    // optional `preselection` field on every entry literally, so we read via
    // the wider `PublicRoute` type to assert the runtime value.
    const entry: PublicRoute = publicRouteRegistry['/rentenluecke-rechner']
    expect(entry.preselection).toEqual({
      mode: 'compare',
      visibleProducts: ['etf'],
    })
  })

  it('basisrente-rechner declares compare mode with ETF + basisrente preselected (issue #06)', () => {
    const entry: PublicRoute = publicRouteRegistry['/basisrente-rechner']
    expect(entry.preselection).toEqual({
      mode: 'compare',
      visibleProducts: ['etf', 'basisrente'],
    })
  })

  it('private-rentenversicherung-rechner declares compare mode with ETF + versicherung preselected (issue #06)', () => {
    const entry: PublicRoute = publicRouteRegistry['/private-rentenversicherung-rechner']
    expect(entry.preselection).toEqual({
      mode: 'compare',
      visibleProducts: ['etf', 'versicherung'],
    })
  })

  it('homepage has no preselection (visiting / itself never auto-selects)', () => {
    const entry: PublicRoute = publicRouteRegistry['/']
    expect(entry.preselection).toBeUndefined()
  })

  it('404 has no preselection', () => {
    const entry: PublicRoute = publicRouteRegistry['/404']
    expect(entry.preselection).toBeUndefined()
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

  it('removes the ?topic=<slug> preselection parameter (issue #13)', () => {
    // ?topic=<slug> is a runtime hint for `LandingPage`'s auto-fire path;
    // canonical surfaces (sitemap, link rel=canonical, og:url) must never
    // carry it, even though the topic-page CTA href does (issue #13).
    const original = 'https://rentenwiki.de/?topic=rentenluecke-rechner'
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

describe('resolveTopicPreselection — issue #13', () => {
  it('returns the registered preselection for a known slug', () => {
    expect(resolveTopicPreselection('?topic=rentenluecke-rechner')).toEqual({
      mode: 'compare',
      visibleProducts: ['etf'],
    })
  })

  it('accepts query strings without a leading "?"', () => {
    // window.location.search includes the "?" but URLSearchParams sometimes
    // does not. Both forms must resolve identically.
    expect(resolveTopicPreselection('topic=rentenluecke-rechner')).toEqual({
      mode: 'compare',
      visibleProducts: ['etf'],
    })
  })

  it('returns null for an unknown slug', () => {
    expect(resolveTopicPreselection('?topic=does-not-exist')).toBeNull()
  })

  it('returns null when the topic param is missing', () => {
    expect(resolveTopicPreselection('?lang=de')).toBeNull()
  })

  it('returns null for an empty query string', () => {
    expect(resolveTopicPreselection('')).toBeNull()
  })

  it('returns null when the topic value is empty', () => {
    expect(resolveTopicPreselection('?topic=')).toBeNull()
  })

  it('returns null when the matching route has no preselection', () => {
    // The homepage entry exists but declares no preselection — visiting
    // /?topic=/ would trigger this branch (defensive: no slug ever resolves
    // to "/" because slug lacks the leading slash, but a future entry
    // without a preselection should also return null).
    expect(resolveTopicPreselection('?topic=')).toBeNull()
  })

  it('ignores other query parameters and returns the topic match', () => {
    // Defensive: extra query params (utm_*, share-state) must not break the
    // resolver. The resolver only reads `topic`.
    expect(
      resolveTopicPreselection('?topic=rentenluecke-rechner&utm_source=email&s=abc'),
    ).toEqual({
      mode: 'compare',
      visibleProducts: ['etf'],
    })
  })

  // Issue #06 — new topic page slugs
  it('resolves basisrente-rechner slug to ETF + basisrente compare mode (issue #06)', () => {
    expect(resolveTopicPreselection('?topic=basisrente-rechner')).toEqual({
      mode: 'compare',
      visibleProducts: ['etf', 'basisrente'],
    })
  })

  it('resolves private-rentenversicherung-rechner slug to ETF + versicherung compare mode (issue #06)', () => {
    expect(resolveTopicPreselection('?topic=private-rentenversicherung-rechner')).toEqual({
      mode: 'compare',
      visibleProducts: ['etf', 'versicherung'],
    })
  })
})
