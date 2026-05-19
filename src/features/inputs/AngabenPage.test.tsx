// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import type { Route } from '../../app/useRoute'
import { AngabenPage } from './AngabenPage'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import { RULES_YEAR } from '../../rules'
import { eachViewport, mockViewport } from '../../test/viewport'

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

function inShell(node: ReactElement, route: Route = '/eingaben') {
  return createElement(AppShell, { route, navigate: () => {}, children: node })
}

describe('AngabenPage — /eingaben route content', () => {
  it('renders the registry H1 verbatim', () => {
    const { getByRole } = render(<AngabenPage />)
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      publicRouteRegistry['/eingaben'].h1,
    )
  })

  it('renders the registry summary as the page lead paragraph', () => {
    const { container } = render(<AngabenPage />)
    const lead = container.querySelector('.angaben-summary')
    expect(lead).not.toBeNull()
    expect(lead!.textContent).toBe(publicRouteRegistry['/eingaben'].summary)
  })

  it('renders every § section as an h2 with a stable slug id', () => {
    const { container } = render(<AngabenPage />)
    const h2 = Array.from(container.querySelectorAll('h2'))
    // The body emits four § sections; their ids drive `/eingaben#…` deep links.
    expect(h2.length).toBeGreaterThanOrEqual(4)
    // Ids are year-free so `/eingaben#renteneintritt` keeps working when
    // RULES_YEAR rolls forward.
    const expectedIds = ['person', 'einkommen', 'renteneintritt', 'annahmen']
    const renderedIds = h2.map((h) => h.id)
    for (const id of expectedIds) {
      expect(renderedIds).toContain(id)
    }
  })

  it('renders mono § kicker labels for each section', () => {
    const { container } = render(<AngabenPage />)
    const kickers = Array.from(container.querySelectorAll('.angaben-section-num')).map(
      (n) => n.textContent ?? '',
    )
    // The mock + handoff convention is "§ 1", "§ 2", …; assert each present.
    expect(kickers).toContain('§ 1')
    expect(kickers).toContain('§ 2')
    expect(kickers).toContain('§ 3')
    expect(kickers).toContain('§ 4')
  })

  it('emits no inline JSON-LD (head pipeline owns the /eingaben WebPage block)', () => {
    // The /eingaben WebPage JSON-LD is emitted into <head> by
    // `renderRouteHeadHtml('/eingaben')` via the SSG prerender path. Emitting
    // a second copy inline would duplicate the schema and trip the
    // "single JSON-LD per route" invariant.
    const html = renderToString(<AngabenPage />)
    expect(html).not.toMatch(/application\/ld\+json/)
  })

  it('contains no fictional bylines or unsanctioned licence claims', () => {
    const { container } = render(<AngabenPage />)
    const text = container.textContent ?? ''
    // Single-maintainer posture inherited from PR 2/3/4 retros.
    expect(text).not.toMatch(/Fachprüfung/i)
    expect(text).not.toMatch(/CC\s?BY-SA/i)
    expect(text).not.toMatch(/318\s?Contributor/i)
    expect(text).not.toMatch(/RentenWiki e\.\s?V\./i)
    // MIT is for someone else's project; we ship under PolyForm.
    expect(text).not.toMatch(/\bMIT-Lizenz\b/i)
    // Public chrome must not regress to "Rentenrechner" (P0 brand guardrail).
    expect(text).not.toContain('Rentenrechner')
  })

  it('renders all four section titles', () => {
    const { container } = render(<AngabenPage />)
    const titles = Array.from(container.querySelectorAll('.angaben-section-title')).map(
      (h) => h.textContent ?? '',
    )
    expect(titles).toContain('Person')
    expect(titles).toContain('Einkommen')
    expect(titles).toContain('Renteneintritt')
    expect(titles).toContain('Annahmen')
  })

  it('renders the breadcrumb back-link via SPA navigation', () => {
    const navigate = vi.fn()
    const { container } = render(<AngabenPage navigate={navigate} />)
    const back = container.querySelector('.angaben-breadcrumb-back') as HTMLAnchorElement | null
    expect(back).not.toBeNull()
    fireEvent.click(back!)
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('preserves modified-click default on the breadcrumb back-link', () => {
    // Modifier-click (Cmd/Ctrl/middle/Shift) must NOT preventDefault, so users
    // can open the breadcrumb target in a new tab. `shouldUseSpaNavigation`
    // guards every SPA-intercept anchor — verify the guard fires here too.
    const navigate = vi.fn()
    const { container } = render(<AngabenPage navigate={navigate} />)
    const back = container.querySelector('.angaben-breadcrumb-back') as HTMLAnchorElement | null
    expect(back).not.toBeNull()
    fireEvent.click(back!, { metaKey: true })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders TOC items with aria-current on the active section', () => {
    const { container } = render(<AngabenPage />)
    const tocLinks = Array.from(container.querySelectorAll('.angaben-toc-link'))
    // Before IntersectionObserver fires (jsdom doesn't implement it), the
    // first TOC item carries `aria-current="location"` as the fallback.
    const active = tocLinks.filter((a) => a.getAttribute('aria-current') === 'location')
    expect(active.length).toBe(1)
  })

  it('routes the Methode link in the right rail through the SPA navigator', () => {
    const navigate = vi.fn()
    const { container } = render(<AngabenPage navigate={navigate} />)
    const methodeLinks = Array.from(container.querySelectorAll('a')).filter((a) =>
      (a.getAttribute('href') ?? '') === '/methode',
    )
    expect(methodeLinks.length).toBeGreaterThan(0)
    fireEvent.click(methodeLinks[0])
    expect(navigate).toHaveBeenCalledWith('/methode')
  })

  it('preserves modified-click default on the Methode aside link', () => {
    const navigate = vi.fn()
    const { container } = render(<AngabenPage navigate={navigate} />)
    const methodeLink = container.querySelector('a[href="/methode"]') as HTMLAnchorElement | null
    expect(methodeLink).not.toBeNull()
    fireEvent.click(methodeLink!, { ctrlKey: true })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders the registered Stand line', () => {
    const { container } = render(<AngabenPage />)
    const stand = container.querySelector('.angaben-stand')
    expect(stand).not.toBeNull()
    expect(stand!.textContent).toContain(
      `Stand: ${publicRouteRegistry['/eingaben'].dateModified}`,
    )
    expect(stand!.textContent).toContain(`Werte für Deutschland ${RULES_YEAR}`)
  })

  it('renders the "Warum wir das fragen" card with one entry per § section', () => {
    const { container } = render(<AngabenPage />)
    const items = container.querySelectorAll('.angaben-aside-list-item')
    // One bullet per § section (Person / Einkommen / Renteneintritt / Annahmen).
    expect(items.length).toBe(4)
    const text = Array.from(items).map((i) => i.textContent ?? '').join(' ')
    expect(text).toContain('§ 22 Nr. 1')
    expect(text).toContain('§ 32a Abs. 5')
    expect(text).toContain('§ 39b EStG')
    // "MSCI-World-Renditen" (hyphenated compound) in the right-rail body.
    expect(text).toMatch(/MSCI[‐‑–—\- ]?World/)
  })

  it('renders the not-advice disclaimer when wrapped in AppShell (compliance)', () => {
    const { container } = render(inShell(<AngabenPage />))
    expect(container.textContent).toContain('Modellrechnung')
    expect(container.textContent).toMatch(/keine Anlage-, Steuer- oder Rechtsberatung/i)
  })

  it('marks Angaben as the active chrome nav tab when wrapped in AppShell', () => {
    const { container } = render(inShell(<AngabenPage />))
    // The chrome's desktop nav renders the "Angaben" tab with the active class
    // when the route is `/eingaben` (per chromeRoutes.routeToNavId).
    const active = container.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Angaben')
  })

  it('renders the page without throwing at every viewport', () => {
    eachViewport(() => {
      expect(() => renderToString(inShell(<AngabenPage />))).not.toThrow()
    })
  })
})

// ---------------------------------------------------------------------------
// NumberField tap-target — phone breakpoint must put every NumberField wrapper
// over the 44 px tap-target threshold (WCAG 2.2 SC 2.5.8). The pure-CSS bump
// is applied in `src/ui/forms.css` under `@media (max-width: 639px)`.
//
// jsdom doesn't apply stylesheets at full fidelity (no real layout engine),
// so we read the CSS source directly and assert the rule exists. This guards
// against accidental regression of the CSS itself.
// ---------------------------------------------------------------------------
describe('AngabenPage — phone tap target rule', () => {
  it('compiles a phone-specific padding bump for .field .input-shell input', async () => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    // process.cwd() is the repo root under vitest. The test guards the
    // canonical forms.css path that ships the WCAG 2.2 tap-target rule.
    const formsCssPath = join(process.cwd(), 'src', 'ui', 'forms.css')
    const formsCss = await readFile(formsCssPath, 'utf8')
    expect(formsCss).toContain('max-width: 639px')
    expect(formsCss).toMatch(/\.field\s+\.input-shell\s+input/)
    expect(formsCss).toMatch(/padding-top:\s*12px/)
    expect(formsCss).toMatch(/padding-bottom:\s*12px/)
  })
})
