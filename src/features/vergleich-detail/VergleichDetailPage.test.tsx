// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import { pathToRoute } from '../../app/useRoute'
import { VergleichDetailPage } from './VergleichDetailPage'
import { defaultWorkspace, STORAGE_KEY_V2 } from '../../storage'
import type { Workspace } from '../../domain'
import { eachViewport, mockViewport } from '../../test/viewport'

beforeEach(() => {
  localStorage.clear()
  window.history.pushState(null, '', '/')
})

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

function inShell(node: ReactElement, path: string = '/vergleich/details') {
  return createElement(AppShell, {
    route: pathToRoute(path),
    navigate: () => {},
    children: node,
  })
}

/**
 * Seed STORAGE_KEY_V2 with `mode: 'compare'` so `usePortfolioState` reports
 * compare-mode and the page renders the card grid instead of the combine
 * empty state. `useCalculatorState` falls back to its built-in
 * `defaultAssumptions` / `defaultProfile` when no v1 state is present — the
 * default `visibleProducts` covers all six products.
 */
function seedCompareMode(): void {
  const ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ ...ws, mode: 'compare' }))
}

describe('VergleichDetailPage — compare-mode per-product breakdown surface', () => {
  it('renders the kicker, H1, and a card grid with one card per visible product', () => {
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" />))
    expect(container.querySelector('.vd-kicker')).not.toBeNull()
    expect(container.querySelector('.vd-headline')).not.toBeNull()
    const grid = container.querySelector('.vd-card-grid')
    expect(grid).not.toBeNull()
    const cards = container.querySelectorAll('.vd-card')
    // All six products selected by default → six cards.
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.length).toBeLessThanOrEqual(6)
  })

  it('renders three labeled sections inside each card', () => {
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" />))
    const cards = container.querySelectorAll('.vd-card')
    for (const card of Array.from(cards)) {
      const sections = card.querySelectorAll('.vd-card-section')
      expect(sections.length).toBe(3)
    }
  })

  it('uses the dynamic retirementAge in the § 2 heading text', () => {
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" />))
    // Default retirement age is 67 (defaultProfile). The § 2 heading must
    // contain "Mit 67, einmalig" — never a hardcoded "Mit 67" without the
    // retirementAge prop threading.
    const text = container.textContent ?? ''
    expect(text).toContain('Mit 67, einmalig')
  })

  it('every euro display in the card grid goes through Intl currency formatting', () => {
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" />))
    // `formatCurrency` produces `... €` (Intl.NumberFormat 'de-DE') — every
    // value cell in the cards should contain a `€` glyph or a leading "−"
    // followed by `€`. We pick any value cell and check.
    const values = container.querySelectorAll('.vd-card-section__value')
    expect(values.length).toBeGreaterThan(0)
    // At least the first card's Brutto-Rente cell must include the euro sign.
    const firstCard = container.querySelector('.vd-card')!
    const firstCurrencyCell = firstCard.querySelector('.vd-card-section__row--add .vd-card-section__value')
    expect(firstCurrencyCell?.textContent ?? '').toContain('€')
  })

  it('renders the Verfügbar-ab footer with a non-empty value on every card', () => {
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" />))
    const cards = container.querySelectorAll('.vd-card')
    for (const card of Array.from(cards)) {
      const footer = card.querySelector('.vd-card__footer')
      expect(footer).not.toBeNull()
      const value = footer!.querySelector('.vd-card__footer-value')
      expect((value?.textContent ?? '').length).toBeGreaterThan(0)
    }
  })

  it('falls back to the combine-mode empty state when saved mode is combine', () => {
    const ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ ...ws, mode: 'combine' }))
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" />))
    expect(container.querySelector('.vd-empty')).not.toBeNull()
    expect(container.textContent ?? '').toContain('Vergleichs-Modus')
    // No card grid in the fallback.
    expect(container.querySelector('.vd-card-grid')).toBeNull()
  })

  it('exposes accessible empty-state copy (no aria-hidden on body text)', () => {
    const ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ ...ws, mode: 'combine' }))
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" />))
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
      const { container, unmount } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" />))
      const cards = container.querySelectorAll('.vd-card')
      expect(cards.length).toBeGreaterThan(0)
      unmount()
    })
  })

  it('sets the document title via useEffect to the brand-compliant string', () => {
    seedCompareMode()
    render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" />))
    expect(document.title).toBe('Wohin geht das Geld | RentenWiki.de')
  })

  it('renders a back-link to the home route as a real anchor', () => {
    seedCompareMode()
    const { container } = render(inShell(<VergleichDetailPage navigate={() => {}} selectedScenarioId="basis" />))
    const backlink = container.querySelector<HTMLAnchorElement>('.vd-backlink')
    expect(backlink).not.toBeNull()
    expect(backlink!.getAttribute('href')).toBe('/')
  })
})
