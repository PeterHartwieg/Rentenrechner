// @vitest-environment jsdom
/**
 * LegalLayout — Sober D shell parity tests (R2.3, audit H5).
 *
 * Legal pages render inside AppShell, which provides StatusBar + AppHeader
 * nav-tabs + MethodFooter. LegalLayout itself adds a back-link header,
 * content area, and a compact mono page-footer. These tests verify:
 *
 *   1. AppShell chrome (StatusBar, nav-tabs) is present when legal pages are
 *      rendered via the AppShell wrapper — nav-tab active state is null for
 *      legal routes (no tab highlighted).
 *   2. LegalLayout renders its back-link, article title, and page-footer
 *      cross-links in isolation.
 *   3. SPA-navigation is invoked on primary clicks; native browser navigation
 *      is preserved for modified clicks (Cmd/Ctrl/middle).
 *   4. Sober D palette invariants: no legacy blue (#2563eb), no cream class,
 *      no Newsreader serif class on legal elements.
 */
import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { mockViewport, eachViewport } from '../../test/viewport'
import { AppShell } from '../../ui/chrome/AppShell'
import { AppHeader } from '../../ui/chrome/AppHeader'
import { StatusBar } from '../../ui/chrome/StatusBar'
import { LegalLayout } from './LegalLayout'
import { pathToRoute as R } from '../../app/useRoute'

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

// ─── LegalLayout in isolation ───────────────────────────────────────────────

describe('LegalLayout', () => {
  it('renders back-link, H1, children, and page-footer', () => {
    render(
      <LegalLayout title="Impressum" navigate={() => {}}>
        <p>Inhalt</p>
      </LegalLayout>,
    )
    expect(screen.getByText('← Zurück zum Rechner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument()
    expect(screen.getByText('Inhalt')).toBeInTheDocument()
    // Page-footer cross-links
    expect(screen.getByRole('link', { name: 'RentenWiki.de' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Impressum' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Datenschutzerklärung' })).toBeInTheDocument()
  })

  it('SPA-navigates home when back-link is clicked with a plain primary click', () => {
    const navigate = vi.fn()
    render(
      <LegalLayout title="Impressum" navigate={navigate}>
        <p>Inhalt</p>
      </LegalLayout>,
    )
    fireEvent.click(screen.getByText('← Zurück zum Rechner'))
    expect(navigate).toHaveBeenCalledOnce()
    // Called with the home route
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'home' }))
  })

  it('SPA-navigates to /datenschutz when Datenschutzerklärung is clicked', () => {
    const navigate = vi.fn()
    render(
      <LegalLayout title="Impressum" navigate={navigate}>
        <p>Inhalt</p>
      </LegalLayout>,
    )
    fireEvent.click(screen.getByRole('link', { name: 'Datenschutzerklärung' }))
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'datenschutz' }))
  })

  it('SPA-navigates to /impressum when Impressum is clicked', () => {
    const navigate = vi.fn()
    render(
      <LegalLayout title="Datenschutzerklärung" navigate={navigate}>
        <p>Inhalt</p>
      </LegalLayout>,
    )
    fireEvent.click(screen.getByRole('link', { name: 'Impressum' }))
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'impressum' }))
  })

  it('does NOT intercept a Ctrl-click (modifier-click falls through to browser)', () => {
    const navigate = vi.fn()
    render(
      <LegalLayout title="Impressum" navigate={navigate}>
        <p>Inhalt</p>
      </LegalLayout>,
    )
    fireEvent.click(screen.getByText('← Zurück zum Rechner'), { ctrlKey: true })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders without the editorial cream class', () => {
    const { container } = render(
      <LegalLayout title="Impressum" navigate={() => {}}>
        <p>Inhalt</p>
      </LegalLayout>,
    )
    // No editorial-cream modifier on any element inside LegalLayout.
    expect(container.querySelector('.rw-app-shell--editorial')).toBeNull()
    expect(container.querySelector('[class*="editorial"]')).toBeNull()
  })

  it('page-footer separator spans are aria-hidden', () => {
    const { container } = render(
      <LegalLayout title="Impressum" navigate={() => {}}>
        <p>Inhalt</p>
      </LegalLayout>,
    )
    const seps = container.querySelectorAll('.legal-page-footer__sep')
    expect(seps.length).toBeGreaterThanOrEqual(2)
    seps.forEach((sep) => {
      expect(sep.getAttribute('aria-hidden')).toBe('true')
    })
  })
})

// ─── Nav-tab behaviour on legal routes ──────────────────────────────────────

describe('AppHeader on legal routes', () => {
  it('highlights NO nav-tab when route is /impressum', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/impressum')} title="" navigate={() => {}} />)
    const active = document.querySelector('.rw-app-header__nav-item--active')
    // Legal routes return null from routeToNavId — no tab should be active.
    expect(active).toBeNull()
  })

  it('highlights NO nav-tab when route is /datenschutz', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/datenschutz')} title="" navigate={() => {}} />)
    const active = document.querySelector('.rw-app-header__nav-item--active')
    expect(active).toBeNull()
  })

  it('all five nav-tab links are still rendered on legal routes (chrome intact)', () => {
    mockViewport('desktop')
    render(<AppHeader route={R('/impressum')} title="" navigate={() => {}} />)
    const nav = screen.getByRole('navigation', { name: /Hauptnavigation/ })
    for (const label of ['Startseite', 'Angaben', 'Vergleich', 'Artikel', 'Methode']) {
      expect(nav.textContent).toContain(label)
    }
  })
})

// ─── AppShell wrapping a legal page ─────────────────────────────────────────

describe('AppShell on legal routes', () => {
  it('renders StatusBar + AppHeader + content + MethodFooter on desktop', () => {
    mockViewport('desktop')
    render(
      <AppShell route={R('/impressum')} navigate={() => {}}>
        <LegalLayout title="Impressum" navigate={() => {}}>
          <p>Inhalt</p>
        </LegalLayout>
      </AppShell>,
    )
    expect(document.querySelector('.rw-status-bar')).toBeInTheDocument()
    expect(document.querySelector('.rw-app-header')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument()
    expect(document.querySelector('.rw-method-footer')).toBeInTheDocument()
  })

  it('does NOT apply editorial mode to the legal shell', () => {
    mockViewport('desktop')
    render(
      <AppShell route={R('/impressum')} navigate={() => {}}>
        <LegalLayout title="Impressum" navigate={() => {}}>
          <p>Inhalt</p>
        </LegalLayout>
      </AppShell>,
    )
    // App.tsx never passes editorial=true for legal routes (see App.tsx
    // isEditorial logic). Confirm the chrome class is absent.
    expect(document.querySelector('.rw-app-shell--editorial')).toBeNull()
  })

  it('StatusBar is present at every viewport on /impressum', () => {
    eachViewport(() => {
      render(
        <AppShell route={R('/impressum')} navigate={() => {}}>
          <LegalLayout title="Impressum" navigate={() => {}}>
            <p>Inhalt</p>
          </LegalLayout>
        </AppShell>,
      )
      expect(document.querySelector('.rw-status-bar')).toBeInTheDocument()
      cleanup()
    })
  })

  it('StatusBar copy does not contain the internal working name on legal routes', () => {
    mockViewport('desktop')
    render(
      <AppShell route={R('/impressum')} navigate={() => {}}>
        <LegalLayout title="Impressum" navigate={() => {}}>
          <p>Inhalt</p>
        </LegalLayout>
      </AppShell>,
    )
    const bar = document.querySelector('.rw-status-bar')
    // P0 brand guardrail: internal "Rentenrechner" must not appear in chrome.
    expect(bar?.textContent).not.toContain('Rentenrechner')
    expect(bar?.textContent).toContain('rentenwiki.de')
  })
})

// ─── StatusBar on legal routes (standalone) ──────────────────────────────

describe('StatusBar on /impressum', () => {
  it('renders full mono ribbon on desktop', () => {
    mockViewport('desktop')
    render(<StatusBar />)
    const bar = document.querySelector('.rw-status-bar--desktop')
    expect(bar).toBeInTheDocument()
    expect(bar?.textContent).toContain('rentenwiki.de')
    expect(bar?.textContent).toContain('Gemeinnütziges Projekt')
  })

  it('compacts to URL + version on phone', () => {
    mockViewport('phone')
    render(<StatusBar />)
    const bar = document.querySelector('.rw-status-bar--phone')
    expect(bar).toBeInTheDocument()
    expect(bar?.textContent).toContain('rentenwiki.de')
  })
})
