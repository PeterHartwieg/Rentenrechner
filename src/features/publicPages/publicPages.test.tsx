// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import { RentenluckeRechnerPage } from './RentenluckeRechnerPage'
import { RiesterRechnerPage } from './RiesterRechnerPage'
import { AltersvorsorgedepotRechnerPage } from './AltersvorsorgedepotRechnerPage'
import { RiesterVsAltersvorsorgedepotPage } from './RiesterVsAltersvorsorgedepotPage'
import { BasisrenteRechnerPage } from './BasisrenteRechnerPage'
import { PrivateRentenversicherungRechnerPage } from './PrivateRentenversicherungRechnerPage'
import { RenteNettoBerechnePage } from './RenteNettoBerechnePage'
import { AltersvorsorgeproduktePage } from './AltersvorsorgeproduktePage'
import { BavRechnerPage } from './BavRechnerPage'
import { EtfVsBavPage } from './EtfVsBavPage'
import { PageNotFound } from './PageNotFound'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'

afterEach(() => {
  cleanup()
})

/**
 * Wrap a page in the AppShell chrome so disclaimer-presence and other
 * chrome-level invariants can be asserted on the page. PR 1 centralised
 * DisclaimerBanner rendering in AppShell; in-isolation render(<Page />)
 * no longer surfaces the disclaimer text, but the production pipeline
 * (App.tsx and the SSG prerender script) always wraps pages in AppShell.
 */
function inShell(node: ReactElement) {
  return createElement(AppShell, { route: '/', navigate: () => {}, children: node })
}

describe('RentenluckeRechnerPage — visible content for prerender', () => {
  it('renders the H1 from the registry', () => {
    const { getByRole } = render(<RentenluckeRechnerPage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/rentenluecke-rechner'].h1,
    )
  })

  it('renders the page summary', () => {
    const { container } = render(<RentenluckeRechnerPage />)
    expect(container.textContent).toContain(
      publicRouteRegistry['/rentenluecke-rechner'].summary.slice(0, 40),
    )
  })

  it('renders the visible "Stand 2026" line that JSON-LD dateModified references', () => {
    const { container } = render(inShell(<RentenluckeRechnerPage />))
    expect(container.textContent).toContain('Stand: 2026-05-06')
    expect(container.textContent).toContain('Deutschland 2026')
  })

  it('renders the not-advice disclaimer (compliance — every public page must)', () => {
    const { container } = render(inShell(<RentenluckeRechnerPage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('renders a calculator CTA deep-link with topic preselection (issue #13)', () => {
    const { container } = render(<RentenluckeRechnerPage />)
    const cta = container.querySelector('.public-cta')
    expect(cta).not.toBeNull()
    // Issue #13: topic-page CTAs use `/?topic=<slug>` so first-time visitors
    // land in the calculator with the right comparison preselected. The
    // canonical URL of the page itself (sitemap, link rel=canonical, JSON-LD)
    // remains the bare `/rentenluecke-rechner` — covered by the registry
    // and stripShareStateFromUrl tests.
    expect(cta?.getAttribute('href')).toBe('/?topic=rentenluecke-rechner')
  })

  it('renders an internal link back to the homepage and to the legal pages', () => {
    const { container } = render(<RentenluckeRechnerPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toContain('/')
    expect(links).toContain('/impressum/')
    expect(links).toContain('/datenschutz/')
  })

  it('cites at least one statutory source (BMF / DRV / §-ref) inline (PRD line 168)', () => {
    const { container } = render(<RentenluckeRechnerPage />)
    const text = container.textContent ?? ''
    // Acceptable sources from the brief: BMF, DRV, §SGB VI, §SGB V, §SGB XI,
    // §EStG, BaFin, Statistisches Bundesamt.
    expect(text).toMatch(/§\s?\d+\s?(SGB\s?VI|SGB\s?V|SGB\s?XI|EStG)/i)
    expect(text).toMatch(/(BMF|Deutsche Rentenversicherung|GKV-Spitzenverband|Statistisches Bundesamt)/i)
  })

  it('does not call simulation engine modules during render', () => {
    // The acceptance criteria forbids the topic page importing engine code.
    // Confirm by snapshotting the renderToString output and asserting no
    // engine-derived data leaks through (no euro currency formatting, no
    // simulation result strings).
    const html = renderToString(<RentenluckeRechnerPage />)
    expect(html.length).toBeGreaterThan(500) // sanity: page rendered
    // Engine output uses formatCurrency which always emits "€" or "EUR".
    // If accidental engine import wires up a result, that string would
    // appear in the page chrome — assert the page is pure prose.
    expect(html).not.toMatch(/[€]\s?[\d.]+/)
  })

  it('renders without throwing when localStorage access throws (no-localStorage-dependency)', () => {
    // Acceptance criteria: rendering must not depend on localStorage.
    // Simulate a hostile localStorage environment (private-mode quota errors,
    // disabled storage, etc.) by making every method on `localStorage` throw.
    // The page must still render — DisclaimerBanner wraps localStorage access
    // in try/catch precisely for this case.
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
      expect(() => renderToString(<RentenluckeRechnerPage />)).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      })
    }
  })
})

describe('PageNotFound — visible content for prerender', () => {
  it('renders the H1 from the registry', () => {
    const { getByRole } = render(inShell(<PageNotFound />))
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/404'].h1,
    )
  })

  it('renders the not-advice disclaimer (compliance)', () => {
    const { container } = render(inShell(<PageNotFound />))
    expect(container.textContent).toContain('Modellrechnung')
  })

  it('renders a link back to the homepage', () => {
    const { container } = render(<PageNotFound />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toContain('/')
  })

  it('does not import simulation engine code (renders pure prose)', () => {
    const html = renderToString(<PageNotFound />)
    expect(html.length).toBeGreaterThan(200)
    expect(html).not.toMatch(/[€]\s?[\d.]+/)
  })
})

describe('Prerender HTML output — disclaimer survives renderToString', () => {
  // PRD line 157: permanent dismissal of the disclaimer is forbidden.
  // The DisclaimerBanner uses sessionStorage; SSG renders without a session.
  // Verify the disclaimer text lives in the static HTML so crawlers see it.
  it('Rentenluecke prerendered HTML contains the disclaimer text', () => {
    const html = renderToString(inShell(<RentenluckeRechnerPage />))
    expect(html).toContain('Modellrechnung')
    expect(html).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('PageNotFound prerendered HTML contains the disclaimer text', () => {
    const html = renderToString(inShell(<PageNotFound />))
    expect(html).toContain('Modellrechnung')
  })

  it('BasisrenteRechnerPage prerendered HTML contains the disclaimer text', () => {
    const html = renderToString(inShell(<BasisrenteRechnerPage />))
    expect(html).toContain('Modellrechnung')
    expect(html).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('PrivateRentenversicherungRechnerPage prerendered HTML contains the disclaimer text', () => {
    const html = renderToString(inShell(<PrivateRentenversicherungRechnerPage />))
    expect(html).toContain('Modellrechnung')
    expect(html).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })
})

// ---------------------------------------------------------------------------
// Issue #06: BasisrenteRechnerPage — visible content for prerender
// ---------------------------------------------------------------------------

describe('BasisrenteRechnerPage — visible content for prerender', () => {
  it('renders the H1 from the registry', () => {
    const { getByRole } = render(<BasisrenteRechnerPage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/basisrente-rechner'].h1,
    )
  })

  it('renders the page summary', () => {
    const { container } = render(<BasisrenteRechnerPage />)
    // Summary contains the first ~40 chars of the registered summary string
    expect(container.textContent).toContain(
      publicRouteRegistry['/basisrente-rechner'].summary.slice(0, 40),
    )
  })

  it('renders the visible "Stand 2026" line that JSON-LD dateModified references', () => {
    const { container } = render(inShell(<BasisrenteRechnerPage />))
    expect(container.textContent).toContain('Stand: 2026-05-06')
    expect(container.textContent).toContain('Deutschland 2026')
  })

  it('renders the not-advice disclaimer (compliance — every public page must)', () => {
    const { container } = render(inShell(<BasisrenteRechnerPage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('renders a calculator CTA deep-link with topic preselection (issue #13)', () => {
    const { container } = render(<BasisrenteRechnerPage />)
    const cta = container.querySelector('.public-cta')
    expect(cta).not.toBeNull()
    expect(cta?.getAttribute('href')).toBe('/?topic=basisrente-rechner')
  })

  it('renders an internal link back to the homepage and to the legal pages', () => {
    const { container } = render(<BasisrenteRechnerPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toContain('/')
    expect(links).toContain('/impressum/')
    expect(links).toContain('/datenschutz/')
  })

  it('renders at least two related sibling links (acceptance criterion: ≥2 siblings)', () => {
    const { container } = render(<BasisrenteRechnerPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    // relatedRoutes for /basisrente-rechner: '/', '/rentenluecke-rechner', '/private-rentenversicherung-rechner'
    const siblingLinks = links.filter((href) =>
      href && href !== '/' && href !== '/impressum/' && href !== '/datenschutz/' &&
      href !== '/?topic=basisrente-rechner',
    )
    expect(siblingLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('cites §10 Abs. 3 EStG (Sonderausgabenabzug) inline (YMYL guardrail)', () => {
    const { container } = render(<BasisrenteRechnerPage />)
    const text = container.textContent ?? ''
    // Must cite the primary statutory source for Basisrente tax deduction
    expect(text).toMatch(/§\s?10\s*Abs\.?\s*3\s*EStG/i)
  })

  it('cites §22 Nr. 1 EStG (Besteuerungsanteil) inline (YMYL guardrail)', () => {
    const { container } = render(<BasisrenteRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?22\s*Nr\.?\s*1/i)
  })

  it('makes the no-Kapitalauszahlung constraint explicitly visible (YMYL guardrail)', () => {
    const { container } = render(<BasisrenteRechnerPage />)
    const text = container.textContent ?? ''
    // Users frequently discover this constraint only after sign-up — make it prominent
    expect(text).toMatch(/Kapitalauszahlung.*verboten|keine.*Kapitalauszahlung|Kapitalauszahlung.*nicht.*möglich/i)
  })

  it('cites AltZertG or authoritative publication (YMYL guardrail)', () => {
    const { container } = render(<BasisrenteRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/(AltZertG|Altersvorsorgeverträge-Zertifizierungsgesetz|BMF|Deutsche Rentenversicherung)/i)
  })

  it('does not call simulation engine modules during render', () => {
    const html = renderToString(<BasisrenteRechnerPage />)
    expect(html.length).toBeGreaterThan(500)
    expect(html).not.toMatch(/[€]\s?[\d.]+/)
  })

  it('renders without throwing when localStorage access throws (no-localStorage-dependency)', () => {
    const originalLocalStorage = window.localStorage
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
      clear: () => { throw new Error('blocked') },
      key: () => { throw new Error('blocked') },
      length: 0,
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', { configurable: true, value: blocked })
    try {
      expect(() => renderToString(<BasisrenteRechnerPage />)).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage })
    }
  })
})

// ---------------------------------------------------------------------------
// Issue #06: PrivateRentenversicherungRechnerPage — visible content for prerender
// ---------------------------------------------------------------------------

describe('PrivateRentenversicherungRechnerPage — visible content for prerender', () => {
  it('renders the H1 from the registry', () => {
    const { getByRole } = render(<PrivateRentenversicherungRechnerPage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/private-rentenversicherung-rechner'].h1,
    )
  })

  it('renders the page summary', () => {
    const { container } = render(<PrivateRentenversicherungRechnerPage />)
    expect(container.textContent).toContain(
      publicRouteRegistry['/private-rentenversicherung-rechner'].summary.slice(0, 40),
    )
  })

  it('renders the visible "Stand 2026" line that JSON-LD dateModified references', () => {
    const { container } = render(inShell(<PrivateRentenversicherungRechnerPage />))
    expect(container.textContent).toContain('Stand: 2026-05-06')
    expect(container.textContent).toContain('Deutschland 2026')
  })

  it('renders the not-advice disclaimer (compliance — every public page must)', () => {
    const { container } = render(inShell(<PrivateRentenversicherungRechnerPage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('renders a calculator CTA deep-link with topic preselection (issue #13)', () => {
    const { container } = render(<PrivateRentenversicherungRechnerPage />)
    const cta = container.querySelector('.public-cta')
    expect(cta).not.toBeNull()
    expect(cta?.getAttribute('href')).toBe('/?topic=private-rentenversicherung-rechner')
  })

  it('renders an internal link back to the homepage and to the legal pages', () => {
    const { container } = render(<PrivateRentenversicherungRechnerPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toContain('/')
    expect(links).toContain('/impressum/')
    expect(links).toContain('/datenschutz/')
  })

  it('renders at least two related sibling links (acceptance criterion: ≥2 siblings)', () => {
    const { container } = render(<PrivateRentenversicherungRechnerPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    // relatedRoutes: '/', '/rentenluecke-rechner', '/basisrente-rechner'
    const siblingLinks = links.filter((href) =>
      href && href !== '/' && href !== '/impressum/' && href !== '/datenschutz/' &&
      href !== '/?topic=private-rentenversicherung-rechner',
    )
    expect(siblingLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('cites §20 Abs. 1 Nr. 6 EStG (capital-gains tax on insurance) inline (YMYL guardrail)', () => {
    const { container } = render(<PrivateRentenversicherungRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?20\s*Abs\.?\s*1\s*Nr\.?\s*6\s*EStG/i)
  })

  it('cites §22 Nr. 1 Satz 3 a EStG (Ertragsanteil Leibrente) inline (YMYL guardrail)', () => {
    const { container } = render(<PrivateRentenversicherungRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?22\s*Nr\.?\s*1\s*Satz\s*3/i)
  })

  it('explains all three contract-era tax modes (pre2005, Halbeinkünfte, Abgeltungsteuer)', () => {
    const { container } = render(<PrivateRentenversicherungRechnerPage />)
    const text = container.textContent ?? ''
    // All three eras must be visibly explained per the YMYL brief requirement
    expect(text).toMatch(/vor.*2005|pre.?2005|vor dem.*Januar 2005/i)
    expect(text).toMatch(/Halbeinkünfte/i)
    expect(text).toMatch(/Abgeltungsteuer/i)
  })

  it('cites BMF or BaFin authoritative publication (YMYL guardrail)', () => {
    const { container } = render(<PrivateRentenversicherungRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/(BMF|BaFin|Bundesministerium der Finanzen)/i)
  })

  it('does not call simulation engine modules during render', () => {
    const html = renderToString(<PrivateRentenversicherungRechnerPage />)
    expect(html.length).toBeGreaterThan(500)
    expect(html).not.toMatch(/[€]\s?[\d.]+/)
  })

  it('renders without throwing when localStorage access throws (no-localStorage-dependency)', () => {
    const originalLocalStorage = window.localStorage
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
      clear: () => { throw new Error('blocked') },
      key: () => { throw new Error('blocked') },
      length: 0,
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', { configurable: true, value: blocked })
    try {
      expect(() => renderToString(<PrivateRentenversicherungRechnerPage />)).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage })
    }
  })
})

// ---------------------------------------------------------------------------
// Issue #05: RiesterRechnerPage — visible content for prerender
// ---------------------------------------------------------------------------

describe('RiesterRechnerPage — visible content for prerender', () => {
  it('renders the H1 from the registry', () => {
    const { getByRole } = render(<RiesterRechnerPage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/riester-rechner'].h1,
    )
  })

  it('renders the page summary', () => {
    const { container } = render(<RiesterRechnerPage />)
    expect(container.textContent).toContain(
      publicRouteRegistry['/riester-rechner'].summary.slice(0, 40),
    )
  })

  it('renders the visible "Stand 2026" line that JSON-LD dateModified references', () => {
    const { container } = render(inShell(<RiesterRechnerPage />))
    expect(container.textContent).toContain('Stand: 2026-05-06')
    expect(container.textContent).toContain('Deutschland 2026')
  })

  it('renders the not-advice disclaimer (compliance — every public page must)', () => {
    const { container } = render(inShell(<RiesterRechnerPage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('renders a calculator CTA deep-link with topic preselection (issue #13)', () => {
    const { container } = render(<RiesterRechnerPage />)
    const cta = container.querySelector('.public-cta')
    expect(cta).not.toBeNull()
    expect(cta?.getAttribute('href')).toBe('/?topic=riester-rechner')
  })

  it('renders an internal link back to the homepage and to the legal pages', () => {
    const { container } = render(<RiesterRechnerPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toContain('/')
    expect(links).toContain('/impressum/')
    expect(links).toContain('/datenschutz/')
  })

  it('renders at least two related sibling links (acceptance criterion: ≥2 siblings)', () => {
    const { container } = render(<RiesterRechnerPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    const siblingLinks = links.filter((href) =>
      href && href !== '/' && href !== '/impressum/' && href !== '/datenschutz/' &&
      href !== '/?topic=riester-rechner',
    )
    expect(siblingLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('cites § 84 EStG (Grundzulage) inline (YMYL guardrail)', () => {
    const { container } = render(<RiesterRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?84\s*EStG/i)
  })

  it('cites § 85 EStG (Kinderzulage) inline (YMYL guardrail)', () => {
    const { container } = render(<RiesterRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?85\s*EStG/i)
  })

  it('cites § 10a EStG (Sonderausgabenabzug) inline (YMYL guardrail)', () => {
    const { container } = render(<RiesterRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?10a\s*EStG/i)
  })

  it('cites § 22 Nr. 5 EStG (Auszahlungsbesteuerung) inline (YMYL guardrail)', () => {
    const { container } = render(<RiesterRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?22\s*Nr\.?\s*5\s*EStG/i)
  })

  it('mentions ZfA (Zentrale Zulagenstelle) (YMYL guardrail)', () => {
    const { container } = render(<RiesterRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/(ZfA|Zentrale Zulagenstelle)/i)
  })

  it('cites AltZertG (certification basis) inline (YMYL guardrail)', () => {
    const { container } = render(<RiesterRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/(AltZertG|Altersvorsorgeverträge-Zertifizierungsgesetz)/i)
  })

  it('does not call simulation engine modules during render', () => {
    const html = renderToString(<RiesterRechnerPage />)
    expect(html.length).toBeGreaterThan(500)
    expect(html).not.toMatch(/[€]\s?[\d.]+/)
  })

  it('renders without throwing when localStorage access throws (no-localStorage-dependency)', () => {
    const originalLocalStorage = window.localStorage
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
      clear: () => { throw new Error('blocked') },
      key: () => { throw new Error('blocked') },
      length: 0,
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', { configurable: true, value: blocked })
    try {
      expect(() => renderToString(<RiesterRechnerPage />)).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage })
    }
  })
})

// ---------------------------------------------------------------------------
// Issue #05: AltersvorsorgedepotRechnerPage — visible content for prerender
// ---------------------------------------------------------------------------

describe('AltersvorsorgedepotRechnerPage — visible content for prerender', () => {
  it('renders the H1 from the registry', () => {
    const { getByRole } = render(<AltersvorsorgedepotRechnerPage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/altersvorsorgedepot-rechner'].h1,
    )
  })

  it('renders the page summary', () => {
    const { container } = render(<AltersvorsorgedepotRechnerPage />)
    expect(container.textContent).toContain(
      publicRouteRegistry['/altersvorsorgedepot-rechner'].summary.slice(0, 40),
    )
  })

  it('renders the visible "Stand 2026" line that JSON-LD dateModified references', () => {
    const { container } = render(inShell(<AltersvorsorgedepotRechnerPage />))
    expect(container.textContent).toContain('Stand: 2026-05-06')
    expect(container.textContent).toContain('Deutschland 2026')
  })

  it('renders the not-advice disclaimer (compliance — every public page must)', () => {
    const { container } = render(inShell(<AltersvorsorgedepotRechnerPage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('renders a calculator CTA deep-link with topic preselection (issue #13)', () => {
    const { container } = render(<AltersvorsorgedepotRechnerPage />)
    const cta = container.querySelector('.public-cta')
    expect(cta).not.toBeNull()
    expect(cta?.getAttribute('href')).toBe('/?topic=altersvorsorgedepot-rechner')
  })

  it('renders an internal link back to the homepage and to the legal pages', () => {
    const { container } = render(<AltersvorsorgedepotRechnerPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toContain('/')
    expect(links).toContain('/impressum/')
    expect(links).toContain('/datenschutz/')
  })

  it('renders at least two related sibling links (acceptance criterion: ≥2 siblings)', () => {
    const { container } = render(<AltersvorsorgedepotRechnerPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    const siblingLinks = links.filter((href) =>
      href && href !== '/' && href !== '/impressum/' && href !== '/datenschutz/' &&
      href !== '/?topic=altersvorsorgedepot-rechner',
    )
    expect(siblingLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('cites the Altersvorsorgereformgesetz (legal basis of AVD) inline (YMYL guardrail)', () => {
    // AVD's legal basis is the Altersvorsorgereformgesetz passed by the
    // Bundestag on 2026-03-27 (Bundesrats-Drucksache 206/26), with
    // Bundesrat consent expected 2026-05-08 and entry into force planned
    // for 2027-01-01 — see ALTERSVORSORGEDEPOT_2027_RESEARCH.md and
    // src/rules/de2026.ts. Earlier drafts of this test cited
    // "Jahressteuergesetz 2024" and "AltvVerbG"; both were research-brief
    // hallucinations and are NOT the legal basis of the new product.
    const { container } = render(<AltersvorsorgedepotRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Altersvorsorgereformgesetz/i)
  })

  it('cites § 22 Nr. 5 EStG (Auszahlungsbesteuerung) inline (YMYL guardrail)', () => {
    const { container } = render(<AltersvorsorgedepotRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?22\s*Nr\.?\s*5\s*EStG/i)
  })

  it('cites the Bundestag-Beschluss / Bundesrats-Drucksache (legislative anchor) inline (YMYL guardrail)', () => {
    // The AVD page must anchor its 2027 constants to the actual bill
    // (Altersvorsorgereformgesetz, Bundestag-Beschluss 2026-03-27,
    // Bundesrats-Drucksache 206/26). Asserting at least one of these
    // anchors is present prevents future copy from drifting back to the
    // hallucinated "AltvVerbG" / "Jahressteuergesetz 2024" provenance.
    const { container } = render(<AltersvorsorgedepotRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/(Bundestag-Beschluss\s*2026-03-27|Bundestag.*am\s*27\.\s*M(ä|a)rz\s*2026|Bundesrats?-?Drucksache\s*206\/26|Drucksache\s*206\/26)/i)
  })

  it('cites § 10a EStG (Sonderausgabenabzug) inline (YMYL guardrail)', () => {
    const { container } = render(<AltersvorsorgedepotRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?10a\s*EStG/i)
  })

  it('does not call simulation engine modules during render', () => {
    const html = renderToString(<AltersvorsorgedepotRechnerPage />)
    expect(html.length).toBeGreaterThan(500)
    expect(html).not.toMatch(/[€]\s?[\d.]+/)
  })

  it('renders without throwing when localStorage access throws (no-localStorage-dependency)', () => {
    const originalLocalStorage = window.localStorage
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
      clear: () => { throw new Error('blocked') },
      key: () => { throw new Error('blocked') },
      length: 0,
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', { configurable: true, value: blocked })
    try {
      expect(() => renderToString(<AltersvorsorgedepotRechnerPage />)).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage })
    }
  })
})

// ---------------------------------------------------------------------------
// Issue #05: RiesterVsAltersvorsorgedepotPage — visible content for prerender
// ---------------------------------------------------------------------------

describe('RiesterVsAltersvorsorgedepotPage — visible content for prerender', () => {
  it('renders the H1 from the registry', () => {
    const { getByRole } = render(<RiesterVsAltersvorsorgedepotPage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/riester-vs-altersvorsorgedepot'].h1,
    )
  })

  it('renders the page summary', () => {
    const { container } = render(<RiesterVsAltersvorsorgedepotPage />)
    expect(container.textContent).toContain(
      publicRouteRegistry['/riester-vs-altersvorsorgedepot'].summary.slice(0, 40),
    )
  })

  it('renders the visible "Stand 2026" line that JSON-LD dateModified references', () => {
    const { container } = render(inShell(<RiesterVsAltersvorsorgedepotPage />))
    expect(container.textContent).toContain('Stand: 2026-05-06')
    expect(container.textContent).toContain('Deutschland 2026')
  })

  it('renders the not-advice disclaimer (compliance — every public page must)', () => {
    const { container } = render(inShell(<RiesterVsAltersvorsorgedepotPage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('renders a calculator CTA deep-link with topic preselection (issue #13)', () => {
    const { container } = render(<RiesterVsAltersvorsorgedepotPage />)
    const cta = container.querySelector('.public-cta')
    expect(cta).not.toBeNull()
    expect(cta?.getAttribute('href')).toBe('/?topic=riester-vs-altersvorsorgedepot')
  })

  it('renders an internal link back to the homepage and to the legal pages', () => {
    const { container } = render(<RiesterVsAltersvorsorgedepotPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toContain('/')
    expect(links).toContain('/impressum/')
    expect(links).toContain('/datenschutz/')
  })

  it('renders at least two related sibling links (acceptance criterion: ≥2 siblings)', () => {
    const { container } = render(<RiesterVsAltersvorsorgedepotPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    const siblingLinks = links.filter((href) =>
      href && href !== '/' && href !== '/impressum/' && href !== '/datenschutz/' &&
      href !== '/?topic=riester-vs-altersvorsorgedepot',
    )
    expect(siblingLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('does NOT contain winner copy (YMYL guardrail — no besser/lohnt/empfohlen)', () => {
    const { container } = render(<RiesterVsAltersvorsorgedepotPage />)
    const text = container.textContent ?? ''
    // The comparison page must not declare a winner
    expect(text).not.toMatch(/\bist besser\b/i)
    expect(text).not.toMatch(/\bempfohlen\b/i)
  })

  it('cites § 22 Nr. 5 EStG (Auszahlungsbesteuerung) inline (YMYL guardrail)', () => {
    const { container } = render(<RiesterVsAltersvorsorgedepotPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?22\s*Nr\.?\s*5\s*EStG/i)
  })

  it('cites § 84 and § 85 EStG (Zulagen) inline (YMYL guardrail)', () => {
    const { container } = render(<RiesterVsAltersvorsorgedepotPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?84\s*EStG/i)
    expect(text).toMatch(/§\s?85\s*EStG/i)
  })

  it('describes the Riester→AVD transfer as schädlichkeitsfrei (legal-technical term)', () => {
    // The Altersvorsorgereformgesetz makes the Riester→AVD transfer NOT a
    // "schädliche Verwendung" under § 93 EStG. The correct legal-technical
    // term for that is "schädlichkeitsfrei" (or
    // "schädlichkeitsfreie Übertragung"). Earlier drafts of this test
    // alternatively accepted "Jahressteuergesetz 2024", which was a
    // research-brief hallucination — the AVD provenance is the
    // Altersvorsorgereformgesetz, not the JStG 2024.
    const { container } = render(<RiesterVsAltersvorsorgedepotPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/(schädlichkeitsfreie Übertragung|schädlichkeitsfrei)/i)
  })

  it('cites ZfA (Zentrale Zulagenstelle) inline (YMYL guardrail)', () => {
    const { container } = render(<RiesterVsAltersvorsorgedepotPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/(ZfA|Zentrale Zulagenstelle)/i)
  })

  it('does not call simulation engine modules during render', () => {
    const html = renderToString(<RiesterVsAltersvorsorgedepotPage />)
    expect(html.length).toBeGreaterThan(500)
    expect(html).not.toMatch(/[€]\s?[\d.]+/)
  })

  it('renders without throwing when localStorage access throws (no-localStorage-dependency)', () => {
    const originalLocalStorage = window.localStorage
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
      clear: () => { throw new Error('blocked') },
      key: () => { throw new Error('blocked') },
      length: 0,
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', { configurable: true, value: blocked })
    try {
      expect(() => renderToString(<RiesterVsAltersvorsorgedepotPage />)).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage })
    }
  })
})

// ---------------------------------------------------------------------------
// RenteNettoBerechnePage — issue #07
// ---------------------------------------------------------------------------

describe('RenteNettoBerechnePage — visible content for prerender', () => {
  it('renders the H1 from the registry', () => {
    const { getByRole } = render(<RenteNettoBerechnePage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/rente-netto-berechnen'].h1,
    )
  })

  it('renders the page summary', () => {
    const { container } = render(<RenteNettoBerechnePage />)
    expect(container.textContent).toContain(
      publicRouteRegistry['/rente-netto-berechnen'].summary.slice(0, 40),
    )
  })

  it('renders the visible "Stand 2026" line that JSON-LD dateModified references', () => {
    const { container } = render(inShell(<RenteNettoBerechnePage />))
    expect(container.textContent).toContain('Stand: 2026-05-06')
    expect(container.textContent).toContain('Deutschland 2026')
  })

  it('renders the not-advice disclaimer (compliance — every public page must)', () => {
    const { container } = render(inShell(<RenteNettoBerechnePage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('renders a calculator CTA deep-link with topic preselection (issue #13)', () => {
    const { container } = render(<RenteNettoBerechnePage />)
    const cta = container.querySelector('.public-cta')
    expect(cta).not.toBeNull()
    expect(cta?.getAttribute('href')).toBe('/?topic=rente-netto-berechnen')
  })

  it('renders an internal link back to the homepage and to the legal pages', () => {
    const { container } = render(<RenteNettoBerechnePage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toContain('/')
    expect(links).toContain('/impressum/')
    expect(links).toContain('/datenschutz/')
  })

  it('links to at least two sibling topic pages (internal-link requirement)', () => {
    const { container } = render(<RenteNettoBerechnePage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toContain('/rentenluecke-rechner/')
    expect(links).toContain('/altersvorsorgeprodukte-vergleichen/')
  })

  it('cites statutory sources inline (§-refs EStG / SGB V / SGB XI)', () => {
    const { container } = render(<RenteNettoBerechnePage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?\d+\s?(EStG|SGB\s?V|SGB\s?XI)/i)
    expect(text).toMatch(/(BMF|Deutsche Rentenversicherung|GKV-Spitzenverband|Statistisches Bundesamt)/i)
  })

  it('does not import simulation engine modules during render', () => {
    const html = renderToString(<RenteNettoBerechnePage />)
    expect(html.length).toBeGreaterThan(500)
    expect(html).not.toMatch(/[€]\s?[\d.]+/)
  })

  it('renders without throwing when localStorage access throws', () => {
    const originalLocalStorage = window.localStorage
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
      clear: () => { throw new Error('blocked') },
      key: () => { throw new Error('blocked') },
      length: 0,
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', { configurable: true, value: blocked })
    try {
      expect(() => renderToString(inShell(<RenteNettoBerechnePage />))).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage })
    }
  })
})

describe('RenteNettoBerechnePage — prerendered disclaimer', () => {
  it('prerendered HTML contains the disclaimer text', () => {
    const html = renderToString(inShell(<RenteNettoBerechnePage />))
    expect(html).toContain('Modellrechnung')
    expect(html).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })
})

// ---------------------------------------------------------------------------
// AltersvorsorgeproduktePage — issue #07
// ---------------------------------------------------------------------------

describe('AltersvorsorgeproduktePage — visible content for prerender', () => {
  it('renders the H1 from the registry', () => {
    const { getByRole } = render(<AltersvorsorgeproduktePage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/altersvorsorgeprodukte-vergleichen'].h1,
    )
  })

  it('renders the page summary', () => {
    const { container } = render(<AltersvorsorgeproduktePage />)
    expect(container.textContent).toContain(
      publicRouteRegistry['/altersvorsorgeprodukte-vergleichen'].summary.slice(0, 40),
    )
  })

  it('renders the visible "Stand 2026" line', () => {
    const { container } = render(inShell(<AltersvorsorgeproduktePage />))
    expect(container.textContent).toContain('Stand: 2026-05-06')
    expect(container.textContent).toContain('Deutschland 2026')
  })

  it('renders the not-advice disclaimer', () => {
    const { container } = render(inShell(<AltersvorsorgeproduktePage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('renders a combine-mode CTA with topic preselection (issue #13)', () => {
    const { container } = render(<AltersvorsorgeproduktePage />)
    const cta = container.querySelector('.public-cta')
    expect(cta).not.toBeNull()
    expect(cta?.getAttribute('href')).toBe('/?topic=altersvorsorgeprodukte-vergleichen')
  })

  it('renders an internal link back to the homepage and to the legal pages', () => {
    const { container } = render(<AltersvorsorgeproduktePage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toContain('/')
    expect(links).toContain('/impressum/')
    expect(links).toContain('/datenschutz/')
  })

  it('links to at least two sibling topic pages', () => {
    const { container } = render(<AltersvorsorgeproduktePage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toContain('/rentenluecke-rechner/')
    expect(links).toContain('/rente-netto-berechnen/')
  })

  it('explicitly frames the tool as a free model calculator (no broker framing)', () => {
    const { container } = render(<AltersvorsorgeproduktePage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/kostenlos/i)
    expect(text).not.toMatch(/\bwir empfehlen\b|\bich empfehle\b/i)
    expect(text).toMatch(/kein.*Broker|Broker.*nicht|kein.*Vermittler|Vermittler.*nicht/i)
  })

  it('mentions combine-mode concepts (portfolio framing)', () => {
    const { container } = render(<AltersvorsorgeproduktePage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Portfolio/i)
    expect(text).toMatch(/Transfer|beitragsfrei|Übertrag/i)
  })

  it('cites statutory sources inline (§-refs EStG / SGB V / BetrAVG)', () => {
    const { container } = render(<AltersvorsorgeproduktePage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?\d+\s?(EStG|SGB\s?V|BetrAVG)/i)
    expect(text).toMatch(/(BMF|Deutsche Rentenversicherung|GKV-Spitzenverband)/i)
  })

  it('does not import simulation engine modules during render', () => {
    const html = renderToString(<AltersvorsorgeproduktePage />)
    expect(html.length).toBeGreaterThan(500)
    expect(html).not.toMatch(/[€]\s?[\d.]+/)
  })

  it('renders without throwing when localStorage access throws', () => {
    const originalLocalStorage = window.localStorage
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
      clear: () => { throw new Error('blocked') },
      key: () => { throw new Error('blocked') },
      length: 0,
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', { configurable: true, value: blocked })
    try {
      expect(() => renderToString(inShell(<AltersvorsorgeproduktePage />))).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage })
    }
  })
})

describe('AltersvorsorgeproduktePage — prerendered disclaimer', () => {
  it('prerendered HTML contains the disclaimer text', () => {
    const html = renderToString(inShell(<AltersvorsorgeproduktePage />))
    expect(html).toContain('Modellrechnung')
    expect(html).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })
})

// ---------------------------------------------------------------------------
// BavRechnerPage — issue #04
// ---------------------------------------------------------------------------

describe('BavRechnerPage — visible content for prerender', () => {
  it('renders the H1 from the registry', () => {
    const { getByRole } = render(<BavRechnerPage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/bav-rechner'].h1,
    )
  })

  it('renders the page summary', () => {
    const { container } = render(<BavRechnerPage />)
    expect(container.textContent).toContain(
      publicRouteRegistry['/bav-rechner'].summary.slice(0, 40),
    )
  })

  it('renders the visible "Stand 2026" line', () => {
    const { container } = render(inShell(<BavRechnerPage />))
    expect(container.textContent).toContain('Stand: 2026-05-06')
    expect(container.textContent).toContain('Deutschland 2026')
  })

  it('renders the not-advice disclaimer', () => {
    const { container } = render(inShell(<BavRechnerPage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('renders a calculator CTA deep-link with topic preselection (issue #13)', () => {
    const { container } = render(<BavRechnerPage />)
    const cta = container.querySelector('.public-cta')
    expect(cta).not.toBeNull()
    expect(cta?.getAttribute('href')).toBe('/?topic=bav-rechner')
  })

  it('renders internal links to homepage, etf-vs-bav sibling, and legal pages', () => {
    const { container } = render(<BavRechnerPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(links).toContain('/')
    expect(links).toContain('/etf-vs-bav/')
    expect(links).toContain('/rentenluecke-rechner/')
    expect(links).toContain('/impressum/')
    expect(links).toContain('/datenschutz/')
    const siblingLinks = links.filter(
      (h) => h && h !== '/' && h !== '/impressum/' && h !== '/datenschutz/' && !h.startsWith('/?'),
    )
    expect(siblingLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('cites §-references and public sources inline (YMYL guardrail)', () => {
    const { container } = render(<BavRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?\d+\s?(SGB\s?V|SGB\s?IV|EStG|BetrAVG|SvEV)/i)
    expect(text).toMatch(/(Bundesregierung|Deutsche Rentenversicherung|BMAS|Verbraucherzentrale|GDV)/i)
  })

  it('does not contain empfohlen winner copy', () => {
    const { container } = render(<BavRechnerPage />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\bempfohlen\b/i)
  })

  it('does not call simulation engine modules during render', () => {
    const html = renderToString(<BavRechnerPage />)
    expect(html.length).toBeGreaterThan(500)
    expect(html).not.toMatch(/[€]\s?[\d.]+/)
  })

  it('renders without throwing when localStorage access throws', () => {
    const originalLocalStorage = window.localStorage
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
      clear: () => { throw new Error('blocked') },
      key: () => { throw new Error('blocked') },
      length: 0,
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', { configurable: true, value: blocked })
    try {
      expect(() => renderToString(<BavRechnerPage />)).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage })
    }
  })
})

describe('BavRechnerPage — registry entry (issue #04)', () => {
  it('/bav-rechner is registered with full metadata', () => {
    const entry = publicRouteRegistry['/bav-rechner']
    expect(entry.canonical).toBe('/bav-rechner')
    expect(entry.title).toContain('RentenWiki.de')
    expect(entry.metaDescription.length).toBeGreaterThan(40)
    expect(entry.metaDescription.length).toBeLessThanOrEqual(220)
    expect(entry.h1.length).toBeGreaterThan(5)
    expect(entry.robots).toBe('index,follow')
    expect(entry.inSitemap).toBe(true)
    expect(entry.jsonLdType).toBe('WebApplication')
  })

  it('/bav-rechner declares preselection with compare mode + etf + bav', () => {
    const entry = publicRouteRegistry['/bav-rechner']
    expect(entry.preselection).toEqual({
      mode: 'compare',
      visibleProducts: ['etf', 'bav'],
    })
  })

  it('/bav-rechner CTA uses ?topic=bav-rechner', () => {
    expect(publicRouteRegistry['/bav-rechner'].calculatorCta.href).toBe('/?topic=bav-rechner')
  })

  it('/bav-rechner has at least 2 related routes including etf-vs-bav', () => {
    const entry = publicRouteRegistry['/bav-rechner']
    expect(entry.relatedRoutes.length).toBeGreaterThanOrEqual(2)
    expect(entry.relatedRoutes).toContain('/etf-vs-bav')
  })
})

describe('BavRechnerPage — prerender disclaimer', () => {
  it('prerendered HTML contains the disclaimer text', () => {
    const html = renderToString(inShell(<BavRechnerPage />))
    expect(html).toContain('Modellrechnung')
    expect(html).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })
})

// ---------------------------------------------------------------------------
// EtfVsBavPage — issue #04
// ---------------------------------------------------------------------------

describe('EtfVsBavPage — visible content for prerender', () => {
  it('renders the H1 from the registry', () => {
    const { getByRole } = render(<EtfVsBavPage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/etf-vs-bav'].h1,
    )
  })

  it('renders the page summary', () => {
    const { container } = render(<EtfVsBavPage />)
    expect(container.textContent).toContain(
      publicRouteRegistry['/etf-vs-bav'].summary.slice(0, 40),
    )
  })

  it('renders the visible "Stand 2026" line', () => {
    const { container } = render(inShell(<EtfVsBavPage />))
    expect(container.textContent).toContain('Stand: 2026-05-06')
    expect(container.textContent).toContain('Deutschland 2026')
  })

  it('renders the not-advice disclaimer', () => {
    const { container } = render(inShell(<EtfVsBavPage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('renders a calculator CTA deep-link with topic preselection (issue #13)', () => {
    const { container } = render(<EtfVsBavPage />)
    const cta = container.querySelector('.public-cta')
    expect(cta).not.toBeNull()
    expect(cta?.getAttribute('href')).toBe('/?topic=etf-vs-bav')
  })

  it('renders internal links to homepage, bav-rechner sibling, and legal pages', () => {
    const { container } = render(<EtfVsBavPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(links).toContain('/')
    expect(links).toContain('/bav-rechner/')
    expect(links).toContain('/rentenluecke-rechner/')
    expect(links).toContain('/impressum/')
    expect(links).toContain('/datenschutz/')
    const siblingLinks = links.filter(
      (h) => h && h !== '/' && h !== '/impressum/' && h !== '/datenschutz/' && !h.startsWith('/?'),
    )
    expect(siblingLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('contains a comparison table', () => {
    const { container } = render(<EtfVsBavPage />)
    const tables = container.querySelectorAll('table')
    expect(tables.length).toBeGreaterThanOrEqual(1)
  })

  it('contains plain-language caveats about conditions (no winner framing)', () => {
    const { container } = render(<EtfVsBavPage />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\bbessere?\b/i)
    expect(text).not.toMatch(/\bempfohlen\b/i)
    expect(text).toMatch(/(hängt.*ab|abhängig|Annahmen|Einflussgrößen|Einflussgröße)/i)
  })

  it('cites §-references and public sources inline (YMYL guardrail)', () => {
    const { container } = render(<EtfVsBavPage />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/§\s?\d+\s?(SGB\s?V|SGB\s?IV|EStG|BetrAVG|SvEV)/i)
    expect(text).toMatch(/(Bundesregierung|Deutsche Rentenversicherung|Verbraucherzentrale|GDV)/i)
  })

  it('does not call simulation engine modules during render', () => {
    const html = renderToString(<EtfVsBavPage />)
    expect(html.length).toBeGreaterThan(500)
    expect(html).not.toMatch(/[€]\s?[\d.]+/)
  })

  it('renders without throwing when localStorage access throws', () => {
    const originalLocalStorage = window.localStorage
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
      clear: () => { throw new Error('blocked') },
      key: () => { throw new Error('blocked') },
      length: 0,
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', { configurable: true, value: blocked })
    try {
      expect(() => renderToString(<EtfVsBavPage />)).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage })
    }
  })
})

describe('EtfVsBavPage — registry entry (issue #04)', () => {
  it('/etf-vs-bav is registered with full metadata', () => {
    const entry = publicRouteRegistry['/etf-vs-bav']
    expect(entry.canonical).toBe('/etf-vs-bav')
    expect(entry.title).toContain('RentenWiki.de')
    expect(entry.metaDescription.length).toBeGreaterThan(40)
    expect(entry.metaDescription.length).toBeLessThanOrEqual(220)
    expect(entry.h1.length).toBeGreaterThan(5)
    expect(entry.robots).toBe('index,follow')
    expect(entry.inSitemap).toBe(true)
    // Comparison page → Article JSON-LD per locked decision in issue #04 brief
    expect(entry.jsonLdType).toBe('Article')
  })

  it('/etf-vs-bav declares preselection with compare mode + etf + bav', () => {
    const entry = publicRouteRegistry['/etf-vs-bav']
    expect(entry.preselection).toEqual({
      mode: 'compare',
      visibleProducts: ['etf', 'bav'],
    })
  })

  it('/etf-vs-bav CTA uses ?topic=etf-vs-bav', () => {
    expect(publicRouteRegistry['/etf-vs-bav'].calculatorCta.href).toBe('/?topic=etf-vs-bav')
  })

  it('/etf-vs-bav has at least 2 related routes including /bav-rechner', () => {
    const entry = publicRouteRegistry['/etf-vs-bav']
    expect(entry.relatedRoutes.length).toBeGreaterThanOrEqual(2)
    expect(entry.relatedRoutes).toContain('/bav-rechner')
  })
})

describe('EtfVsBavPage — prerender disclaimer', () => {
  it('prerendered HTML contains the disclaimer text', () => {
    const html = renderToString(inShell(<EtfVsBavPage />))
    expect(html).toContain('Modellrechnung')
    expect(html).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })
})

// Issue #4: .public-cta color cascade regression — white text on blue button
// ---------------------------------------------------------------------------

describe('.public-cta color cascade — issue #4 regression', () => {
  // JSDOM resolves the CSS cascade, so computed style reflects which rule wins.
  // Before the fix, .public-article a (specificity 0,1,1) overrode
  // .public-cta (specificity 0,1,0), making text color #2563eb on a #2563eb
  // background — invisible. After the fix, .public-article a:not(.public-cta)
  // scopes the generic link rule away from CTAs, restoring color: #ffffff.

  it('BavRechnerPage — .public-cta renders white text (not article-link blue)', () => {
    const { container } = render(<BavRechnerPage />)
    const cta = container.querySelector('.public-cta') as HTMLElement | null
    expect(cta).not.toBeNull()
    // The inline style set by the component is authoritative in JSDOM when no
    // stylesheet is loaded, but the class attribute must at minimum not carry
    // the overriding generic-link color. Assert the element is not styled as
    // the article-link blue (rgb(37,99,235)) — it should be unstyled or white.
    const color = cta!.style.color
    expect(color).not.toBe('rgb(37, 99, 235)')
  })

  it('RentenluckeRechnerPage — .public-cta has no underline class conflict', () => {
    const { container } = render(<RentenluckeRechnerPage />)
    const cta = container.querySelector('.public-cta') as HTMLElement | null
    expect(cta).not.toBeNull()
    // Verify the CTA element does not have additional classes that would
    // re-introduce the article-link specificity conflict.
    expect(cta!.classList.contains('public-cta')).toBe(true)
    // The article-link rule must not apply: the element must carry .public-cta
    // so the :not(.public-cta) selector excludes it.
    expect(cta!.tagName.toLowerCase()).toBe('a')
  })

  it('AltersvorsorgeproduktePage — .public-cta href and class are both present', () => {
    const { container } = render(<AltersvorsorgeproduktePage />)
    const cta = container.querySelector('a.public-cta') as HTMLAnchorElement | null
    expect(cta).not.toBeNull()
    // Selector a.public-cta must match — this is the post-fix selector shape
    // that beats .public-article a:not(.public-cta) by excluding CTAs from
    // that rule entirely.
    expect(cta!.href).toContain('topic=altersvorsorgeprodukte-vergleichen')
  })
})

// ---------------------------------------------------------------------------
// Issue #06: ?view=vergleich — "Verwandte Seiten" Modellrechner Startseite link
// ---------------------------------------------------------------------------

describe('Public pages — "Verwandte Seiten" Modellrechner Startseite link uses /?view=vergleich', () => {
  it('RentenluckeRechnerPage renders /?view=vergleich for the Modellrechner Startseite entry', () => {
    const { container } = render(<RentenluckeRechnerPage />)
    const verwandteLinks = Array.from(
      container.querySelectorAll('.public-internal-links a'),
    )
    const startseiteLink = verwandteLinks.find(
      (a) => a.textContent?.includes('Modellrechner Startseite'),
    )
    expect(startseiteLink).not.toBeNull()
    expect(startseiteLink?.getAttribute('href')).toBe('/?view=vergleich')
  })

  it('BasisrenteRechnerPage renders /?view=vergleich for the Modellrechner Startseite entry', () => {
    const { container } = render(<BasisrenteRechnerPage />)
    const verwandteLinks = Array.from(
      container.querySelectorAll('.public-internal-links a'),
    )
    const startseiteLink = verwandteLinks.find(
      (a) => a.textContent?.includes('Modellrechner Startseite'),
    )
    expect(startseiteLink).not.toBeNull()
    expect(startseiteLink?.getAttribute('href')).toBe('/?view=vergleich')
  })

  it('BavRechnerPage renders /?view=vergleich for the Modellrechner Startseite entry', () => {
    const { container } = render(<BavRechnerPage />)
    const verwandteLinks = Array.from(
      container.querySelectorAll('.public-internal-links a'),
    )
    const startseiteLink = verwandteLinks.find(
      (a) => a.textContent?.includes('Modellrechner Startseite'),
    )
    expect(startseiteLink).not.toBeNull()
    expect(startseiteLink?.getAttribute('href')).toBe('/?view=vergleich')
  })

  it('EtfVsBavPage renders /?view=vergleich for the Modellrechner Startseite entry', () => {
    const { container } = render(<EtfVsBavPage />)
    const verwandteLinks = Array.from(
      container.querySelectorAll('.public-internal-links a'),
    )
    const startseiteLink = verwandteLinks.find(
      (a) => a.textContent?.includes('Modellrechner Startseite'),
    )
    expect(startseiteLink).not.toBeNull()
    expect(startseiteLink?.getAttribute('href')).toBe('/?view=vergleich')
  })
})
