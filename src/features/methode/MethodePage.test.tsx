// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import { pathToRoute, ROUTES } from '../../app/useRoute'
import { MethodePage } from './MethodePage'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import { activeRules, RULES_YEAR } from '../../rules'
import { eachViewport, mockViewport } from '../../test/viewport'
import { formatCurrency, formatPercent } from '../../utils/format'

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

function inShell(node: ReactElement, path: string = '/methode') {
  return createElement(AppShell, {
    route: pathToRoute(path),
    navigate: () => {},
    children: node,
  })
}

describe('MethodePage — /methode route content', () => {
  it('renders the registry H1 verbatim', () => {
    const { getByRole } = render(<MethodePage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/methode'].h1,
    )
  })

  it('renders the registry summary as the page lead paragraph', () => {
    const { container } = render(<MethodePage />)
    const lead = container.querySelector('.methode-summary')
    expect(lead).not.toBeNull()
    expect(lead!.textContent).toBe(publicRouteRegistry['/methode'].summary)
  })

  it('renders every § section as an h2 with a stable slug id', () => {
    const { container } = render(<MethodePage />)
    const h2 = Array.from(container.querySelectorAll('h2'))
    // The body emits five § sections; their ids drive `/methode#…` deep links.
    expect(h2.length).toBeGreaterThanOrEqual(5)
    // Ids are year-free so `/methode#steuer-modell` keeps working when
    // RULES_YEAR rolls forward (the visible title may carry the year, the id
    // must not).
    const expectedIds = [
      'renditeannahmen',
      'steuer-modell',
      'sozialversicherung',
      'statutorische-werte',
      'nicht-modelliert',
    ]
    const renderedIds = h2.map((h) => h.id)
    for (const id of expectedIds) {
      expect(renderedIds).toContain(id)
    }
  })

  it('renders mono § kicker labels for each section', () => {
    const { container } = render(<MethodePage />)
    const kickers = Array.from(container.querySelectorAll('.methode-section-num')).map(
      (n) => n.textContent ?? '',
    )
    // The mock + handoff convention is "§ 1", "§ 2", …; assert at least these.
    expect(kickers).toContain('§ 1')
    expect(kickers).toContain('§ 2')
    expect(kickers).toContain('§ 3')
    expect(kickers).toContain('§ 4')
    expect(kickers).toContain('§ 5')
  })

  it('renders rule-year table cells traced to RULES_YEAR and de2026.ts', () => {
    const { container } = render(<MethodePage />)
    const text = container.textContent ?? ''
    // Headline figures from `src/rules/de2026.ts` — confirms no hardcoded
    // statutory literal lives in the component.
    expect(text).toContain(formatCurrency(activeRules.socialSecurity.pensionCapYear))
    expect(text).toContain(formatCurrency(activeRules.socialSecurity.healthCareCapYear))
    expect(text).toContain(formatCurrency(activeRules.basisrente.schicht1CapSingle))
    expect(text).toContain(formatCurrency(activeRules.capitalGains.saverAllowance))
    expect(text).toContain(formatCurrency(activeRules.riester.grundzulage))
    expect(text).toContain(formatCurrency(activeRules.incomeTax.solidarityFreeTax))
    expect(text).toContain(formatPercent(activeRules.capitalGains.basiszins, 2))
    // RULES_YEAR is rendered as both the section heading suffix and the
    // table-header cell ("2026").
    expect(text).toContain(String(RULES_YEAR))
  })

  it('renders the right-rail Quellen list with at least 5 entries', () => {
    const { container } = render(<MethodePage />)
    const sourcesCard = container.querySelector('.methode-aside-card--sources')
    expect(sourcesCard).not.toBeNull()
    const sourceItems = sourcesCard!.querySelectorAll('.methode-aside-list-item')
    expect(sourceItems.length).toBeGreaterThanOrEqual(5)
  })

  it('renders the GitHub repo link in the right rail', () => {
    const { container } = render(<MethodePage />)
    const github = container.querySelector('.methode-aside-github')
    expect(github).not.toBeNull()
    expect(github!.getAttribute('href')).toBe(
      'https://github.com/PeterHartwieg/Rentenrechner',
    )
    expect(github!.getAttribute('rel')).toContain('noopener')
    expect(github!.getAttribute('target')).toBe('_blank')
  })

  it('renders the GitHub Sponsors donation link in the licence card', () => {
    const { container } = render(<MethodePage />)
    const sponsorLinks = Array.from(container.querySelectorAll('a')).filter((a) =>
      (a.getAttribute('href') ?? '').includes('github.com/sponsors/PeterHartwieg'),
    )
    expect(sponsorLinks.length).toBeGreaterThan(0)
  })

  it('renders the commercial-license contact email', () => {
    const { container } = render(<MethodePage />)
    const mail = Array.from(container.querySelectorAll('a')).find(
      (a) => (a.getAttribute('href') ?? '').toLowerCase() === 'mailto:peter@hartwieg.com',
    )
    expect(mail).toBeDefined()
  })

  it('emits no inline JSON-LD (head pipeline owns the /methode WebPage block)', () => {
    // The Methode WebPage JSON-LD is emitted into <head> by
    // `renderRouteHeadHtml('/methode')` via the SSG prerender path. Emitting
    // a second copy inline would duplicate the schema and trip the
    // "single JSON-LD per route" invariant.
    const html = renderToString(<MethodePage />)
    expect(html).not.toMatch(/application\/ld\+json/)
  })

  it('contains no fictional bylines or unsanctioned licence claims', () => {
    const { container } = render(<MethodePage />)
    const text = container.textContent ?? ''
    // PR 2/3 retros pinned single-maintainer posture; PR 4 inherits the bar.
    expect(text).not.toMatch(/Fachprüfung/i)
    expect(text).not.toMatch(/CC\s?BY-SA/i)
    expect(text).not.toMatch(/318\s?Contributor/i)
    // MIT is for someone else's project; we ship under PolyForm.
    expect(text).not.toMatch(/\bMIT-Lizenz\b/i)
    // Public chrome must not regress to "Rentenrechner" (P0 brand guardrail).
    expect(text).not.toContain('Rentenrechner')
  })

  it('renders the breadcrumb back-link via SPA navigation', () => {
    const navigate = vi.fn()
    const { container } = render(<MethodePage navigate={navigate} />)
    const back = container.querySelector('.methode-breadcrumb-back') as HTMLAnchorElement | null
    expect(back).not.toBeNull()
    fireEvent.click(back!)
    expect(navigate).toHaveBeenCalledWith(ROUTES.home)
  })

  it('preserves modified-click default on the breadcrumb back-link', () => {
    // Modifier-click (Cmd/Ctrl/middle/Shift) must NOT preventDefault, so users
    // can open the breadcrumb target in a new tab. shouldUseSpaNavigation
    // guards every SPA-intercept anchor — verify the guard fires here too.
    const navigate = vi.fn()
    const { container } = render(<MethodePage navigate={navigate} />)
    const back = container.querySelector('.methode-breadcrumb-back') as HTMLAnchorElement | null
    expect(back).not.toBeNull()
    fireEvent.click(back!, { metaKey: true })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders TOC items with aria-current on the active section', () => {
    const { container } = render(<MethodePage />)
    const tocLinks = Array.from(container.querySelectorAll('.methode-toc-link'))
    // Before IntersectionObserver fires (jsdom doesn't implement it), the
    // first TOC item carries `aria-current="location"` as the fallback.
    const active = tocLinks.filter((a) => a.getAttribute('aria-current') === 'location')
    expect(active.length).toBe(1)
  })

  it('renders the registered Stand line', () => {
    const { container } = render(<MethodePage />)
    const stand = container.querySelector('.methode-stand')
    expect(stand).not.toBeNull()
    expect(stand!.textContent).toContain(
      `Stand: ${publicRouteRegistry['/methode'].dateModified}`,
    )
    expect(stand!.textContent).toContain(`Werte für Deutschland ${RULES_YEAR}`)
  })

  it('renders the not-advice disclaimer when wrapped in AppShell (compliance)', () => {
    const { container } = render(inShell(<MethodePage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('marks Methode as the active chrome nav tab when wrapped in AppShell', () => {
    const { container } = render(inShell(<MethodePage />))
    // The chrome's desktop nav renders the "Methode" tab with the active class
    // when the route is `/methode` (per chromeRoutes.routeToNavId).
    const active = container.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Methode')
  })

  it('renders the page without throwing at every viewport', () => {
    eachViewport(() => {
      expect(() => renderToString(inShell(<MethodePage />))).not.toThrow()
    })
  })
})
