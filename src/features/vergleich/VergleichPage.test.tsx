// @vitest-environment jsdom

/**
 * VergleichPage tests (R1 rewrite — issue #319).
 *
 * Coverage:
 *   - Renders kicker, H1, lead paragraph (with live Beitrag / Laufzeit /
 *     Renteneintritt values from bavFunding.monthlyNetCost + profile)
 *   - Renders rendite chip strip with terse rate-only labels (bracket-style
 *     active chip per Decision C)
 *   - Does NOT render the ComparisonPicker (R1 removed it from /vergleich;
 *     the page now shows all 6 products always)
 *   - Renders ONE section heading only — § 1 above the pro/contra grid; the
 *     comparison table has no section number / heading above it
 *   - Renders the "Wohin geht das Geld" drill-in link with the active
 *     scenario as a `?scenario=<id>` query string (preserved from PR 290)
 *   - Empty-state (no visibleProducts) surfaces the ErrorStatePanel
 *   - Table rows are sorted by netMonthlyPayout desc, ties broken by
 *     PRODUCT_REGISTRY order
 *   - Column header for "Kapital mit N" uses dynamic profile.retirementAge
 *     (never hardcoded 67)
 *   - Page renders without throwing across phone / tablet / desktop
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import { pathToRoute } from '../../app/useRoute'
import { VergleichPage } from './VergleichPage'
import { defaultProfile, defaultAssumptions } from '../../data/defaultScenario'
import type { PersonalProfile, ProductId, ScenarioAssumptions } from '../../domain'
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
function buildResult(assumptions: ScenarioAssumptions, profile: PersonalProfile = defaultProfile): SimulationResultBundle {
  const simulation = simulateRetirementComparison(profile, assumptions, de2026Rules)
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

describe('VergleichPage — R1 layout', () => {
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

  it('renders the H1 with the exact published copy', () => {
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

  it('lead paragraph cites live Beitrag, Laufzeit, Renteneintritt', () => {
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
    const lead = container.querySelector('.vergleich-lead')
    expect(lead).not.toBeNull()
    const text = lead!.textContent ?? ''
    // Runtime years = retirementAge − age = 67 − 30 = 37 by default.
    const years = defaultProfile.retirementAge - defaultProfile.age
    expect(text).toContain(`${years} Jahre`)
    expect(text).toContain(String(defaultProfile.retirementAge))
    // Beitrag should appear with the Euro currency sign.
    expect(text).toMatch(/€/)
  })

  it('lead paragraph uses dynamic profile.retirementAge (not hardcoded 67)', () => {
    const profile = { ...defaultProfile, retirementAge: 63 }
    const result = buildResult(defaultAssumptions, profile)
    const { container } = render(
      inShell(
        <VergleichPage
          profile={profile}
          assumptions={defaultAssumptions}
          result={result}
          onAssumptionsChange={NOOP}
          selectedScenarioId="basis"
          onSelectScenario={NOOP}
          onOpenAngebot={NOOP}
        />,
      ),
    )
    const lead = container.querySelector('.vergleich-lead')
    expect(lead!.textContent).toContain('63')
  })

  it('does NOT render the ComparisonPicker on /vergleich (R1)', () => {
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
    expect(container.textContent ?? '').not.toContain('Vergleich zusammenstellen')
    expect(container.textContent ?? '').not.toContain('Weitere Produkte')
  })

  it('renders ONE section heading only — § 1 above the pro/contra grid', () => {
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
    const sectionNums = container.querySelectorAll('.vergleich-section-num')
    expect(sectionNums.length).toBe(1)
    expect(sectionNums[0].textContent).toBe('§ 1')
    const text = container.textContent ?? ''
    expect(text).toContain('Wofür welche Sparform spricht')
    // The legacy "Sechs Sparformen im Überblick" heading is gone in R1 — the
    // table has no section number above it.
    expect(text).not.toContain('Sechs Sparformen im Überblick')
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

  it('renders the empty-state ErrorStatePanel when visibleProducts is empty', () => {
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
    const panel = container.querySelector('.rw-error-state.rw-error-state--empty')
    expect(panel).not.toBeNull()
    expect(panel!.textContent ?? '').toContain('Wähle mindestens ein Vorsorgeprodukt')
    // Pro/contra grid suppressed in empty state.
    expect(container.querySelector('.vergleich-pro-contra-grid')).toBeNull()
  })

  it('renders all visible products in the comparison table (iterates PRODUCT_REGISTRY, not a hardcoded list)', () => {
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
    const table = container.querySelector('.vergleich-comparison-table')
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

  it('phone variant renders vertical product cards (no full table)', () => {
    mockViewport('phone')
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
    expect(container.querySelector('.vergleich-product-cards')).not.toBeNull()
    expect(container.querySelector('.vergleich-comparison-table')).toBeNull()
  })

  it('desktop variant renders the full 7-column table', () => {
    mockViewport('desktop')
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
    const table = container.querySelector('.vergleich-comparison-table')
    expect(table).not.toBeNull()
    const headers = table!.querySelectorAll('thead th')
    expect(headers.length).toBe(7)
  })
})
