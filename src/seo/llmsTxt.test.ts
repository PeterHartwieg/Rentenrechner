import { describe, expect, it } from 'vitest'
import {
  LLMS_TXT_PURPOSE,
  LLMS_TXT_SECTION_HEADING,
  LLMS_TXT_TITLE,
  generateLlmsTxt,
} from './llmsTxt'
import {
  PUBLIC_ROUTE_IDS,
  buildCanonicalUrl,
  publicRouteRegistry,
} from './publicRouteRegistry'

describe('generateLlmsTxt — content and structure', () => {
  const txt = generateLlmsTxt()

  it('opens with the RentenWiki.de top-level heading', () => {
    expect(txt.startsWith(`${LLMS_TXT_TITLE}\n`)).toBe(true)
  })

  it('includes the purpose blockquote with not-advice + license posture', () => {
    expect(txt).toContain(`> ${LLMS_TXT_PURPOSE}`)
    expect(LLMS_TXT_PURPOSE).toMatch(/keine Steuer-, Rechts- oder Anlageberatung/i)
    expect(LLMS_TXT_PURPOSE).toMatch(/PolyForm Noncommercial/i)
    expect(LLMS_TXT_PURPOSE).toMatch(/Stand \d{4}/i)
  })

  it('contains the German section heading for the route list', () => {
    expect(txt).toContain(`${LLMS_TXT_SECTION_HEADING}\n`)
  })

  it('lists every route flagged inSitemap and excludes the others', () => {
    for (const routeId of PUBLIC_ROUTE_IDS) {
      const entry = publicRouteRegistry[routeId]
      const url = buildCanonicalUrl(routeId)
      const present = txt.includes(`](${url})`)
      if (entry.inSitemap) {
        expect(present, `${routeId} should be listed`).toBe(true)
      } else {
        expect(present, `${routeId} should NOT be listed`).toBe(false)
      }
    }
  })

  it('does not include /404 (excluded via inSitemap=false)', () => {
    expect(txt).not.toContain('https://rentenwiki.de/404')
  })

  it('emits one bullet line per in-sitemap route in registry order', () => {
    const bulletLines = txt.split('\n').filter((line) => line.startsWith('- ['))
    const expectedRoutes = PUBLIC_ROUTE_IDS.filter(
      (id) => publicRouteRegistry[id].inSitemap,
    )
    expect(bulletLines.length).toBe(expectedRoutes.length)
    // Order pin: registry source order (homepage first).
    for (let i = 0; i < expectedRoutes.length; i++) {
      const url = buildCanonicalUrl(expectedRoutes[i]!)
      expect(bulletLines[i]).toContain(`](${url})`)
    }
  })

  it('uses absolute https://rentenwiki.de URLs in every link', () => {
    const links = txt.match(/\]\(([^)]+)\)/g) ?? []
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link).toMatch(/\]\(https:\/\/rentenwiki\.de/)
    }
  })

  it('does not include any share-state or topic query parameter', () => {
    // llms.txt is a canonical surface — same exclusion rule as sitemap.xml.
    expect(txt).not.toMatch(/\?s=/)
    expect(txt).not.toMatch(/\?topic=/)
  })

  it('includes the page title and a single-line summary for each entry', () => {
    for (const routeId of PUBLIC_ROUTE_IDS) {
      const entry = publicRouteRegistry[routeId]
      if (!entry.inSitemap) continue
      // Title in the link text.
      expect(txt).toContain(`[${entry.title}]`)
      // Summary appears after the URL, on the same line, with newlines stripped.
      const collapsedSummary = entry.summary.replace(/\s+/g, ' ').trim()
      expect(txt).toContain(`: ${collapsedSummary}`)
    }
  })

  it('places `/` (homepage) as the first listed route', () => {
    const bulletLines = txt.split('\n').filter((line) => line.startsWith('- ['))
    expect(bulletLines[0]).toContain('](https://rentenwiki.de/)')
  })

  it('ends with a single trailing newline', () => {
    expect(txt.endsWith('\n')).toBe(true)
    expect(txt.endsWith('\n\n')).toBe(false)
  })

  it('is deterministic — same call returns byte-identical output', () => {
    expect(generateLlmsTxt()).toBe(txt)
  })

  it('honours a registry override for testing', () => {
    const fakeRegistry = {
      '/foo': {
        canonical: '/foo',
        title: 'Foo Page',
        metaDescription: 'desc',
        h1: 'Foo',
        summary: 'A\nmultiline\nsummary',
        dateModified: '2026-01-01',
        robots: 'index,follow' as const,
        inSitemap: true,
        jsonLdType: 'Article' as const,
        relatedRoutes: [],
        calculatorCta: { label: 'L', href: '/' },
      },
      '/skipme': {
        canonical: '/skipme',
        title: 'Skipped',
        metaDescription: 'desc',
        h1: 'S',
        summary: 'Should not appear',
        dateModified: '2026-01-01',
        robots: 'noindex,follow' as const,
        inSitemap: false,
        jsonLdType: 'WebSite' as const,
        relatedRoutes: [],
        calculatorCta: { label: 'L', href: '/' },
      },
    }
    const out = generateLlmsTxt({
      routeIds: ['/foo', '/skipme'],
      routes: fakeRegistry,
    })
    expect(out).toContain('[Foo Page](https://rentenwiki.de/foo): A multiline summary')
    expect(out).not.toContain('Skipped')
  })
})
