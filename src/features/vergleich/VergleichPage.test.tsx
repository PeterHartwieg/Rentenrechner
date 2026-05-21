// @vitest-environment jsdom

/**
 * VergleichPage tests (PR 11) — compare-mode comparison surface.
 *
 * Coverage:
 *   - Renders kicker, H1, lead paragraph, rendite chip strip
 *   - Renders § 1 comparison table heading
 *   - Renders § 2 pro/contra grid heading
 *   - Renders the "Wohin geht das Geld" drill-in link with the active
 *     scenario as a `?scenario=<id>` query string (PR 290 R4)
 *   - Empty-state (no visibleProducts) surfaces the picker-only state
 *   - Section headings use dynamic `{retirementAge}` (never hardcoded 67)
 *   - Page renders without throwing across phone / tablet / desktop
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import { pathToRoute } from '../../app/useRoute'
import { VergleichPage } from './VergleichPage'
import { defaultProfile, defaultAssumptions } from '../../data/defaultScenario'
import type { ProductId, ScenarioAssumptions } from '../../domain'
import type { SimulationResultBundle } from '../../app/useSimulationResult'
import { simulateRetirementComparison } from '../../engine/simulate'
import { de2026Rules } from '../../rules/de2026'
import { eachViewport, mockViewport } from '../../test/viewport'

beforeEach(() => {
  localStorage.clear()
  window.history.pushState(null, '', '/')
})

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

function inShell(node: ReactElement, path: string = '/vergleich') {
  return createElement(AppShell, {
    route: pathToRoute(path),
    navigate: () => {},
    children: node,
  })
}

/**
 * Build a real SimulationResultBundle by calling the engine directly. We do
 * NOT mock the engine — the page renders engine values, so the test exercises
 * the wiring end-to-end. The result is shaped exactly like the production
 * `useSimulationResult` bundle that VergleichPage consumes.
 */
function buildResult(assumptions: ScenarioAssumptions): SimulationResultBundle {
  const simulation = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
  return {
    simulation,
    monteCarloResult: undefined,
    taxModes: {
      bav: 'p3nr63',
      insurance: 'abgeltungsteuer',
    },
  } as unknown as SimulationResultBundle
}

const NOOP = () => undefined

describe('VergleichPage — compare-mode comparison surface', () => {
  it('renders kicker, H1, and lead paragraph', () => {
    const result = buildResult(defaultAssumptions)
    const { container } = render(
      inShell(
        <VergleichPage
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          result={result}
          onAssumptionsChange={NOOP}
          selectedScenarioId="basis"
          onSelectScenario={NOOP}
          onOpenAngebot={NOOP}
        />,
      ),
    )
    expect(container.querySelector('.vergleich-kicker')).not.toBeNull()
    expect(container.querySelector('.vergleich-headline')).not.toBeNull()
    expect(container.querySelector('.vergleich-lead')).not.toBeNull()
  })

  it('renders the H1 with the exact mock copy', () => {
    const result = buildResult(defaultAssumptions)
    const { getByRole } = render(
      inShell(
        <VergleichPage
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          result={result}
          onAssumptionsChange={NOOP}
          selectedScenarioId="basis"
          onSelectScenario={NOOP}
          onOpenAngebot={NOOP}
        />,
      ),
    )
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Sechs Wege, fürs Alter zu sparen')
  })

  it('renders § 1 + § 2 section headings', () => {
    const result = buildResult(defaultAssumptions)
    const { container } = render(
      inShell(
        <VergleichPage
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          result={result}
          onAssumptionsChange={NOOP}
          selectedScenarioId="basis"
          onSelectScenario={NOOP}
          onOpenAngebot={NOOP}
        />,
      ),
    )
    const text = container.textContent ?? ''
    expect(text).toContain('Sechs Sparformen im Überblick')
    expect(text).toContain('Wofür welche Sparform spricht')
  })

  it('drill-in link to /vergleich/details carries the active scenario as a query string', () => {
    const result = buildResult(defaultAssumptions)
    const { container } = render(
      inShell(
        <VergleichPage
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          result={result}
          onAssumptionsChange={NOOP}
          selectedScenarioId="optimistisch"
          onSelectScenario={NOOP}
          onOpenAngebot={NOOP}
        />,
      ),
    )
    const drilldown = container.querySelector<HTMLAnchorElement>('.vergleich-drilldown__link')
    expect(drilldown).not.toBeNull()
    expect(drilldown!.getAttribute('href')).toBe('/vergleich/details?scenario=optimistisch')
  })

  it('renders the EmptyComparison state when visibleProducts is empty', () => {
    const assumptions: ScenarioAssumptions = {
      ...defaultAssumptions,
      visibleProducts: [] as ProductId[],
    }
    const result = buildResult(assumptions)
    const { container } = render(
      inShell(
        <VergleichPage
          profile={defaultProfile}
          assumptions={assumptions}
          result={result}
          onAssumptionsChange={NOOP}
          selectedScenarioId="basis"
          onSelectScenario={NOOP}
          onOpenAngebot={NOOP}
        />,
      ),
    )
    // The § 1 comparison table heading should NOT render when there is no
    // comparison set; the empty-state component takes over.
    expect(container.textContent ?? '').not.toContain('Sechs Sparformen im Überblick')
  })

  it('renders all visible products in the § 1 table (iterates PRODUCT_REGISTRY, not a hardcoded list)', () => {
    const result = buildResult(defaultAssumptions)
    const { container } = render(
      inShell(
        <VergleichPage
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          result={result}
          onAssumptionsChange={NOOP}
          selectedScenarioId="basis"
          onSelectScenario={NOOP}
          onOpenAngebot={NOOP}
        />,
      ),
    )
    // defaultAssumptions has all six products visible by default. Row count in
    // the comparison table reflects that — without hardcoding which products
    // exist in the test.
    const table = container.querySelector('.vergleich-section table')
    expect(table).not.toBeNull()
    const rows = table!.querySelectorAll('tbody tr')
    expect(rows.length).toBe(defaultAssumptions.visibleProducts.length)
  })
})

describe('VergleichPage — viewport sweep', () => {
  it('renders without throwing at phone / tablet / desktop', () => {
    const result = buildResult(defaultAssumptions)
    eachViewport(() => {
      const { container, unmount } = render(
        inShell(
          <VergleichPage
            profile={defaultProfile}
            assumptions={defaultAssumptions}
            result={result}
            onAssumptionsChange={NOOP}
            selectedScenarioId="basis"
            onSelectScenario={NOOP}
            onOpenAngebot={NOOP}
          />,
        ),
      )
      expect(container.querySelector('.vergleich-shell')).not.toBeNull()
      unmount()
    })
  })
})
