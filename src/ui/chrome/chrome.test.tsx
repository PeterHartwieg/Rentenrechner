// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { mockViewport, eachViewport } from '../../test/viewport'
import { StatusBar } from './StatusBar'
import { AppHeader } from './AppHeader'
import { MobileNav } from './MobileNav'
import { MobileSheet } from './MobileSheet'
import { RightRailAccordion } from './RightRailAccordion'
import { AppShell } from './AppShell'
import { pathToRoute as R, ROUTES } from '../../app/useRoute'
import { activeChromeNavId, routeToNavId } from './chromeRoutes'

/**
 * jsdom's `window.location` properties are read-only; redefine the whole
 * `location` object to swap `.search`. Mirrors the helper in
 * `LandingPage.test.tsx`. The PR 2.1 active-tab tests rely on this to
 * pin the R1.1 `?view=landing` URL override behaviour.
 */
function stubLocationSearch(search: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search },
  })
}

afterEach(() => {
  cleanup()
  mockViewport('desktop')
  stubLocationSearch('')
})

describe('StatusBar', () => {
  it('renders full mono ribbon on desktop', () => {
    mockViewport('desktop')
    const { container } = render(<StatusBar />)
    const bar = container.querySelector('.rw-status-bar--desktop')
    expect(bar).toBeInTheDocument()
    expect(bar?.textContent).toContain('rentenwiki.de')
    expect(bar?.textContent).toContain('Unabhängiges Projekt')
    expect(bar?.textContent).toContain('Quellcode offen')
    expect(bar?.textContent).not.toContain('v0.0.0')
    // P0 guardrail: the internal working name must not appear in public chrome.
    expect(bar?.textContent).not.toContain('Rentenrechner')
  })

  it('uses the tablet variant at tablet width', () => {
    mockViewport('tablet')
    const { container } = render(<StatusBar />)
    expect(container.querySelector('.rw-status-bar--tablet')).toBeInTheDocument()
    expect(container.querySelector('.rw-status-bar--desktop')).not.toBeInTheDocument()
  })

  it('compacts to URL + build date on phone', () => {
    mockViewport('phone')
    const { container } = render(<StatusBar />)
    const bar = container.querySelector('.rw-status-bar--phone')
    expect(bar).toBeInTheDocument()
    expect(bar?.textContent).toContain('rentenwiki.de')
    expect(bar?.textContent).not.toContain('Unabhängiges Projekt')
    expect(bar?.textContent).toContain('Stand ')
  })
})

describe('activeChromeNavId (URL override + appView resolver)', () => {
  it('maps / + empty search to "home" when appView is absent (back-compat default)', () => {
    expect(activeChromeNavId(ROUTES.home, '')).toBe('home')
    // The underlying URL-only resolver still returns "home" for /.
    expect(routeToNavId(ROUTES.home)).toBe('home')
  })

  it('maps / + ?view=landing to "home" (Startseite owns the landing page)', () => {
    // Startseite routes to /?view=landing so its label keeps its promise
    // (always opens the landing/mode-picker). The landing URL therefore
    // lights up Startseite, even when appView is compare/combine — the
    // URL override always wins.
    expect(activeChromeNavId(ROUTES.home, '?view=landing')).toBe('home')
    expect(activeChromeNavId(ROUTES.home, '?view=landing', 'compare')).toBe('home')
    expect(activeChromeNavId(ROUTES.home, '?view=landing', 'combine')).toBe('home')
  })

  it('maps / + appView=compare to "plan" (2D: `/` is the plan for every saved mode)', () => {
    // A saved-compare user landing on `/` now gets the plan's not-started
    // state, not the comparison — so the plan tab is the active surface.
    expect(activeChromeNavId(ROUTES.home, '', 'compare')).toBe('plan')
  })

  it('maps / + appView=combine to "plan"', () => {
    expect(activeChromeNavId(ROUTES.home, '', 'combine')).toBe('plan')
  })

  it('keeps /vergleich on the compare tab regardless of appView', () => {
    // The comparison is its own destination now; a combine-mode user who
    // opens it must still see the Vergleich tab lit.
    expect(activeChromeNavId(ROUTES.vergleich, '')).toBe('compare')
    expect(activeChromeNavId(ROUTES.vergleich, '', 'combine')).toBe('compare')
  })

  it('maps / + appView=landing to "home" (fresh user → Startseite)', () => {
    expect(activeChromeNavId(ROUTES.home, '', 'landing')).toBe('home')
  })

  it('ignores ?view=landing on non-home routes (override is home-only)', () => {
    expect(activeChromeNavId(ROUTES.methode, '?view=landing')).toBe('method')
    expect(activeChromeNavId(ROUTES.eingaben, '?view=landing')).toBe('angaben')
    expect(activeChromeNavId(ROUTES.artikel, '?view=landing')).toBe('artikel')
  })

  it('routes plan drill-ins to the plan tab and comparison drill-ins to the compare tab', () => {
    // vertrag / vertrag-bearbeiten / vorsorge-neu / kapital are reached from
    // Mein Plan; vergleich-detail is reached from the comparison.
    expect(activeChromeNavId(ROUTES.vertrag('etf:abcd'), '')).toBe('plan')
    expect(activeChromeNavId(ROUTES.vertragBearbeiten('etf:abcd'), '')).toBe('plan')
    expect(activeChromeNavId(ROUTES.vorsorgeNeu, '')).toBe('plan')
    expect(activeChromeNavId(ROUTES.kapital, '')).toBe('plan')
    expect(activeChromeNavId(ROUTES.vergleichDetail, '')).toBe('compare')
  })

  it('returns null for legal routes regardless of search or appView', () => {
    expect(activeChromeNavId(ROUTES.impressum, '')).toBeNull()
    expect(activeChromeNavId(ROUTES.datenschutz, '?view=landing')).toBeNull()
    expect(activeChromeNavId(ROUTES.impressum, '', 'compare')).toBeNull()
  })

  it('ignores unsupported ?view= values (only "landing" is honoured)', () => {
    // Defensive: appViewFromUrl rejects compare/combine/unknown. With no
    // appView the home route falls back to Startseite.
    expect(activeChromeNavId(ROUTES.home, '?view=compare')).toBe('home')
    expect(activeChromeNavId(ROUTES.home, '?view=combine')).toBe('home')
    expect(activeChromeNavId(ROUTES.home, '?view=garbage')).toBe('home')
  })
})

describe('AppHeader', () => {
  it('renders kicker + H1 + 6-tab nav on desktop', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/')} kicker="TEST" title="Hallo" navigate={() => {}} />)
    expect(screen.getByText('TEST')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hallo' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: /Hauptnavigation/ })
    expect(nav).toBeInTheDocument()
    // 2D: "Mein Plan" and "Vergleich" are two separate tabs with fixed
    // labels and distinct destinations. The Annahmen tab is still gone
    // (it folds into § 4 of /eingaben).
    for (const label of ['Startseite', 'Angaben', 'Mein Plan', 'Vergleich', 'Artikel', 'Methode']) {
      expect(nav.textContent).toContain(label)
    }
    expect(nav.textContent).not.toContain('Annahmen')
  })

  it('puts Mein Plan and Vergleich first with primary styling on desktop', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/')} appView="combine" navigate={() => {}} />)
    const links = within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Mein Plan', 'Vergleich', 'Startseite', 'Angaben', 'Artikel', 'Methode'])
    for (const link of links.slice(0, 2)) expect(link).toHaveClass('rw-app-header__nav-item--primary')
    for (const link of links.slice(2)) expect(link).not.toHaveClass('rw-app-header__nav-item--primary')
  })

  it('highlights Startseite as active when route is /', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/')} kicker="" title="" navigate={() => {}} />)
    const active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Startseite')
  })

  it('renders smaller tablet variant on tablet width', () => {
    mockViewport('tablet')
    render(<AppHeader route={R('/')} title="Hallo" navigate={() => {}} />)
    expect(document.querySelector('.rw-app-header--tablet')).toBeInTheDocument()
  })

  it('drops top nav and shows brand + hamburger on phone', () => {
    mockViewport('phone')
    render(<AppHeader route={R('/')} title="Hallo" navigate={() => {}} />)
    expect(screen.getByText('RentenWiki')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Menü öffnen/ })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /Hauptnavigation/ })).not.toBeInTheDocument()
  })

  it('switches to serif H1 in editorial mode', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/')} title="Editorial" editorial navigate={() => {}} />)
    expect(document.querySelector('.rw-app-header--editorial')).toBeInTheDocument()
  })

  it('opens the mobile sheet when hamburger is pressed', () => {
    mockViewport('phone')
    render(<AppHeader route={R('/')} title="Hallo" appView="combine" navigate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Menü öffnen/ }))
    expect(screen.getByRole('dialog', { name: /Weitere Menüpunkte/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).not.toHaveAttribute('aria-current')
  })

  it('navigate is called with ?view=landing when Startseite is clicked on desktop', () => {
    mockViewport('desktop')
    const navigate = vi.fn()
    render(<AppHeader route={R('/impressum')} title="" navigate={navigate} />)
    fireEvent.click(screen.getByText('Startseite'))
    // Startseite now forces the landing/mode-picker via the same
    // ?view=landing URL override that Vergleich uses — without it, a
    // returning user (saved compare/combine state) would never see the
    // landing page when clicking Startseite (label vs. behaviour mismatch).
    expect(navigate).toHaveBeenCalledWith(R('/'), '?view=landing')
  })

  it('navigates to /artikel when Artikel is clicked on desktop (PR 3)', () => {
    mockViewport('desktop')
    const navigate = vi.fn()
    render(<AppHeader route={R('/')} title="" navigate={navigate} />)
    fireEvent.click(screen.getByText('Artikel'))
    expect(navigate).toHaveBeenCalledWith(R('/artikel'))
  })

  it('highlights Artikel as active on a clustered topic route', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/bav-rechner')} title="" navigate={() => {}} />)
    const active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Artikel')
  })

  it('navigates to /methode when Methode is clicked on desktop (PR 4)', () => {
    mockViewport('desktop')
    const navigate = vi.fn()
    render(<AppHeader route={R('/')} title="" navigate={navigate} />)
    fireEvent.click(screen.getByText('Methode'))
    expect(navigate).toHaveBeenCalledWith(R('/methode'))
  })

  it('highlights Methode as active when route is /methode (PR 4)', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/methode')} title="" navigate={() => {}} />)
    const active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Methode')
  })

  it('navigates to /eingaben when Angaben is clicked on desktop (PR 5)', () => {
    mockViewport('desktop')
    const navigate = vi.fn()
    render(<AppHeader route={R('/')} title="" navigate={navigate} />)
    fireEvent.click(screen.getByText('Angaben'))
    expect(navigate).toHaveBeenCalledWith(R('/eingaben'))
  })

  it('highlights Angaben as active when route is /eingaben (PR 5)', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/eingaben')} title="" navigate={() => {}} />)
    const active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Angaben')
  })

  it('renders Vergleich as a real anchor with href=/vergleich on desktop', () => {
    // 2D: the Vergleich tab points at its own route. `/` is Mein Plan.
    mockViewport('desktop')
    render(<AppHeader route={R('/')} title="" navigate={() => {}} />)
    const tab = screen.getByText('Vergleich')
    expect(tab.tagName).toBe('A')
    expect(tab.getAttribute('href')).toBe('/vergleich')
    expect(tab.classList.contains('rw-app-header__nav-item--placeholder')).toBe(false)
  })

  it('renders Mein Plan as a real anchor with href=/ on desktop', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/')} title="" navigate={() => {}} />)
    const tab = screen.getByText('Mein Plan')
    expect(tab.tagName).toBe('A')
    expect(tab.getAttribute('href')).toBe('/')
  })

  it('SPA-navigates to ROUTES.vergleich when Vergleich is clicked on desktop', () => {
    mockViewport('desktop')
    const navigate = vi.fn()
    render(<AppHeader route={R('/impressum')} title="" navigate={navigate} />)
    fireEvent.click(screen.getByText('Vergleich'))
    expect(navigate).toHaveBeenCalledWith(R('/vergleich'))
  })

  it('SPA-navigates to ROUTES.home when Mein Plan is clicked on desktop', () => {
    mockViewport('desktop')
    const navigate = vi.fn()
    render(<AppHeader route={R('/impressum')} title="" navigate={navigate} />)
    fireEvent.click(screen.getByText('Mein Plan'))
    expect(navigate).toHaveBeenCalledWith(R('/'))
  })

  it('keeps both labels visible regardless of saved mode (no label swap)', () => {
    mockViewport('desktop')
    for (const appView of ['compare', 'combine'] as const) {
      cleanup()
      render(<AppHeader route={R('/')} title="" appView={appView} navigate={() => {}} />)
      const nav = screen.getByRole('navigation', { name: /Hauptnavigation/ })
      expect(nav.textContent).toContain('Mein Plan')
      expect(nav.textContent).toContain('Vergleich')
    }
  })

  it('lights up Mein Plan on bare / for both saved modes', () => {
    mockViewport('desktop')
    for (const appView of ['compare', 'combine'] as const) {
      cleanup()
      stubLocationSearch('')
      render(<AppHeader route={R('/')} title="" appView={appView} navigate={() => {}} />)
      const active = document.querySelector('.rw-app-header__nav-item--active')
      expect(active?.textContent).toBe('Mein Plan')
    }
  })

  it('lights up Vergleich on /vergleich', () => {
    mockViewport('desktop')
    stubLocationSearch('')
    render(<AppHeader route={R('/vergleich')} title="" appView="combine" navigate={() => {}} />)
    const active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Vergleich')
  })

  it('phone variant no longer renders the "seit 2024" status string (R1.1, C2/Q5)', () => {
    mockViewport('phone')
    const { container } = render(<AppHeader route={R('/')} title="" navigate={() => {}} />)
    expect(container.textContent ?? '').not.toContain('seit 2024')
    expect(container.textContent ?? '').not.toContain('gemeinnützig')
    expect(container.querySelector('.rw-app-header__brand-meta')).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // R2.1 / C1b — active-tab visual treatment + R1.1 `?view=landing` override.
  //
  // The R1.1 commit (PR #296) added the URL-search override so the Vergleich
  // tab routes to /?view=landing (the mode picker) regardless of saved mode.
  // PR 2.1 extends the chrome's active-state resolver to honour the override
  // so the tab the user just clicked is the one that lights up.
  // ---------------------------------------------------------------------------

  it('lights up Startseite (not Vergleich) when URL is /?view=landing', () => {
    // Startseite owns the landing page after the Startseite-fix:
    // clicking the Startseite tab routes to /?view=landing, so the landing
    // URL must light up Startseite. Vergleich still routes to the same URL
    // today (near-duplicate, flagged for cleanup) but does not highlight.
    mockViewport('desktop')
    stubLocationSearch('?view=landing')
    render(<AppHeader route={R('/')} title="" navigate={() => {}} />)
    const active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Startseite')
    // Exactly one tab is active — no simultaneous Startseite + Vergleich.
    const allActive = document.querySelectorAll('.rw-app-header__nav-item--active')
    expect(allActive.length).toBe(1)
  })

  it('lights up Startseite when URL is / with no search param (R1.1 baseline)', () => {
    mockViewport('desktop')
    stubLocationSearch('')
    render(<AppHeader route={R('/')} title="" navigate={() => {}} />)
    const active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Startseite')
  })

  it('applies aria-current="page" to the active desktop top-nav tab', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/methode')} title="" navigate={() => {}} />)
    const current = document.querySelector('[aria-current="page"]')
    expect(current?.textContent).toBe('Methode')
  })

  // PR #298 R1 — Codex P2: after App.tsx's `handleLandingChoice` clears
  // ?view=landing via history.replaceState (no `rentenwiki:navigated` event),
  // the AppHeader must re-derive the active tab on the next parent re-render
  // rather than keeping the stale '?view=landing' string.
  //
  // After the Startseite-fix both before- and after-states highlight Startseite
  // (landing page → Startseite; bare `/` → Startseite). The PR298 regression
  // tested would still be that the resolver re-reads window.location.search
  // synchronously on rerender — we keep the test, but the highlight stays
  // on Startseite throughout the transition.
  it('re-reads search synchronously on parent re-render after replaceState (PR298 R1)', () => {
    mockViewport('desktop')
    stubLocationSearch('?view=landing')
    const { rerender } = render(<AppHeader route={R('/')} title="" navigate={() => {}} />)
    let active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Startseite')
    // Simulate handleLandingChoice('compare'): replaceState without firing
    // rentenwiki:navigated, then a parent re-render from setAppView.
    stubLocationSearch('')
    rerender(<AppHeader route={R('/')} title="" navigate={() => {}} />)
    active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Startseite')
  })
})

describe('MobileNav', () => {
  beforeEach(() => mockViewport('phone'))

  it('renders exactly the two primary destinations', () => {
    render(<MobileNav route={R('/')} navigate={() => {}} />)
    const nav = screen.getByRole('navigation', { name: /Mobile Hauptnavigation/ })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Mein Plan', 'Vergleich'])
    expect(within(nav).getByRole('link', { name: 'Mein Plan' })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: 'Vergleich' })).toHaveAttribute('href', '/vergleich')
  })

  it.each([
    ['Mein Plan', '/'],
    ['Vergleich', '/vergleich'],
  ])('navigates from %s to %s', (label, path) => {
    const navigate = vi.fn()
    render(<MobileNav route={R('/impressum')} navigate={navigate} />)
    fireEvent.click(screen.getByRole('link', { name: label }))
    expect(navigate).toHaveBeenCalledWith(R(path))
  })

  it.each(['/', '/eingaben', '/eingaben/produkte', '/artikel', '/bav-rechner', '/methode', '/impressum'])(
    'leaves both tabs inactive on secondary route %s', (path) => {
      render(<MobileNav route={R(path)} navigate={() => {}} />)
      expect(document.querySelector('[aria-current="page"]')).toBeNull()
    },
  )

  it('leaves both tabs inactive when the landing override is present', () => {
    stubLocationSearch('?view=landing')
    render(<MobileNav route={R('/')} appView="combine" navigate={() => {}} />)
    expect(document.querySelector('[aria-current="page"]')).toBeNull()
  })

  it('lights up Mein Plan on bare / for both saved modes', () => {
    for (const appView of ['compare', 'combine'] as const) {
      cleanup()
      render(<MobileNav route={R('/')} navigate={() => {}} appView={appView} />)
      expect(screen.getByRole('link', { name: 'Mein Plan' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: 'Vergleich' })).not.toHaveAttribute('aria-current')
    }
  })

  it.each([
    ['/vergleich', 'Vergleich'],
    ['/vergleich/details', 'Vergleich'],
    ['/vertrag/etf:abcd', 'Mein Plan'],
    ['/kapital', 'Mein Plan'],
  ])('marks the primary destination on %s', (path, label) => {
    render(<MobileNav route={R(path)} navigate={() => {}} />)
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  it('re-reads search synchronously when the parent changes landing to plan', () => {
    stubLocationSearch('?view=landing')
    const { rerender } = render(<MobileNav route={R('/')} appView="combine" navigate={() => {}} />)
    expect(document.querySelector('[aria-current="page"]')).toBeNull()
    stubLocationSearch('')
    rerender(<MobileNav route={R('/')} appView="combine" navigate={() => {}} />)
    expect(screen.getByRole('link', { name: 'Mein Plan' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('MobileSheet', () => {
  it('lists overflow menu items when open', () => {
    render(<MobileSheet open onClose={() => {}} navigate={() => {}} />)
    for (const label of [
      'Start',
      'Angaben',
      'Artikel',
      'Methode',
      'Datenschutz',
      'Impressum',
      'GitHub',
      'Projekt unterstützen',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('routes Start to the landing page even with a saved plan', () => {
    const navigate = vi.fn()
    const onClose = vi.fn()
    render(<MobileSheet open onClose={onClose} navigate={navigate} route={R('/')} appView="combine" />)
    expect(screen.getByRole('button', { name: 'Start' })).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(navigate).toHaveBeenCalledWith(ROUTES.home, '?view=landing')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('routes Artikel to its hub and closes the menu', () => {
    const navigate = vi.fn()
    const onClose = vi.fn()
    render(<MobileSheet open onClose={onClose} navigate={navigate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Artikel' }))
    expect(navigate).toHaveBeenCalledWith(ROUTES.artikel)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it.each([
    ['/eingaben/produkte', 'Angaben'],
    ['/bav-rechner', 'Artikel'],
  ])('highlights the parent menu item on %s', (path, label) => {
    render(<MobileSheet open onClose={() => {}} navigate={() => {}} route={R(path)} />)
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page')
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  it('highlights Start when the landing override is present', () => {
    stubLocationSearch('?view=landing')
    render(<MobileSheet open onClose={() => {}} navigate={() => {}} route={R('/')} appView="combine" />)
    expect(screen.getByRole('button', { name: 'Start' })).toHaveAttribute('aria-current', 'page')
  })

  it('closes on Escape and removes its key listener when closed', () => {
    const onClose = vi.fn()
    const { rerender } = render(<MobileSheet open onClose={onClose} navigate={() => {}} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    rerender(<MobileSheet open={false} onClose={onClose} navigate={() => {}} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes when the backdrop button is activated', () => {
    const onClose = vi.fn()
    render(<MobileSheet open onClose={onClose} navigate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Menü schließen' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<MobileSheet open={false} onClose={() => {}} navigate={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('calls navigate(/datenschutz) when Datenschutz is tapped', () => {
    const navigate = vi.fn()
    const onClose = vi.fn()
    render(<MobileSheet open onClose={onClose} navigate={navigate} />)
    fireEvent.click(screen.getByText('Datenschutz'))
    expect(navigate).toHaveBeenCalledWith(R('/datenschutz'))
    expect(onClose).toHaveBeenCalled()
  })

  it('routes Methode → /methode (R1.1, C4)', () => {
    const navigate = vi.fn()
    const onClose = vi.fn()
    render(<MobileSheet open onClose={onClose} navigate={navigate} />)
    fireEvent.click(screen.getByText('Methode'))
    expect(navigate).toHaveBeenCalledWith(R('/methode'))
    expect(onClose).toHaveBeenCalled()
  })

  it('routes Angaben → /eingaben', () => {
    const navigate = vi.fn()
    const onClose = vi.fn()
    render(<MobileSheet open onClose={onClose} navigate={navigate} />)
    fireEvent.click(screen.getByText('Angaben'))
    expect(navigate).toHaveBeenCalledWith(R('/eingaben'))
    expect(onClose).toHaveBeenCalled()
  })

  // R2.1 / C1b — visual active state for the overflow sheet item that
  // matches the current route (matches the Sober D canvas left-border
  // accent pattern in responsive-views.jsx).
  it('marks the sheet item that matches the current route as active', () => {
    render(<MobileSheet open onClose={() => {}} navigate={() => {}} route={R('/methode')} />)
    const active = document.querySelector('.rw-mobile-sheet__item--active')
    expect(active?.textContent).toBe('Methode')
    // Only one item should be active at a time.
    const allActive = document.querySelectorAll('.rw-mobile-sheet__item--active')
    expect(allActive.length).toBe(1)
  })

  it('applies aria-current="page" to the active sheet item', () => {
    render(<MobileSheet open onClose={() => {}} navigate={() => {}} route={R('/datenschutz')} />)
    const current = document.querySelector('[aria-current="page"]')
    expect(current?.textContent).toBe('Datenschutz')
  })

  it('marks no item active when route prop is omitted (back-compat)', () => {
    render(<MobileSheet open onClose={() => {}} navigate={() => {}} />)
    expect(document.querySelector('.rw-mobile-sheet__item--active')).toBeNull()
  })

  it('marks no item active when current route does not match any sheet item', () => {
    render(<MobileSheet open onClose={() => {}} navigate={() => {}} route={R('/vergleich')} />)
    expect(document.querySelector('.rw-mobile-sheet__item--active')).toBeNull()
  })
})

// `MethodFooter` was folded into `LegalFooter` so the site has a single
// footer per page. The methodology row + "Methode im Detail" link assertions
// now live in `src/features/legal/LegalFooter.test.tsx`.

describe('RightRailAccordion', () => {
  it('renders as a fixed-width aside on desktop', () => {
    mockViewport('desktop')
    render(
      <RightRailAccordion label="Deine Angaben" count={12}>
        <span>inner</span>
      </RightRailAccordion>,
    )
    const aside = document.querySelector('aside.rw-right-rail--desktop')
    expect(aside).toBeInTheDocument()
    expect(aside?.textContent).toContain('Deine Angaben')
    expect(aside?.textContent).toContain('inner')
  })

  it('narrows to ~240px aside on tablet', () => {
    mockViewport('tablet')
    const { container } = render(
      <RightRailAccordion label="Deine Angaben" desktopWidth={320}>
        <span>inner</span>
      </RightRailAccordion>,
    )
    const aside = container.querySelector('aside.rw-right-rail--tablet') as HTMLElement | null
    expect(aside).toBeInTheDocument()
    // Inline style should be capped at 240 even though desktopWidth=320.
    expect(aside?.style.width).toBe('240px')
  })

  it('collapses to a sticky strip on phone and opens a drawer on tap', () => {
    mockViewport('phone')
    render(
      <RightRailAccordion label="Deine Angaben" count={12}>
        <span>inner</span>
      </RightRailAccordion>,
    )
    // No aside on phone.
    expect(document.querySelector('aside.rw-right-rail--desktop')).not.toBeInTheDocument()
    // Strip is rendered as a button with the label + count.
    const strip = document.querySelector('.rw-right-rail__strip') as HTMLElement | null
    expect(strip).toBeInTheDocument()
    expect(strip?.textContent).toContain('Deine Angaben')
    expect(strip?.textContent).toContain('(12 Werte)')
    // Drawer not open yet.
    expect(document.querySelector('.rw-right-rail__drawer')).not.toBeInTheDocument()
    // Tap to open.
    fireEvent.click(strip!)
    expect(document.querySelector('.rw-right-rail__drawer')).toBeInTheDocument()
    expect(screen.getByText('inner')).toBeInTheDocument()
  })

  it('renders the drawer as a labelled region (not a fake non-modal dialog)', () => {
    mockViewport('phone')
    render(
      <RightRailAccordion label="Deine Angaben">
        <span>inner</span>
      </RightRailAccordion>,
    )
    fireEvent.click(document.querySelector('.rw-right-rail__strip')!)
    const drawer = document.querySelector('.rw-right-rail__drawer') as HTMLElement | null
    expect(drawer).toBeInTheDocument()
    expect(drawer?.getAttribute('role')).toBe('region')
    expect(drawer?.getAttribute('aria-label')).toBe('Deine Angaben')
    expect(drawer?.getAttribute('aria-modal')).toBeNull()
  })

  it('focuses the close button when the drawer opens and Esc dismisses it', () => {
    mockViewport('phone')
    render(
      <RightRailAccordion label="Deine Angaben">
        <span>inner</span>
      </RightRailAccordion>,
    )
    const strip = document.querySelector('.rw-right-rail__strip') as HTMLElement | null
    fireEvent.click(strip!)
    const closeBtn = document.querySelector('.rw-right-rail__drawer-close') as HTMLElement | null
    expect(closeBtn).toBeInTheDocument()
    expect(document.activeElement).toBe(closeBtn)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.rw-right-rail__drawer')).not.toBeInTheDocument()
    // After dismissal, keyboard focus should land back on the strip trigger
    // that opened the drawer (continuous focus path — CodeRabbit nit).
    expect(document.activeElement).toBe(strip)
  })
})

describe('AppShell composition', () => {
  it('renders disclaimer, status bar, header, body on desktop', () => {
    mockViewport('desktop')
    render(
      <AppShell route={R('/')} navigate={() => {}} title="Demo">
        <div data-testid="body">page body</div>
      </AppShell>,
    )
    // Disclaimer first child of shell (P0 invariant for live-shell parity with PrintReport).
    const shell = document.querySelector('.rw-app-shell')
    expect(shell?.firstElementChild?.classList.contains('disclaimer-wrap')).toBe(true)
    expect(document.querySelector('.rw-status-bar')).toBeInTheDocument()
    expect(document.querySelector('.rw-app-header')).toBeInTheDocument()
    expect(screen.getByTestId('body')).toBeInTheDocument()
    // The legacy MethodFooter has been folded into LegalFooter (rendered per
    // page inside the body slot), so AppShell itself no longer renders a
    // standalone `.rw-method-footer` element.
    expect(document.querySelector('.rw-method-footer')).not.toBeInTheDocument()
    // Mobile nav NOT mounted on desktop.
    expect(document.querySelector('.rw-mobile-nav')).not.toBeInTheDocument()
  })

  it('mounts MobileNav on phone', () => {
    mockViewport('phone')
    render(
      <AppShell route={R('/')} navigate={() => {}} title="Demo">
        <div>body</div>
      </AppShell>,
    )
    expect(document.querySelector('.rw-mobile-nav')).toBeInTheDocument()
    expect(document.querySelector('.rw-app-shell--phone')).toBeInTheDocument()
  })

  it('applies editorial mode class when prop is true', () => {
    mockViewport('desktop')
    render(
      <AppShell route={R('/')} navigate={() => {}} editorial>
        <div>body</div>
      </AppShell>,
    )
    expect(document.querySelector('.rw-app-shell--editorial')).toBeInTheDocument()
  })

  it('lights up Startseite tab end-to-end when URL carries ?view=landing', () => {
    mockViewport('desktop')
    stubLocationSearch('?view=landing')
    render(
      <AppShell route={R('/')} navigate={() => {}} title="Demo">
        <div>body</div>
      </AppShell>,
    )
    // The chrome's active-tab resolver consumes window.location.search;
    // the AppShell composition must pass the URL state down to AppHeader
    // without intermediate refactoring breaking the chain.
    const active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Startseite')
  })

  it('lights up Vergleich tab end-to-end when the route is /vergleich', () => {
    mockViewport('desktop')
    stubLocationSearch('')
    render(
      <AppShell route={R('/vergleich')} navigate={() => {}} title="Demo" appView="compare">
        <div>body</div>
      </AppShell>,
    )
    const active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Vergleich')
  })

  it('lights up Mein Plan tab end-to-end when appView=combine flows through AppShell', () => {
    mockViewport('desktop')
    stubLocationSearch('')
    render(
      <AppShell route={R('/')} navigate={() => {}} title="Demo" appView="combine">
        <div>body</div>
      </AppShell>,
    )
    const active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Mein Plan')
  })

  it('survives every viewport variant', () => {
    eachViewport(() => {
      const { unmount } = render(
        <AppShell route={R('/')} navigate={() => {}} title="Demo">
          <div>body</div>
        </AppShell>,
      )
      expect(document.querySelector('.rw-app-shell')).toBeInTheDocument()
      expect(document.querySelector('.disclaimer-wrap')).toBeInTheDocument()
      unmount()
    })
  })
})
