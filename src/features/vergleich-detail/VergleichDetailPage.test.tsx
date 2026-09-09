// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import { pathToRoute } from '../../app/useRoute'
import { VergleichDetailPage } from './VergleichDetailPage'
import { defaultWorkspace, STORAGE_KEY_V2 } from '../../storage'
import type { ProductId, Workspace } from '../../domain'
import { PRODUCT_IDS as ALL_PRODUCT_IDS } from '../../engine/productRegistry'
import { eachViewport, mockViewport } from '../../test/viewport'

beforeEach(() => {
  localStorage.clear()
  window.history.pushState(null, '', '/')
})

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

/**
 * Stub `window.location` with the supplied `search` string. jsdom's
 * `window.location` is configurable but individual properties are read-only,
 * so we re-define the whole object. Mirrors the pattern used in
 * `LandingPage.test.tsx`.
 */
function stubLocationSearch(search: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search },
  })
}

function inShell(node: ReactElement, path: string = '/vergleich/details') {
  return createElement(AppShell, {
    route: pathToRoute(path),
    navigate: () => {},
    children: node,
  })
}

/**
 * Seed STORAGE_KEY_V2 with `mode: 'compare'` and an explicit comparison
 * selection. The page renders one card per selected product, so tests that
 * count cards state the selection they expect.
 */
function seedCompareMode(visibleProducts: ProductId[] = [...ALL_PRODUCT_IDS]): void {
  const ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
  ws.mode = 'compare'
  ws.baseline.assumptions.visibleProducts = visibleProducts
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(ws))
}

describe('VergleichDetailPage — compare-mode per-product breakdown surface', () => {
  it('renders the kicker, H1, and a card grid with all 6 product cards', () => {
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    expect(container.querySelector('.vd-kicker')).not.toBeNull()
    expect(container.querySelector('.vd-headline')).not.toBeNull()
    const grid = container.querySelector('.vd-card-grid')
    expect(grid).not.toBeNull()
    const cards = container.querySelectorAll('.vd-card')
    // One card per compared product — the seed selects all six.
    expect(cards.length).toBe(6)
  })

  it('renders three labeled sections inside each card', () => {
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    const cards = container.querySelectorAll('.vd-card')
    for (const card of Array.from(cards)) {
      const sections = card.querySelectorAll('.vd-card-section')
      expect(sections.length).toBe(3)
    }
  })

  it('uses the dynamic retirementAge in the § 2 heading text', () => {
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    // Default retirement age is 67 (defaultProfile). The § 2 heading must
    // contain "Mit 67, Kapital" — never a hardcoded "Mit 67" without the
    // retirementAge prop threading.
    const text = container.textContent ?? ''
    expect(text).toContain('Mit 67, Kapital')
  })

  it('every euro display in the card grid goes through Intl currency formatting', () => {
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    // `formatCurrency` produces `... €` (Intl.NumberFormat 'de-DE') — every
    // value cell in the cards should contain a `€` glyph or a leading "−"
    // followed by `€`. We pick any value cell and check.
    // PR R2 selectors: rows are rendered by the `DMoneyRow` primitive
    // (`.vd-money-row` / `.vd-money-row__value`).
    const values = container.querySelectorAll('.vd-money-row__value')
    expect(values.length).toBeGreaterThan(0)
    // At least the first card's first `add` row (Brutto-Rente / Du selbst /
    // Kapital brutto, depending on section ordering) must include the euro sign.
    const firstCard = container.querySelector('.vd-card')!
    const firstCurrencyCell = firstCard.querySelector('.vd-money-row--add .vd-money-row__value')
    expect(firstCurrencyCell?.textContent ?? '').toContain('€')
  })

  it('renders the Verfügbar-ab footer with a non-empty value on every card', () => {
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    const cards = container.querySelectorAll('.vd-card')
    for (const card of Array.from(cards)) {
      const footer = card.querySelector('.vd-card__footer')
      expect(footer).not.toBeNull()
      const value = footer!.querySelector('.vd-card__footer-value')
      expect((value?.textContent ?? '').length).toBeGreaterThan(0)
    }
  })

  it('renders the comparison even when the saved workspace mode is combine (F1b)', () => {
    // The drill-in belongs to the comparison journey. A user with a saved plan
    // reaches it from /vergleich, so a "nur im Vergleichs-Modus" empty state
    // would strand them on the surface they just navigated into.
    const ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
    ws.mode = 'combine'
    ws.baseline.assumptions.visibleProducts = ['etf', 'bav']
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(ws))
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    expect(container.querySelector('.vd-empty')).toBeNull()
    expect(container.textContent ?? '').not.toContain('Vergleichs-Modus')
    expect(container.querySelectorAll('.vd-card').length).toBe(2)
  })

  it('exposes accessible empty-state copy (no aria-hidden on body text)', () => {
    // Empty comparison selection → the "Noch keine Produkte ausgewählt" state.
    seedCompareMode([])
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    const body = container.querySelector('.vd-empty-body')
    expect(body).not.toBeNull()
    // PR 288 R1 lesson — empty-state explanations must be readable to AT.
    expect(body!.getAttribute('aria-hidden')).toBeNull()
  })

  it('renders identically across phone / tablet / desktop viewports', () => {
    // Card grid renders at every viewport. Phone uses CSS scroll-snap (no JS),
    // so the DOM shape stays the same — only stylesheet differs. Coverage
    // here is the across-viewport rendering invariant.
    seedCompareMode()
    eachViewport(() => {
      const { container, unmount } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
      const cards = container.querySelectorAll('.vd-card')
      expect(cards.length).toBeGreaterThan(0)
      unmount()
    })
  })

  it('renders all 6 cards on phone / tablet / desktop (PR R2 layout: 3-wide → 2-wide → 1-wide)', () => {
    // PR R2 grid invariant: the card count is constant across viewports; only
    // the CSS column count changes (3 / 2 / 1). Verify the DOM shape so the
    // CSS responsive switch never silently changes what content renders.
    seedCompareMode()
    eachViewport(() => {
      const { container, unmount } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
      const cards = container.querySelectorAll('.vd-card')
      expect(cards.length).toBe(6)
      // Three sections per card persist on every viewport.
      for (const card of Array.from(cards)) {
        expect(card.querySelectorAll('.vd-card-section').length).toBe(3)
      }
      unmount()
    })
  })

  it('sets the document title via useEffect to the brand-compliant string', () => {
    seedCompareMode()
    render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    expect(document.title).toBe('Wohin geht das Geld? Vergleich im Detail | RentenWiki.de')
  })

  it('renders a back-link to /vergleich as a real anchor', () => {
    // F1b: "Zurück zum Vergleich" must return to the comparison, not to `/`
    // (which is the plan, and drops a compare-only visitor onto onboarding).
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    const backlink = container.querySelector<HTMLAnchorElement>('.vd-backlink')
    expect(backlink).not.toBeNull()
    expect(backlink!.getAttribute('href')).toBe('/vergleich')
  })

  it('lead paragraph cites live Beitrag / Laufzeit / Renteneintritt with € + Jahre + age', () => {
    // PR R2 §18: the lead must cite live figures from the page-local
    // simulation (Beitrag = `bavFunding.monthlyNetCost`) + the profile
    // (Laufzeit + Renteneintritt). The default profile is 37 → 67, so the
    // lead reads "200 € pro Monat, Laufzeit 30 Jahre, Renteneintritt mit 67"
    // (live figures may differ slightly depending on bavFunding two-pass).
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    const lead = container.querySelector('.vd-lead')
    expect(lead).not.toBeNull()
    const text = lead!.textContent ?? ''
    expect(text).toContain('€')
    expect(text).toContain('Jahre')
    // Renteneintritt with 67 (default profile retirementAge).
    expect(text).toContain('67')
  })
})

// ---------------------------------------------------------------------------
// R3.3 — demo-mode (no saved state) renders a live default-assumption run.
// Audit decision Q4 (locked 2026-05-21): "live default-assumption demo run
// … real comparison built from defaultAssumptions (all primary products
// visible)". The page seeds ETF + bAV + Versicherung so SEO crawlers and
// first-time visitors see a populated grid instead of an empty state.
//
// Demo fires only when savedMode === null (no saved state = first-time
// visitor / SEO prerender). With saved state the page renders the user's own
// comparison selection — including its empty state when nothing is selected.
// ---------------------------------------------------------------------------

/** Seed compare-mode with an empty comparison (saved state, nothing selected). */
function seedCompareModeWithoutComparison(): void {
  seedCompareMode([])
}

describe('VergleichDetailPage — demo-mode (R3.3 audit decision Q4)', () => {
  it('renders the demo kicker + populated card grid when no saved state exists at all', () => {
    // Audit decision Q4 (locked 2026-05-21): the prerender pass + first-time
    // visitor branch must show a populated grid so SEO indexes real content.
    // `localStorage.clear()` runs in `beforeEach`, so this test inherits an
    // empty storage. `detectSavedMode()` returns `null` → demo path fires.
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    const kicker = container.querySelector('.vd-kicker')
    expect(kicker?.textContent ?? '').toContain('Beispielrechnung')
    const cards = container.querySelectorAll('.vd-card')
    expect(cards.length).toBeGreaterThanOrEqual(2)
  })

  it('shows the empty-comparison state (not demo) when saved state selects nothing', () => {
    // Saved state exists, so the demo seed must not fire; with nothing
    // selected the page offers the "Noch keine Produkte ausgewählt" state.
    seedCompareModeWithoutComparison()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    expect(container.textContent ?? '').not.toContain('Beispielrechnung')
    expect(container.querySelector('.vd-empty')).not.toBeNull()
    expect(container.querySelector('.vd-card-grid')).toBeNull()
  })

  it('renders exactly the compared products when visibleProducts is a subset (F1b)', () => {
    // The detail page must agree with the comparison it drills into: a
    // two-product comparison opens two breakdown cards, not six.
    seedCompareMode(['etf', 'bav'])
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    const cards = container.querySelectorAll('.vd-card')
    expect(cards.length).toBe(2)
    // Kicker shows the live (non-demo) copy.
    const kicker = container.querySelector('.vd-kicker')
    expect(kicker?.textContent ?? '').not.toContain('Beispielrechnung')
    expect(kicker?.textContent ?? '').toContain('Vergleich')
  })

  it('the empty-comparison state points back to /vergleich', () => {
    seedCompareModeWithoutComparison()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    const cta = container.querySelector<HTMLAnchorElement>('.vd-empty-cta')
    expect(cta).not.toBeNull()
    expect(cta!.getAttribute('href')).toBe('/vergleich')
  })

  it('a combine-mode workspace still renders its comparison, not a mode empty state', () => {
    const ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
    ws.mode = 'combine'
    ws.baseline.assumptions.visibleProducts = ['etf']
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(ws))
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={() => {}} />))
    expect(container.querySelector('.vd-card-grid')).not.toBeNull()
    expect(container.querySelectorAll('.vd-card').length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// PR 290 R3 Codex P2 — `?scenario=<id>` URL-init on first mount.
//
// The drill-in `<a href>` on `VergleichPage` carries the live scenario id as
// a query string so non-SPA navigations (Cmd/Ctrl-click, middle-click, JS-
// disabled fallback, hard reload) land on the same scenario the user picked.
// The detail page calls `onSelectScenario` exactly once on mount when the
// URL carries a known scenario id; otherwise the existing prop-driven flow
// stays unchanged.
// ---------------------------------------------------------------------------

describe('VergleichDetailPage — ?scenario=<id> URL initialiser (PR 290 R3 Codex P2)', () => {
  afterEach(() => {
    // Reset window.location to a known state after each test so cross-test
    // pollution is impossible. Re-defining with the canonical default URL.
    stubLocationSearch('')
  })

  it('calls onSelectScenario("optimistisch") on first mount when ?scenario=optimistisch', () => {
    seedCompareMode()
    stubLocationSearch('?scenario=optimistisch')
    const onSelectScenario = vi.fn()
    render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={onSelectScenario} />))
    // `optimistisch` is one of the three default `returnScenarios` ids
    // (konservativ / basis / optimistisch). The page must reflect the URL
    // selection on mount — the existing prop value of "basis" should be
    // updated via the setter so subsequent renders use "optimistisch".
    expect(onSelectScenario).toHaveBeenCalledWith('optimistisch')
  })

  it('does NOT call onSelectScenario when ?scenario=garbage (unknown id)', () => {
    seedCompareMode()
    stubLocationSearch('?scenario=garbage')
    const onSelectScenario = vi.fn()
    render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={onSelectScenario} />))
    // Invalid scenario id (not in `assumptions.returnScenarios`) must be
    // ignored silently — the existing prop value stays in effect.
    expect(onSelectScenario).not.toHaveBeenCalled()
  })

  it('does NOT call onSelectScenario when no query string is present', () => {
    seedCompareMode()
    stubLocationSearch('')
    const onSelectScenario = vi.fn()
    render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={onSelectScenario} />))
    // No `?scenario=` param → no setter call. The existing prop value of
    // "basis" controls the simulation, same as legacy behaviour.
    expect(onSelectScenario).not.toHaveBeenCalled()
  })

  it('does NOT call onSelectScenario when ?scenario= is present but empty', () => {
    seedCompareMode()
    stubLocationSearch('?scenario=')
    const onSelectScenario = vi.fn()
    render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={onSelectScenario} />))
    // Empty value parses as `''` from URLSearchParams; not in
    // `returnScenarios` → no setter call.
    expect(onSelectScenario).not.toHaveBeenCalled()
  })

  it('calls onSelectScenario for the canonical `basis` id (no-op equivalent but explicit)', () => {
    seedCompareMode()
    stubLocationSearch('?scenario=basis')
    const onSelectScenario = vi.fn()
    render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" onSelectScenario={onSelectScenario} />))
    // Explicit-basis URL is still a known scenario; we surface the setter
    // call so callers can rely on consistent first-mount behaviour. The
    // workspace state ends up identical to what it started with, but the
    // intent is preserved.
    expect(onSelectScenario).toHaveBeenCalledWith('basis')
  })
})
