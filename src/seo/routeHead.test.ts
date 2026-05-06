import { describe, expect, it } from 'vitest'
import { buildRouteHead } from './routeHead'
import { renderRouteHeadHtml } from './renderRouteHead'
import {
  PUBLIC_ROUTE_IDS,
  buildCanonicalUrl,
  publicRouteRegistry,
} from './publicRouteRegistry'

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
      expect(head.ogImage).toBe('https://rentenwiki.de/og/default.png')
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

  it('returns null JSON-LD for `/` (LandingPage emits 3 blocks inline in body)', () => {
    // Issue #03: the homepage emits WebSite + Organization + WebApplication via
    // `<JsonLd>` in the LandingPage body so all three share one authoring path.
    // Head emission for `/` therefore returns null to avoid duplication.
    expect(buildRouteHead('/').jsonLd).toBeNull()
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
      expect(html).toContain('<meta property="og:image" content="https://rentenwiki.de/og/default.png" />')
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
