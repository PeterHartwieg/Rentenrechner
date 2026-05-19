// @vitest-environment jsdom

/**
 * LandingPage tests — combined coverage for issues #03 and #13.
 *
 * Issue #03 (homepage SEO upgrade):
 *   - Hero + two existing CTAs render unchanged
 *   - The new `Erkunde Themen` hub renders with 5 cluster headings and 10
 *     descriptive-anchor links pointing to the locked canonical paths
 *   - Three JSON-LD blocks (WebSite, Organization, WebApplication) render
 *     inline; each parses; each only references entities visible on the page
 *   - Organization JSON-LD has NO `address` field (decision pinned in #03)
 *   - DisclaimerBanner is the literal first interactive content (session-only)
 *   - LegalFooter renders below the hub (license posture visible)
 *   - No new "Rentenrechner" copy in user-visible text
 *   - Prerender resilience (no localStorage dep, optional navigate prop)
 *
 * Issue #13 (?topic= auto-fire):
 *   1. Known slug + no saved state → auto-fire `onChoice` with mode +
 *      visibleProducts.
 *   2. Unknown slug → no auto-fire; landing renders normally.
 *   3. Missing slug → no auto-fire; landing renders normally.
 *   4. Returning user with saved state → no auto-fire regardless of slug.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import { LandingPage, type LandingChoice } from './LandingPage'
import { HUB_CLUSTERS } from './hubClusters'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import { STORAGE_KEY_V2 } from '../../storage'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function inShell(node: ReactElement) {
  return createElement(AppShell, { route: '/', navigate: () => {}, children: node })
}

// `useRoute.ts` reads `urlShare.readUrlState()` to decide whether a share-URL
// counts as a returning user. We mock it to return null by default so the
// `?topic=` slug branch is not pre-empted by share-URL detection.
vi.mock('../../utils/urlShare', () => ({
  readUrlState: vi.fn(() => null),
}))

const NOOP = () => undefined

function makeStore(initial: Record<string, string> = {}): Storage {
  const store = { ...initial }
  return {
    get length() { return Object.keys(store).length },
    clear() { for (const k of Object.keys(store)) delete store[k] },
    getItem: (k: string) => (k in store ? store[k] : null),
    key: (i: number) => Object.keys(store)[i] ?? null,
    removeItem: (k: string) => { delete store[k] },
    setItem: (k: string, v: string) => { store[k] = v },
  }
}

function stubLocationSearch(search: string) {
  // jsdom's location is configurable; setting `window.location.search` requires
  // re-defining `location` because individual properties are read-only.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search },
  })
}

// ---------------------------------------------------------------------------
// Issue #13 — ?topic= auto-fire
// ---------------------------------------------------------------------------

describe('LandingPage — ?topic= auto-fire on first-time landing', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStore())
    stubLocationSearch('')
  })

  it('auto-fires onChoice with compare mode + visibleProducts for a known slug', () => {
    stubLocationSearch('?topic=rentenluecke-rechner')
    const onChoice = vi.fn<(c: LandingChoice) => void>()
    render(<LandingPage onChoice={onChoice} />)
    expect(onChoice).toHaveBeenCalledTimes(1)
    expect(onChoice.mock.calls[0][0]).toEqual({
      kind: 'compare',
      visibleProducts: ['etf'],
    })
  })

  it('does not auto-fire for an unknown slug — landing renders normally', () => {
    stubLocationSearch('?topic=does-not-exist')
    const onChoice = vi.fn<(c: LandingChoice) => void>()
    const { getByRole } = render(<LandingPage onChoice={onChoice} />)
    expect(onChoice).not.toHaveBeenCalled()
    // Sanity: the landing headline is rendered.
    expect(getByRole('heading', { level: 1 }).textContent).toMatch(/Rente planen/i)
  })

  it('does not auto-fire when no ?topic= is present — landing renders normally', () => {
    stubLocationSearch('')
    const onChoice = vi.fn<(c: LandingChoice) => void>()
    const { getByRole } = render(<LandingPage onChoice={onChoice} />)
    expect(onChoice).not.toHaveBeenCalled()
    expect(getByRole('heading', { level: 1 }).textContent).toMatch(/Rente planen/i)
  })

  it('does not auto-fire when other query params are present (no ?topic=)', () => {
    stubLocationSearch('?lang=de&foo=bar')
    const onChoice = vi.fn<(c: LandingChoice) => void>()
    render(<LandingPage onChoice={onChoice} />)
    expect(onChoice).not.toHaveBeenCalled()
  })
})

describe('LandingPage — saved state always wins (PRD US-18)', () => {
  beforeEach(() => {
    stubLocationSearch('')
  })

  it('does not auto-fire when v2 saved state exists, even with a matching slug', () => {
    vi.stubGlobal('localStorage', makeStore({
      [STORAGE_KEY_V2]: JSON.stringify({ schemaVersion: 2, mode: 'compare' }),
    }))
    stubLocationSearch('?topic=rentenluecke-rechner')
    const onChoice = vi.fn<(c: LandingChoice) => void>()
    render(<LandingPage onChoice={onChoice} />)
    // Saved state always wins — the landing page does NOT auto-fire even
    // with a recognised topic slug (returning user's workspace is preserved).
    expect(onChoice).not.toHaveBeenCalled()
  })

  it('does not auto-fire when v2 saved state has mode combine, even with a slug', () => {
    vi.stubGlobal('localStorage', makeStore({
      [STORAGE_KEY_V2]: JSON.stringify({ schemaVersion: 2, mode: 'combine' }),
    }))
    stubLocationSearch('?topic=rentenluecke-rechner')
    const onChoice = vi.fn<(c: LandingChoice) => void>()
    render(<LandingPage onChoice={onChoice} />)
    expect(onChoice).not.toHaveBeenCalled()
  })
})

describe('LandingPage — combine-mode preselection (issue #13 forwards visibleProducts)', () => {
  // For combine-mode the wizard reads `initialEnabledProducts` so the brief
  // requires the LandingChoice variant to carry visibleProducts through the
  // auto-fire. The `/rentenluecke-rechner` entry uses compare mode, so to
  // test the combine branch we craft a minimal contract test.
  it('LandingChoice combine variant accepts optional visibleProducts (type contract)', () => {
    const choice: LandingChoice = { kind: 'combine', visibleProducts: ['etf', 'bav'] }
    expect(choice.visibleProducts).toEqual(['etf', 'bav'])
  })

  it('LandingChoice compare variant accepts optional visibleProducts (type contract)', () => {
    const choice: LandingChoice = { kind: 'compare', visibleProducts: ['etf'] }
    expect(choice.visibleProducts).toEqual(['etf'])
  })

  it('LandingChoice variants without visibleProducts are still legal (CTA buttons)', () => {
    // Manual CTA clicks (Mein Plan / Vergleich starten) never carry seeds.
    const c1: LandingChoice = { kind: 'combine' }
    const c2: LandingChoice = { kind: 'compare' }
    expect(c1.visibleProducts).toBeUndefined()
    expect(c2.visibleProducts).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Issue #03 — homepage SEO upgrade
// ---------------------------------------------------------------------------

describe('LandingPage — hero and two-CTA layout (unchanged from #02)', () => {
  it('renders the H1 from the registry', () => {
    const { getByRole } = render(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/'].h1,
    )
  })

  it('renders the two CTAs (Mein Plan + Vergleich starten)', () => {
    const { getByText } = render(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    expect(getByText('Mein Plan erstellen')).toBeTruthy()
    expect(getByText('Vergleich starten')).toBeTruthy()
  })
})

describe('LandingPage — DisclaimerBanner first-child + session-only', () => {
  it('renders the not-advice disclaimer (compliance — every public page must)', () => {
    const { container } = render(inShell(<LandingPage onChoice={NOOP} navigate={NOOP} />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('renders the DisclaimerBanner as the literal first interactive child of the AppShell', () => {
    // Compliance guardrail (PRD line 157): disclaimer is the first thing
    // crawlers / users see. PR 1 centralised the banner in AppShell, so the
    // first-child assertion now lives at the shell level (.rw-app-shell).
    const { container } = render(inShell(<LandingPage onChoice={NOOP} navigate={NOOP} />))
    const shell = container.querySelector('.rw-app-shell')
    expect(shell).not.toBeNull()
    const firstChild = shell?.firstElementChild
    expect(firstChild?.classList.contains('disclaimer-wrap')).toBe(true)
  })

  it('uses sessionStorage (not localStorage) for the dismissal flag', () => {
    // Compliance guardrail (PRD line 157): permanent dismissal forbidden.
    // Hostile sessionStorage that records writes lets us verify the banner
    // writes its dismissal flag to sessionStorage rather than localStorage.
    const sessionWrites: Array<[string, string]> = []
    const localWrites: Array<[string, string]> = []
    const realSession = window.sessionStorage
    const realLocal = window.localStorage
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: (k: string, v: string) => sessionWrites.push([k, v]),
        removeItem: () => undefined,
      },
    })
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: (k: string, v: string) => localWrites.push([k, v]),
        removeItem: () => undefined,
      },
    })
    try {
      const { container } = render(inShell(<LandingPage onChoice={NOOP} navigate={NOOP} />))
      const dismissBtn = container.querySelector(
        'button.disclaimer-dismiss',
      ) as HTMLButtonElement | null
      expect(dismissBtn).not.toBeNull()
      dismissBtn?.click()
      expect(sessionWrites.some(([k]) => k === 'disclaimer-dismissed')).toBe(true)
      expect(localWrites.some(([k]) => k === 'disclaimer-dismissed')).toBe(false)
    } finally {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: realSession,
      })
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: realLocal,
      })
    }
  })
})

describe('LandingPage — Erkunde Themen topic-page hub (issue #03)', () => {
  it('renders five cluster headings', () => {
    const { container } = render(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    const clusterHeadings = container.querySelectorAll('.landing-hub-cluster-heading')
    expect(clusterHeadings.length).toBe(5)
    // Every cluster heading text must match the locked HUB_CLUSTERS export.
    const renderedTexts = Array.from(clusterHeadings).map((h) => h.textContent)
    for (const cluster of HUB_CLUSTERS) {
      expect(renderedTexts).toContain(cluster.heading)
    }
  })

  it('renders exactly 10 hub anchor links to the locked canonical paths', () => {
    const { container } = render(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    const hubLinks = container.querySelectorAll('a.landing-hub-link')
    expect(hubLinks.length).toBe(10)
    const expectedPaths = [
      '/rentenluecke-rechner/',
      '/rente-netto-berechnen/',
      '/bav-rechner/',
      '/etf-vs-bav/',
      '/riester-rechner/',
      '/altersvorsorgedepot-rechner/',
      '/riester-vs-altersvorsorgedepot/',
      '/basisrente-rechner/',
      '/private-rentenversicherung-rechner/',
      '/altersvorsorgeprodukte-vergleichen/',
    ]
    const actualPaths = Array.from(hubLinks).map((a) => a.getAttribute('href'))
    expect(actualPaths.sort()).toEqual(expectedPaths.sort())
  })

  it('hub links never carry a ?topic= query parameter (issue #13 sweep)', () => {
    // Anchors must point at the bare canonical path so they round-trip through
    // canonical strip. The `?topic=` deep-link mechanism (issue #13) operates
    // by query param on / only — hub anchors stay bare.
    const { container } = render(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    const hubLinks = container.querySelectorAll('a.landing-hub-link')
    for (const link of Array.from(hubLinks)) {
      const href = link.getAttribute('href') ?? ''
      expect(href).not.toContain('?topic=')
      expect(href).not.toContain('?s=')
    }
  })

  it('hub renders below the two CTAs (DOM order)', () => {
    // Locked decision: hub appears below the two existing CTAs and above the
    // LegalFooter. We verify DOM order by index.
    const { container } = render(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    const main = container.querySelector('.landing-main')
    expect(main).not.toBeNull()
    const cards = main?.querySelector('.landing-cards')
    const hub = main?.querySelector('.landing-hub')
    expect(cards).not.toBeNull()
    expect(hub).not.toBeNull()
    if (cards && hub) {
      const cardsIndex = Array.from(main!.children).indexOf(cards)
      const hubIndex = Array.from(main!.children).indexOf(hub)
      expect(hubIndex).toBeGreaterThan(cardsIndex)
    }
  })

  it('hub anchor labels avoid winner / recommendation framing', () => {
    // Anchor copy guardrail: descriptive, not advisory. We forbid the German
    // verbs that would imply a recommendation. Anchors describe targets;
    // body-copy guardrails on individual topic pages are stricter still.
    const forbidden = [/\bbesser als\b/i, /\bempfohlen\b/i, /\blohnt sich\b/i]
    for (const cluster of HUB_CLUSTERS) {
      for (const link of cluster.links) {
        for (const pattern of forbidden) {
          expect(link.label, `forbidden phrase in "${link.label}"`).not.toMatch(pattern)
        }
      }
    }
  })
})

describe('LandingPage — three JSON-LD blocks render inline (issue #03)', () => {
  it('renders exactly three <script type="application/ld+json"> blocks', () => {
    const html = renderToString(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    const matches = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g)
    expect(matches?.length).toBe(3)
  })

  it('each block parses as valid JSON-LD', () => {
    const html = renderToString(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    const matches =
      html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) ?? []
    expect(matches.length).toBe(3)
    for (const match of matches) {
      const inner = match
        .replace(/^<script type="application\/ld\+json">\s*/, '')
        .replace(/\s*<\/script>$/, '')
      expect(() => JSON.parse(inner)).not.toThrow()
    }
  })

  it('emits one WebSite, one Organization, and one WebApplication block', () => {
    const html = renderToString(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    const matches =
      html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) ?? []
    const types = matches
      .map((m) => {
        const inner = m
          .replace(/^<script type="application\/ld\+json">\s*/, '')
          .replace(/\s*<\/script>$/, '')
        return JSON.parse(inner)['@type'] as string
      })
      .sort()
    expect(types).toEqual(['Organization', 'WebApplication', 'WebSite'])
  })

  it('Organization block carries name + legalName + url + email + founder; NO address', () => {
    const html = renderToString(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    const matches =
      html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) ?? []
    const org = matches
      .map((m) => {
        const inner = m
          .replace(/^<script type="application\/ld\+json">\s*/, '')
          .replace(/\s*<\/script>$/, '')
        return JSON.parse(inner)
      })
      .find((d) => d['@type'] === 'Organization')
    expect(org).toBeDefined()
    expect(org.name).toBe('RentenWiki.de')
    expect(org.legalName).toBe('Peter Hartwieg')
    expect(org.url).toBe('https://rentenwiki.de/')
    expect(org.email).toBe('peter@hartwieg.com')
    expect(org.founder).toBeDefined()
    expect(org.founder['@type']).toBe('Person')
    expect(org.founder.name).toBe('Peter Hartwieg')
    expect(org.founder.email).toBe('peter@hartwieg.com')
    // The locked decision: no `address` field (Impressum publishes it under
    // §5 TMG; SEO has no local-business use case).
    expect(org.address).toBeUndefined()
  })

  it('WebSite block carries name + url + inLanguage; NO potentialAction', () => {
    const html = renderToString(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    const matches =
      html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) ?? []
    const site = matches
      .map((m) => {
        const inner = m
          .replace(/^<script type="application\/ld\+json">\s*/, '')
          .replace(/\s*<\/script>$/, '')
        return JSON.parse(inner)
      })
      .find((d) => d['@type'] === 'WebSite')
    expect(site).toBeDefined()
    expect(site.name).toBe('RentenWiki.de')
    expect(site.url).toBe('https://rentenwiki.de/')
    expect(site.inLanguage).toBe('de-DE')
    // No site search → no SearchAction. Forbids over-claiming functionality.
    expect(site.potentialAction).toBeUndefined()
  })

  it('WebApplication block carries the calculator-specific fields visible on the page', () => {
    const html = renderToString(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    const matches =
      html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) ?? []
    const app = matches
      .map((m) => {
        const inner = m
          .replace(/^<script type="application\/ld\+json">\s*/, '')
          .replace(/\s*<\/script>$/, '')
        return JSON.parse(inner)
      })
      .find((d) => d['@type'] === 'WebApplication')
    expect(app).toBeDefined()
    const entry = publicRouteRegistry['/']
    expect(app.name).toBe(entry.title)
    expect(app.description).toBe(entry.summary)
    expect(app.url).toBe('https://rentenwiki.de/')
    expect(app.inLanguage).toBe('de-DE')
    expect(app.dateModified).toBe(entry.dateModified)
    expect(app.applicationCategory).toBe('FinanceApplication')
    expect(app.operatingSystem).toBe('Web')
    expect(app.offers).toBeDefined()
    expect(app.offers['@type']).toBe('Offer')
    expect(app.offers.price).toBe('0')
    expect(app.offers.priceCurrency).toBe('EUR')
  })
})

describe('LandingPage — LegalFooter (license posture visible on prerender)', () => {
  it('renders the LegalFooter so the non-commercial license posture is visible', () => {
    const html = renderToString(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    expect(html).toContain('PolyForm Noncommercial 1.0.0')
    expect(html).toContain('/impressum')
    expect(html).toContain('/datenschutz')
  })
})

describe('LandingPage — brand language audit', () => {
  it('user-visible homepage text uses RentenWiki.de as the brand name (not Rentenrechner as brand)', () => {
    // Per CLAUDE.md: public-facing brand is RentenWiki.de. "Rentenrechner" may
    // appear as a product-category descriptor / SEO keyword in copy (subline),
    // but must not replace "RentenWiki" as the brand name in footers / legal.
    const html = renderToString(<LandingPage onChoice={NOOP} navigate={NOOP} />)
    // RentenWiki.de must be present (in LegalFooter JSON-LD / structured data).
    expect(html).toContain('RentenWiki.de')
  })
})

describe('LandingPage — prerender resilience', () => {
  it('renders without throwing when navigate prop is omitted (SSG path)', () => {
    expect(() =>
      renderToString(<LandingPage onChoice={NOOP} />),
    ).not.toThrow()
  })

  it('renders without throwing when localStorage access throws', () => {
    // Acceptance criteria: prerender must not depend on localStorage.
    const originalLocalStorage = window.localStorage
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
      clear: () => { throw new Error('blocked') },
      key: () => { throw new Error('blocked') },
      length: 0,
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: blocked,
    })
    try {
      expect(() =>
        renderToString(<LandingPage onChoice={NOOP} navigate={NOOP} />),
      ).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      })
    }
  })
})

describe('HUB_CLUSTERS — exported registry (single source of truth)', () => {
  it('exposes 5 clusters and 10 links total', () => {
    expect(HUB_CLUSTERS.length).toBe(5)
    const total = HUB_CLUSTERS.reduce((acc, c) => acc + c.links.length, 0)
    expect(total).toBe(10)
  })

  it('every link href is a valid canonical path with trailing slash (no query, no fragment)', () => {
    // Trailing slash matches what CF Pages serves natively from
    // dist/<route>/index.html — see buildCanonicalUrl for the policy.
    for (const cluster of HUB_CLUSTERS) {
      for (const link of cluster.links) {
        expect(link.href).toMatch(/^\/[a-z][a-z0-9-]*\/$/)
      }
    }
  })

  it('every link label is descriptive German (length and forbidden phrases)', () => {
    for (const cluster of HUB_CLUSTERS) {
      for (const link of cluster.links) {
        expect(link.label.length).toBeGreaterThan(5)
        expect(link.label.length).toBeLessThan(60)
        expect(link.label).not.toMatch(/Rentenrechner/i)
        expect(link.label).not.toMatch(/^mehr$/i)
        expect(link.label).not.toMatch(/^weiterlesen$/i)
        expect(link.label).not.toMatch(/^klick(en)?\b/i)
      }
    }
  })
})
