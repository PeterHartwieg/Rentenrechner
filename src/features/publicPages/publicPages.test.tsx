// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { cleanup, render } from '@testing-library/react'
import { RentenluckeRechnerPage } from './RentenluckeRechnerPage'
import { PageNotFound } from './PageNotFound'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'

afterEach(() => {
  cleanup()
})

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
    const { container } = render(<RentenluckeRechnerPage />)
    expect(container.textContent).toContain('Stand: 2026-05-06')
    expect(container.textContent).toContain('Deutschland 2026')
  })

  it('renders the not-advice disclaimer (compliance — every public page must)', () => {
    const { container } = render(<RentenluckeRechnerPage />)
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('renders a calculator CTA deep-link to /', () => {
    const { container } = render(<RentenluckeRechnerPage />)
    const cta = container.querySelector('.public-cta')
    expect(cta).not.toBeNull()
    expect(cta?.getAttribute('href')).toBe('/')
  })

  it('renders an internal link back to the homepage and to the legal pages', () => {
    const { container } = render(<RentenluckeRechnerPage />)
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toContain('/')
    expect(links).toContain('/impressum')
    expect(links).toContain('/datenschutz')
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
    const { getByRole } = render(<PageNotFound />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/404'].h1,
    )
  })

  it('renders the not-advice disclaimer (compliance)', () => {
    const { container } = render(<PageNotFound />)
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
    const html = renderToString(<RentenluckeRechnerPage />)
    expect(html).toContain('Modellrechnung')
    expect(html).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('PageNotFound prerendered HTML contains the disclaimer text', () => {
    const html = renderToString(<PageNotFound />)
    expect(html).toContain('Modellrechnung')
  })
})
