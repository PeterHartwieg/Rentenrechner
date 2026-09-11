// @vitest-environment jsdom

/**
 * KapitalPage tests (PR 11) — `/kapital` route content + viewport sweep.
 *
 * Coverage:
 *   - Page renders kicker, H1, back-link
 *   - Compare-mode default state renders filter chips + chart wrap +
 *     Wendepunkte section
 *   - Combine-mode with no instances + compare-mode with empty visibleProducts
 *     surface the same empty-state copy ("Noch keine Verträge")
 *   - Section heading uses dynamic profile.age in the kicker
 *   - Back-link href routes through `routeToPath(ROUTES.home)`
 *   - Document title is set to the brand-compliant string
 *   - Renders without throwing across phone / tablet / desktop
 *   - No emojis introduced in user-visible copy
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import { pathToRoute } from '../../app/useRoute'
import { useCalculatorState } from '../../app/useCalculatorState'
import { simulateRetirementComparison } from '../../engine/simulate'
import { de2026Rules } from '../../rules/de2026'
import { formatCurrency } from '../../utils/format'
import { addInstanceToWorkspace } from '../inventory/inventoryHelpers'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { KapitalPage } from './KapitalPage'
import { defaultWorkspace, STORAGE_KEY_V1, STORAGE_KEY_V2 } from '../../storage'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
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

function inShell(node: ReactElement, path: string = '/kapital') {
  return createElement(AppShell, {
    route: pathToRoute(path),
    navigate: () => {},
    children: node,
  })
}

function seedCompareMode(): void {
  const ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ ...ws, mode: 'compare' }))
}

function seedCombineMode(): void {
  const ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ ...ws, mode: 'combine' }))
}

describe('KapitalPage — compare-mode default rendering', () => {
  it('renders the kicker, H1, and back-link', () => {
    seedCompareMode()
    const { container } = render(inShell(<KapitalPage navigate={() => {}} />))
    expect(container.querySelector('.kapital-kicker')).not.toBeNull()
    expect(container.querySelector('.kapital-headline')).not.toBeNull()
    expect(container.querySelector('.kapital-backline')).not.toBeNull()
  })

  it('renders the H1 with the exact mock copy', () => {
    seedCompareMode()
    const { getByRole } = render(inShell(<KapitalPage navigate={() => {}} />))
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      'Kapital und Auszahlungen über das Leben',
    )
  })

  it('sets the document title via useEffect to the brand-compliant string', () => {
    seedCompareMode()
    render(inShell(<KapitalPage navigate={() => {}} />))
    expect(document.title).toBe('Kapital & Auszahlungen | RentenWiki.de')
  })

  it('renders the § 1 Wendepunkte section heading when chips have a selection', () => {
    seedCompareMode()
    const { container } = render(inShell(<KapitalPage navigate={() => {}} />))
    // The compare-mode default state has visibleProducts populated, so chips
    // render and the Wendepunkte section appears.
    expect(container.textContent ?? '').toContain('Wendepunkte im Verlauf')
  })

  it('back-link href routes through ROUTES.home (not a bare string)', () => {
    seedCompareMode()
    const { container } = render(inShell(<KapitalPage navigate={() => {}} />))
    const backlink = container.querySelector<HTMLAnchorElement>('.kapital-backlink')
    expect(backlink).not.toBeNull()
    expect(backlink!.getAttribute('href')).toBe('/')
  })

  it('renders no emojis in user-visible copy', () => {
    seedCompareMode()
    const { container } = render(inShell(<KapitalPage navigate={() => {}} />))
    const text = container.textContent ?? ''
    // Loose emoji regex (covers common pictographs and symbol blocks the codebase
    // is sensitive to; the chrome itself may render arrows like ›/← which are not
    // emoji).
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })
})

describe('KapitalPage — empty-state branches', () => {
  it('renders the empty-state when compare-mode has no visibleProducts', () => {
    // Per CR3: seed BOTH storage keys with `visibleProducts: []` so the
    // empty branch fires deterministically.
    //
    // useCalculatorState reads via `loadSavedState()`, which prefers
    // STORAGE_KEY_V2 (projecting the workspace to a singleton via
    // `singletonViewOfWorkspace` — that helper carries `visibleProducts`
    // through verbatim). STORAGE_KEY_V1 is the fallback compare-mode
    // anchor; we seed it for completeness so a future read-order change
    // does not silently flip this assertion back to "either branch".
    const ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
    const seeded = {
      ...ws,
      mode: 'compare',
      baseline: {
        ...ws.baseline,
        assumptions: { ...ws.baseline.assumptions, visibleProducts: [] },
      },
    }
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seeded))
    localStorage.setItem(
      STORAGE_KEY_V1,
      JSON.stringify({
        version: 1,
        profile: defaultProfile,
        assumptions: { ...defaultAssumptions, visibleProducts: [] },
      }),
    )

    const { container } = render(inShell(<KapitalPage navigate={() => {}} />))
    // Empty-state must fire — `.kapital-empty` is non-null.
    expect(container.querySelector('.kapital-empty')).not.toBeNull()
  })

  it('renders the empty-state when combine-mode has no instances', () => {
    seedCombineMode()
    const { container } = render(inShell(<KapitalPage navigate={() => {}} />))
    // The default combine workspace has zero instances → chips empty →
    // empty paragraph renders.
    const empty = container.querySelector('.kapital-empty')
    expect(empty).not.toBeNull()
    // PR #344 R2 (Codex CX3): the empty paragraph names "Verträge oder Produkte"
    // and must deep-link Schritt 2 (/eingaben/produkte) where the contract editor
    // lives, NOT Schritt 1 (/eingaben) which only carries Person/Einkommen.
    const produkteLink = empty!.querySelector<HTMLAnchorElement>('a[href="/eingaben/produkte"]')
    expect(produkteLink).not.toBeNull()
    // And it must not point to Schritt 1 (which has no contract editor visible).
    expect(empty!.querySelector('a[href="/eingaben"]')).toBeNull()
  })

  it('empty-state copy is NOT aria-hidden (accessibility — PR 288 R1 lesson)', () => {
    seedCombineMode()
    const { container } = render(inShell(<KapitalPage navigate={() => {}} />))
    const empty = container.querySelector('.kapital-empty')
    expect(empty).not.toBeNull()
    expect(empty!.getAttribute('aria-hidden')).toBeNull()
  })
})

describe('KapitalPage — viewport sweep', () => {
  it('renders without throwing at phone / tablet / desktop', () => {
    seedCompareMode()
    eachViewport(() => {
      const { container, unmount } = render(inShell(<KapitalPage navigate={() => {}} />))
      expect(container.querySelector('.kapital-shell')).not.toBeNull()
      unmount()
    })
  })

  it('renders the empty-state without throwing at phone / tablet / desktop (combine-mode no contracts)', () => {
    seedCombineMode()
    eachViewport(() => {
      const { container, unmount } = render(inShell(<KapitalPage navigate={() => {}} />))
      // Either the empty paragraph or the chips render, but the shell is
      // always present.
      expect(container.querySelector('.kapital-shell')).not.toBeNull()
      unmount()
    })
  })
})

// ---------------------------------------------------------------------------
// F2 — explicit source selection via `?quelle=vergleich`.
//
// `/kapital` is dual-source. Picking the source from the saved workspace mode
// alone meant the "Kapital im Verlauf" link on `/vergleich` showed a user's
// personal plan — a different monthly contribution than the comparison they
// were reading. The link now names its origin.
// ---------------------------------------------------------------------------

describe('KapitalPage — source selection', () => {
  it('renders the comparison (not the plan) when the URL carries ?quelle=vergleich', () => {
    // A combine workspace with zero contracts: the plan source has nothing to
    // chart, so the empty state is the plan's tell. With the comparison as the
    // source, the seeded `visibleProducts` produce chips instead.
    seedCombineMode()
    window.history.pushState(null, '', '/kapital?quelle=vergleich')
    const { container } = render(inShell(<KapitalPage navigate={() => {}} />))
    expect(container.querySelector('.kapital-empty')).toBeNull()
    expect(container.querySelector('.kapital-chart-wrap')).not.toBeNull()
    expect(container.querySelector('.kapital-kicker')?.textContent ?? '').toContain('Vergleich')
  })

  it('back-link returns to /vergleich when the comparison is the source', () => {
    seedCombineMode()
    window.history.pushState(null, '', '/kapital?quelle=vergleich')
    const { container } = render(inShell(<KapitalPage navigate={() => {}} />))
    const backlink = container.querySelector<HTMLAnchorElement>('.kapital-backlink')
    expect(backlink!.getAttribute('href')).toBe('/vergleich')
    expect(backlink!.textContent ?? '').toContain('Zurück zum Vergleich')
  })

  it('keeps the plan as the source (and the plan back-link) without the param', () => {
    seedCombineMode()
    window.history.pushState(null, '', '/kapital')
    const { container } = render(inShell(<KapitalPage navigate={() => {}} />))
    // Plan source: the default combine workspace holds no contracts.
    expect(container.querySelector('.kapital-empty')).not.toBeNull()
    const backlink = container.querySelector<HTMLAnchorElement>('.kapital-backlink')
    expect(backlink!.getAttribute('href')).toBe('/')
    expect(container.querySelector('.kapital-kicker')?.textContent ?? '').toContain('Mein Plan')
  })

  it('ignores an unknown ?quelle value', () => {
    seedCombineMode()
    window.history.pushState(null, '', '/kapital?quelle=irgendwas')
    const { container } = render(inShell(<KapitalPage navigate={() => {}} />))
    expect(container.querySelector('.kapital-empty')).not.toBeNull()
    expect(container.querySelector<HTMLAnchorElement>('.kapital-backlink')!.getAttribute('href')).toBe('/')
  })
})


describe('KapitalPage — scenario query and picker', () => {
  function expectRetirementCapital(container: HTMLElement, capital: number) {
    const cell = container.querySelector('[data-row="renteneintritt"] td:nth-child(3)')
    expect(cell?.textContent).toBe(formatCurrency(capital))
  }

  it.each([
    ['konservativ', 'konservativ'],
    ['unknown', 'basis'],
    ['', 'basis'],
  ])('resolves compare query "%s" to %s product results', (query, expectedId) => {
    seedCompareMode()
    window.history.replaceState(null, '', `/kapital?quelle=vergleich&scenario=${query}`)
    const state = renderHook(() => useCalculatorState())
    const { profile, assumptions } = state.result.current
    const results = simulateRetirementComparison(profile, assumptions, de2026Rules).products
    state.unmount()
    // The default order starts with konservativ; basis must be found by ID.
    expect(assumptions.returnScenarios[0].id).toBe('konservativ')
    const expected = results.find((r) => r.productId === 'etf' && r.scenarioId === expectedId)!
    const { container } = render(inShell(<KapitalPage navigate={() => {}} />))
    fireEvent.click(screen.getByRole('button', { name: 'ETF-Depot' }))
    expectRetirementCapital(container, expected.capitalAtRetirement)
    const label = assumptions.returnScenarios.find((s) => s.id === expectedId)!.label
    expect(screen.getByRole('button', { name: new RegExp(`Rendite-Annahme: ${label}`) }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it.each(['compare', 'combine'] as const)('updates %s results and replaces the URL when choosing a scenario', (mode) => {
    let ws = { ...structuredClone(defaultWorkspace), mode }
    ws = addInstanceToWorkspace(ws, 'etf')
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(ws))
    const state = renderHook(() => useCalculatorState())
    const { profile, assumptions } = state.result.current
    const results = mode === 'compare'
      ? simulateRetirementComparison(profile, assumptions, de2026Rules).products
      : Object.values(runCombineSimulation(ws, de2026Rules).perInstance).flat()
    state.unmount()
    const quelle = mode === 'compare' ? 'vergleich' : 'plan'
    window.history.replaceState({ retained: true }, '', `/kapital?quelle=${quelle}&scenario=konservativ#kapital-wendepunkte`)
    const historyLength = window.history.length
    const { container, unmount } = render(inShell(<KapitalPage navigate={() => {}} />))
    fireEvent.click(screen.getByRole('button', { name: 'ETF-Depot' }))
    const capitalFor = (id: string) => results.find((r) => r.productId === 'etf' && r.scenarioId === id)!.capitalAtRetirement
    expectRetirementCapital(container, capitalFor('konservativ'))
    fireEvent.click(screen.getByRole('button', { name: /Rendite-Annahme: Optimistisch/ }))
    expectRetirementCapital(container, capitalFor('optimistisch'))
    expect(screen.getByRole('button', { name: /Rendite-Annahme: Optimistisch/ })).toHaveAttribute('aria-pressed', 'true')
    expect(window.location.search).toBe(`?quelle=${quelle}&scenario=optimistisch`)
    expect(window.location.hash).toBe('#kapital-wendepunkte')
    expect(window.history.length).toBe(historyLength)
    expect(window.history.state).toEqual({ retained: true })
    unmount()
    render(inShell(<KapitalPage navigate={() => {}} />))
    expect(screen.getByRole('button', { name: /Rendite-Annahme: Optimistisch/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('falls back to basis for an unknown combine scenario', () => {
    seedCombineMode()
    window.history.replaceState(null, '', '/kapital?scenario=unknown')
    render(inShell(<KapitalPage navigate={() => {}} />))
    expect(screen.getByRole('button', { name: /Rendite-Annahme: Basis/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('units and scope on the capital page (audit F06)', () => {
  it('states that every amount is nominal and names the selection, not the whole plan', () => {
    seedCompareMode()
    render(inShell(<KapitalPage navigate={() => {}} />))
    const scope = screen.getByTestId('kapital-scope')
    expect(scope).toHaveTextContent('Alle Beträge nominal')
    expect(scope).toHaveTextContent('nicht in heutigen Euro')
    expect(scope).toHaveTextContent('für sich allein versteuert')
  })
})
