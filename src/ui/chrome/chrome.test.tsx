// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { mockViewport, eachViewport } from '../../test/viewport'
import { StatusBar } from './StatusBar'
import { AppHeader } from './AppHeader'
import { MobileNav } from './MobileNav'
import { MobileSheet } from './MobileSheet'
import { MethodFooter } from './MethodFooter'
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
    expect(bar?.textContent).toContain('Gemeinnütziges Projekt')
    expect(bar?.textContent).toContain('Open Source')
    // P0 guardrail: the internal working name must not appear in public chrome.
    expect(bar?.textContent).not.toContain('Rentenrechner')
  })

  it('uses the tablet variant at tablet width', () => {
    mockViewport('tablet')
    const { container } = render(<StatusBar />)
    expect(container.querySelector('.rw-status-bar--tablet')).toBeInTheDocument()
    expect(container.querySelector('.rw-status-bar--desktop')).not.toBeInTheDocument()
  })

  it('compacts to URL + version on phone', () => {
    mockViewport('phone')
    const { container } = render(<StatusBar />)
    const bar = container.querySelector('.rw-status-bar--phone')
    expect(bar).toBeInTheDocument()
    expect(bar?.textContent).toContain('rentenwiki.de')
    expect(bar?.textContent).not.toContain('Gemeinnütziges Projekt')
  })
})

describe('activeChromeNavId (R1.1 ?view=landing override resolver)', () => {
  it('maps / + empty search to "home" (regression: R1.1 unchanged routeToNavId)', () => {
    expect(activeChromeNavId(ROUTES.home, '')).toBe('home')
    // Sanity: the underlying routeToNavId is unchanged for the home route.
    expect(routeToNavId(ROUTES.home)).toBe('home')
  })

  it('maps / + ?view=landing to "compare" (R1.1 invariant: Vergleich tab lights up)', () => {
    expect(activeChromeNavId(ROUTES.home, '?view=landing')).toBe('compare')
    // The URL-only resolver still returns "home" — the override is
    // chrome-internal only and must not leak into route semantics.
    expect(routeToNavId(ROUTES.home)).toBe('home')
  })

  it('ignores ?view=landing on non-home routes (override is home-only)', () => {
    expect(activeChromeNavId(ROUTES.methode, '?view=landing')).toBe('method')
    expect(activeChromeNavId(ROUTES.eingaben, '?view=landing')).toBe('angaben')
    expect(activeChromeNavId(ROUTES.artikel, '?view=landing')).toBe('artikel')
  })

  it('returns null for legal routes regardless of search', () => {
    expect(activeChromeNavId(ROUTES.impressum, '')).toBeNull()
    expect(activeChromeNavId(ROUTES.datenschutz, '?view=landing')).toBeNull()
  })

  it('ignores unsupported ?view= values (only "landing" is honoured)', () => {
    // Defensive: appViewFromUrl rejects compare/combine/unknown — the
    // chrome must not light up Vergleich for those either.
    expect(activeChromeNavId(ROUTES.home, '?view=compare')).toBe('home')
    expect(activeChromeNavId(ROUTES.home, '?view=combine')).toBe('home')
    expect(activeChromeNavId(ROUTES.home, '?view=garbage')).toBe('home')
  })
})

describe('AppHeader', () => {
  it('renders kicker + H1 + 5-tab nav on desktop', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/')} kicker="TEST" title="Hallo" navigate={() => {}} />)
    expect(screen.getByText('TEST')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hallo' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: /Hauptnavigation/ })
    expect(nav).toBeInTheDocument()
    // PR 5: "Mein Plan" placeholder replaced by clickable "Angaben"
    // (routes to /eingaben). The Annahmen tab is no longer in chrome;
    // it folds into § 4 of /eingaben.
    for (const label of ['Startseite', 'Angaben', 'Vergleich', 'Artikel', 'Methode']) {
      expect(nav.textContent).toContain(label)
    }
    // Sanity: the old placeholder copy and the Annahmen tab must not return.
    expect(nav.textContent).not.toContain('Mein Plan')
    expect(nav.textContent).not.toContain('Annahmen')
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
    render(<AppHeader route={R('/')} title="Hallo" navigate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Menü öffnen/ }))
    expect(screen.getByRole('dialog', { name: /Weitere Menüpunkte/ })).toBeInTheDocument()
  })

  it('navigate is called when Startseite is clicked on desktop', () => {
    mockViewport('desktop')
    const navigate = vi.fn()
    render(<AppHeader route={R('/impressum')} title="" navigate={navigate} />)
    fireEvent.click(screen.getByText('Startseite'))
    expect(navigate).toHaveBeenCalledWith(R('/'))
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

  it('renders Vergleich as a real anchor with href=/?view=landing on desktop (R1.1+PR296)', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/')} title="" navigate={() => {}} />)
    // The Vergleich tab is an anchor that carries ?view=landing so that
    // middle-click / right-click / SSR all land on the mode-picker (PR #296 R1 fix).
    const tab = screen.getByText('Vergleich')
    expect(tab.tagName).toBe('A')
    expect(tab.getAttribute('href')).toBe('/?view=landing')
    expect(tab.classList.contains('rw-app-header__nav-item--placeholder')).toBe(false)
  })

  it('SPA-navigates to ROUTES.home with ?view=landing when Vergleich is clicked on desktop (PR296 R1)', () => {
    mockViewport('desktop')
    const navigate = vi.fn()
    render(<AppHeader route={R('/impressum')} title="" navigate={navigate} />)
    fireEvent.click(screen.getByText('Vergleich'))
    expect(navigate).toHaveBeenCalledWith(R('/'), '?view=landing')
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

  it('lights up Vergleich (not Startseite) when URL is /?view=landing (R1.1 invariant + R2.1)', () => {
    mockViewport('desktop')
    stubLocationSearch('?view=landing')
    render(<AppHeader route={R('/')} title="" navigate={() => {}} />)
    const active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active?.textContent).toBe('Vergleich')
    // Startseite must NOT be highlighted simultaneously — the override
    // chooses the destination tab unambiguously.
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
})

describe('MobileNav', () => {
  beforeEach(() => mockViewport('phone'))

  it('renders all five tabs', () => {
    render(<MobileNav route={R('/')} navigate={() => {}} />)
    const nav = screen.getByRole('navigation', { name: /Mobile Hauptnavigation/ })
    // PR 5: "Plan" placeholder replaced by clickable "Angaben"
    // (routes to /eingaben). Annahmen tab is removed (folds into § 4).
    for (const label of ['Start', 'Angaben', 'Vergleich', 'Artikel', 'Methode']) {
      expect(nav.textContent).toContain(label)
    }
    expect(nav.textContent).not.toContain('Annahmen')
  })

  it('marks Start as active when route is /', () => {
    render(<MobileNav route={R('/')} navigate={() => {}} />)
    const active = document.querySelector('.rw-mobile-nav__tab--active')
    expect(active?.textContent).toBe('Start')
  })

  it('keeps the unbuilt tabs as inert placeholders (PR 5: Vergleich only)', () => {
    render(<MobileNav route={R('/')} navigate={() => {}} />)
    const placeholders = document.querySelectorAll('.rw-mobile-nav__tab--placeholder')
    // PR 3 promoted Artikel; PR 4 promoted Methode; PR 5 promotes Angaben.
    // Only Vergleich remains as an inert placeholder (PR 9 will ship it).
    expect(placeholders.length).toBe(1)
  })

  it('navigates home when Start is tapped', () => {
    const navigate = vi.fn()
    render(<MobileNav route={R('/impressum')} navigate={navigate} />)
    fireEvent.click(screen.getByText('Start'))
    expect(navigate).toHaveBeenCalledWith(R('/'))
  })

  it('navigates to /artikel when Artikel is tapped (PR 3)', () => {
    const navigate = vi.fn()
    render(<MobileNav route={R('/')} navigate={navigate} />)
    fireEvent.click(screen.getByText('Artikel'))
    expect(navigate).toHaveBeenCalledWith(R('/artikel'))
  })

  it('highlights Artikel as active on a clustered topic route', () => {
    render(<MobileNav route={R('/bav-rechner')} navigate={() => {}} />)
    const active = document.querySelector('.rw-mobile-nav__tab--active')
    expect(active?.textContent).toBe('Artikel')
  })

  it('navigates to /methode when Methode is tapped (PR 4)', () => {
    const navigate = vi.fn()
    render(<MobileNav route={R('/')} navigate={navigate} />)
    fireEvent.click(screen.getByText('Methode'))
    expect(navigate).toHaveBeenCalledWith(R('/methode'))
  })

  it('highlights Methode as active when route is /methode (PR 4)', () => {
    render(<MobileNav route={R('/methode')} navigate={() => {}} />)
    const active = document.querySelector('.rw-mobile-nav__tab--active')
    expect(active?.textContent).toBe('Methode')
  })

  it('navigates to /eingaben when Angaben is tapped (PR 5)', () => {
    const navigate = vi.fn()
    render(<MobileNav route={R('/')} navigate={navigate} />)
    fireEvent.click(screen.getByText('Angaben'))
    expect(navigate).toHaveBeenCalledWith(R('/eingaben'))
  })

  it('highlights Angaben as active when route is /eingaben (PR 5)', () => {
    render(<MobileNav route={R('/eingaben')} navigate={() => {}} />)
    const active = document.querySelector('.rw-mobile-nav__tab--active')
    expect(active?.textContent).toBe('Angaben')
  })

  // R2.1 / C1b — same `?view=landing` override semantics on the phone bottom-tab.
  it('lights up Vergleich on phone bottom-tab when URL is /?view=landing (R1.1 + R2.1)', () => {
    stubLocationSearch('?view=landing')
    render(<MobileNav route={R('/')} navigate={() => {}} />)
    const active = document.querySelector('.rw-mobile-nav__tab--active')
    expect(active?.textContent).toBe('Vergleich')
    const allActive = document.querySelectorAll('.rw-mobile-nav__tab--active')
    expect(allActive.length).toBe(1)
  })

  it('lights up Start when URL is / with no search param (R1.1 baseline on phone)', () => {
    stubLocationSearch('')
    render(<MobileNav route={R('/')} navigate={() => {}} />)
    const active = document.querySelector('.rw-mobile-nav__tab--active')
    expect(active?.textContent).toBe('Start')
  })

  it('applies aria-current="page" to the active bottom-tab link', () => {
    render(<MobileNav route={R('/methode')} navigate={() => {}} />)
    const current = document.querySelector('[aria-current="page"]')
    expect(current?.textContent).toBe('Methode')
  })
})

describe('MobileSheet', () => {
  it('lists overflow menu items when open', () => {
    render(<MobileSheet open onClose={() => {}} navigate={() => {}} />)
    for (const label of ['Methode', 'Annahmen', 'Datenschutz', 'Impressum', 'GitHub', 'Spenden']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
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

  it('routes Annahmen → /eingaben (R1.1, C4)', () => {
    const navigate = vi.fn()
    const onClose = vi.fn()
    render(<MobileSheet open onClose={onClose} navigate={navigate} />)
    fireEvent.click(screen.getByText('Annahmen'))
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
    // `/artikel` is a top-nav destination, not a sheet item — nothing
    // should highlight even though the sheet is open.
    render(<MobileSheet open onClose={() => {}} navigate={() => {}} route={R('/artikel')} />)
    expect(document.querySelector('.rw-mobile-sheet__item--active')).toBeNull()
  })
})

describe('MethodFooter', () => {
  it('renders the footnote row on desktop', () => {
    mockViewport('desktop')
    render(<MethodFooter navigate={() => {}} />)
    expect(document.querySelector('.rw-method-footer--desktop')).toBeInTheDocument()
    expect(screen.getByText(/Annahme: 5 % Rendite/)).toBeInTheDocument()
  })

  it('uses the tablet variant on tablet width', () => {
    mockViewport('tablet')
    render(<MethodFooter navigate={() => {}} />)
    expect(document.querySelector('.rw-method-footer--tablet')).toBeInTheDocument()
  })

  it('renders nothing on phone (page handles inline link)', () => {
    mockViewport('phone')
    const { container } = render(<MethodFooter navigate={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders "Methode im Detail" as a real <a href="/methode"> (R1.1, C5)', () => {
    mockViewport('desktop')
    render(<MethodFooter navigate={() => {}} />)
    const link = screen.getByText(/Methode im Detail/)
    // The element must be an anchor, not a span — keyboard-tabbable + crawlable.
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/methode')
  })

  it('SPA-navigates to /methode on primary click (R1.1, C5)', () => {
    mockViewport('desktop')
    const navigate = vi.fn()
    render(<MethodFooter navigate={navigate} />)
    fireEvent.click(screen.getByText(/Methode im Detail/))
    expect(navigate).toHaveBeenCalledWith(R('/methode'))
  })
})

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
  it('renders disclaimer, status bar, header, body, footer on desktop', () => {
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
    expect(document.querySelector('.rw-method-footer')).toBeInTheDocument()
    // Mobile nav NOT mounted on desktop.
    expect(document.querySelector('.rw-mobile-nav')).not.toBeInTheDocument()
  })

  it('mounts MobileNav and skips MethodFooter on phone', () => {
    mockViewport('phone')
    render(
      <AppShell route={R('/')} navigate={() => {}} title="Demo">
        <div>body</div>
      </AppShell>,
    )
    expect(document.querySelector('.rw-mobile-nav')).toBeInTheDocument()
    expect(document.querySelector('.rw-method-footer')).not.toBeInTheDocument()
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

  it('lights up Vergleich tab end-to-end when URL carries ?view=landing (R1.1 + R2.1)', () => {
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
    expect(active?.textContent).toBe('Vergleich')
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
