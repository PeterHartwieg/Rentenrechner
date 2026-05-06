import { describe, expect, it } from 'vitest'
import { buildRouteHead, routeOgImagePath } from './routeHead'
import { renderRouteHeadHtml } from './renderRouteHead'
import {
  PUBLIC_ROUTE_IDS,
  buildCanonicalUrl,
  publicRouteRegistry,
  OG_DEFAULT_IMAGE_PATH,
} from './publicRouteRegistry'

/** Mirrors the slug derivation in `scripts/generate-og-images.mjs`. */
function expectedOgPathFor(routeId: string): string {
  const entry = publicRouteRegistry[routeId as keyof typeof publicRouteRegistry]
  // `entry.canonical` is the literal string from each registry entry; we
  // compare via the path string rather than a typed identifier so the helper
  // works across the full union (including `/404`).
  const canonical: string = entry.canonical
  if (!entry.inSitemap || canonical === '/404') {
    return OG_DEFAULT_IMAGE_PATH
  }
  const slug = canonical === '/' ? 'home' : canonical.slice(1)
  return `/og/${slug}.png`
}

describe('buildRouteHead — per-route metadata shape', () => {
  it.each(PUBLIC_ROUTE_IDS)(
    'route %s carries title, description, canonical, robots, OG, Twitter',
    (routeId) => {
      const head = buildRouteHead(routeId)
      const entry = publicRouteRegistry[routeId]
      expect(head.title).toBe(entry.title)
      expect(head.metaDescription).toBe(entry.metaDescription)
      expect(head.canonical).toBe(buildCanonicalUrl(routeId))
      expect(head.robots).toBe(entry.robots)
      expect(head.ogTitle).toBe(entry.title)
      expect(head.ogUrl).toBe(buildCanonicalUrl(routeId))
      expect(head.ogImage).toBe('https://rentenwiki.de' + expectedOgPathFor(routeId))
      expect(head.twitterImage).toBe('https://rentenwiki.de' + expectedOgPathFor(routeId))
      expect(head.ogType).toBe('website')
      expect(head.twitterCard).toBe('summary_large_image')
    },
  )

  it('emits WebApplication JSON-LD for the topic page', () => {
    // `/` JSON-LD is now emitted via the LandingPage body (issue #03 — three
    // blocks via `<JsonLd>` component). routeHead returns null for `/` so the
    // SSG head pipeline does not duplicate the WebApplication block.
    expect(buildRouteHead('/rentenluecke-rechner').jsonLd?.['@type']).toBe('WebApplication')
  })

  it('emits WebSite JSON-LD for /404', () => {
    expect(buildRouteHead('/404').jsonLd?.['@type']).toBe('WebSite')
  })

  it('emits Article JSON-LD with author, publisher, datePublished, mainEntityOfPage', () => {
    // `/etf-vs-bav` is one of the locked Article-type routes (issue #05).
    // External-reviewer enhancement: Article markup must carry an author,
    // a mainEntityOfPage WebPage reference, and an explicit datePublished
    // (falls back to dateModified when the registry entry omits it).
    const head = buildRouteHead('/etf-vs-bav')
    const data = head.jsonLd as unknown as Record<string, unknown>
    expect(data['@type']).toBe('Article')
    expect(data.headline).toBe(publicRouteRegistry['/etf-vs-bav'].h1)
    expect(data.author).toEqual({
      '@type': 'Organization',
      name: 'RentenWiki.de',
      url: 'https://rentenwiki.de',
    })
    expect(data.publisher).toEqual({
      '@type': 'Organization',
      name: 'RentenWiki.de',
      url: 'https://rentenwiki.de',
    })
    expect(data.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': 'https://rentenwiki.de/etf-vs-bav',
    })
    // datePublished may equal dateModified (fallback) or carry the explicit
    // launch date set on the registry entry. Either path is valid.
    const expectedPublished =
      publicRouteRegistry['/etf-vs-bav'].datePublished ??
      publicRouteRegistry['/etf-vs-bav'].dateModified
    expect(data.datePublished).toBe(expectedPublished)
  })

  it('Article datePublished falls back to dateModified when datePublished is omitted', () => {
    // Backward-compat guard: any future Article-type route added without an
    // explicit datePublished must still emit a valid datePublished field.
    // We exercise the fallback path directly through the public buildRouteHead
    // by checking every Article-type route in the registry.
    for (const routeId of PUBLIC_ROUTE_IDS) {
      const entry = publicRouteRegistry[routeId]
      if (entry.jsonLdType !== 'Article') continue
      const head = buildRouteHead(routeId)
      const data = head.jsonLd as unknown as Record<string, unknown>
      const expected = entry.datePublished ?? entry.dateModified
      expect(data.datePublished).toBe(expected)
    }
  })

  it('returns null JSON-LD for `/` (LandingPage emits 3 blocks inline in body)', () => {
    // Issue #03: the homepage emits WebSite + Organization + WebApplication via
    // `<JsonLd>` in the LandingPage body so all three share one authoring path.
    // Head emission for `/` therefore returns null to avoid duplication.
    expect(buildRouteHead('/').jsonLd).toBeNull()
  })
})

describe('routeOgImagePath — per-route OG image convention (issue #08)', () => {
  it('resolves homepage `/` to /og/home.png', () => {
    expect(routeOgImagePath(publicRouteRegistry['/'])).toBe('/og/home.png')
  })

  it('resolves topic routes to /og/<slug>.png', () => {
    expect(routeOgImagePath(publicRouteRegistry['/rentenluecke-rechner'])).toBe(
      '/og/rentenluecke-rechner.png',
    )
    expect(routeOgImagePath(publicRouteRegistry['/bav-rechner'])).toBe('/og/bav-rechner.png')
    expect(routeOgImagePath(publicRouteRegistry['/etf-vs-bav'])).toBe('/og/etf-vs-bav.png')
    expect(routeOgImagePath(publicRouteRegistry['/riester-rechner'])).toBe(
      '/og/riester-rechner.png',
    )
    expect(routeOgImagePath(publicRouteRegistry['/altersvorsorgedepot-rechner'])).toBe(
      '/og/altersvorsorgedepot-rechner.png',
    )
    expect(routeOgImagePath(publicRouteRegistry['/riester-vs-altersvorsorgedepot'])).toBe(
      '/og/riester-vs-altersvorsorgedepot.png',
    )
    expect(routeOgImagePath(publicRouteRegistry['/basisrente-rechner'])).toBe(
      '/og/basisrente-rechner.png',
    )
    expect(routeOgImagePath(publicRouteRegistry['/private-rentenversicherung-rechner'])).toBe(
      '/og/private-rentenversicherung-rechner.png',
    )
    expect(routeOgImagePath(publicRouteRegistry['/rente-netto-berechnen'])).toBe(
      '/og/rente-netto-berechnen.png',
    )
    expect(routeOgImagePath(publicRouteRegistry['/altersvorsorgeprodukte-vergleichen'])).toBe(
      '/og/altersvorsorgeprodukte-vergleichen.png',
    )
  })

  it('falls back to the default placeholder for `/404` (not in sitemap)', () => {
    expect(routeOgImagePath(publicRouteRegistry['/404'])).toBe(OG_DEFAULT_IMAGE_PATH)
  })

  it('OG_DEFAULT_IMAGE_PATH constant remains exported for share-state fallback', () => {
    // Regression guard: the registry still exports the named constant so
    // `injectShareStateNoindex` and other share-URL surfaces can fall back
    // to the brand-only placeholder.
    expect(OG_DEFAULT_IMAGE_PATH).toBe('/og/default.png')
  })
})

describe('renderRouteHeadHtml — JSON-LD parses + visible-content alignment', () => {
  it.each(PUBLIC_ROUTE_IDS)('route %s head JSON-LD count matches expectation', (routeId) => {
    const html = renderRouteHeadHtml(routeId)
    const matches = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g)
    if (routeId === '/') {
      // Homepage emits its three blocks via the LandingPage body, not the head.
      expect(matches).toBeNull()
      return
    }
    expect(matches?.length).toBe(1)
    const inner = matches![0]
      .replace(/^<script type="application\/ld\+json">\s*/, '')
      .replace(/\s*<\/script>$/, '')
    expect(() => JSON.parse(inner)).not.toThrow()
  })

  it.each(PUBLIC_ROUTE_IDS.filter((id) => id !== '/'))(
    'JSON-LD only references entities visible on the page (route %s)',
    (routeId) => {
      // Google's structured-data guidelines: markup must match visible content.
      // We assert that name, description, url, dateModified all match the
      // visible registry entry — the page wrapper renders these directly into
      // the DOM (h1, summary, "Stand" line, internal links).
      //
      // `/` is excluded — it emits via the LandingPage body. Visible-content
      // alignment for the homepage's three blocks is covered by
      // `LandingPage.test.tsx` and `organization.test.ts`.
      const head = buildRouteHead(routeId)
      const entry = publicRouteRegistry[routeId]
      // Cast through `unknown` because schema-dts types are deeply
      // discriminated. The runtime object is plain JSON we authored.
      const data = head.jsonLd as unknown as Record<string, unknown>
      expect(data.name).toBe(entry.title)
      expect(data.description).toBe(entry.summary)
      expect(data.url).toBe(buildCanonicalUrl(routeId))
      expect(data.dateModified).toBe(entry.dateModified)
      expect(data.inLanguage).toBe('de-DE')
    },
  )

  it.each(PUBLIC_ROUTE_IDS)(
    'route %s emits canonical, robots, OG, Twitter meta tags as raw HTML',
    (routeId) => {
      const html = renderRouteHeadHtml(routeId)
      const entry = publicRouteRegistry[routeId]
      const canonical = buildCanonicalUrl(routeId)

      expect(html).toContain(`<link rel="canonical" href="${canonical}" />`)
      expect(html).toContain(`<meta name="robots" content="${entry.robots}" />`)
      expect(html).toContain(`<meta property="og:url" content="${canonical}" />`)
      const expectedOgUrl = 'https://rentenwiki.de' + expectedOgPathFor(routeId)
      expect(html).toContain(`<meta property="og:image" content="${expectedOgUrl}" />`)
      expect(html).toContain(`<meta name="twitter:image" content="${expectedOgUrl}" />`)
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
      expect(html).toContain('<meta property="og:locale" content="de_DE" />')
    },
  )

  it('escapes ampersands in the title attribute (defensive)', () => {
    // We trust authoring; this guards against future copy that accidentally
    // includes raw `&` (e.g. "ETF & bAV").
    const html = renderRouteHeadHtml('/')
    // Find the og:title attribute and ensure no raw `&` (must be `&amp;`).
    const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]*)"/)
    expect(ogTitleMatch).toBeTruthy()
    if (ogTitleMatch) {
      const ogTitle = ogTitleMatch[1]
      // Allow `&amp;`, but not raw `&` followed by a non-`amp;` sequence.
      // (We rely on the attr-escaper.)
      expect(ogTitle).not.toMatch(/&(?!amp;|quot;|lt;|gt;|apos;)/)
    }
  })
})
