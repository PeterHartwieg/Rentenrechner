// @vitest-environment jsdom

// Selected-product composition plus retained navigation and export contracts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import { pathToRoute } from '../../app/useRoute'
import { VergleichPage } from './VergleichPage'
import { defaultProfile, defaultAssumptions } from '../../data/defaultScenario'
import type { PersonalProfile, ProductId, ScenarioAssumptions } from '../../domain'
import type { SimulationResultBundle } from '../../app/useSimulationResult'
import { resolveEffectiveScenarioId, deriveTaxModes } from '../../app/simulationSelectors'
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
  const effectiveScenarioId = resolveEffectiveScenarioId(assumptions, 'basis')
  const selectedScenario = assumptions.returnScenarios.find((s) => s.id === effectiveScenarioId)
  const taxModes = deriveTaxModes(profile, assumptions, de2026Rules)
  return {
    simulation,
    monteCarloResult: null,
    effectiveScenarioId,
    selectedScenario,
    taxModes,
  }
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
        />,
      ),
    )
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Sparformen im Vergleich')
  })

  it('lead and note cite the budget, retirement age and nominal money basis', () => {
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
        />,
      ),
    )
    const lead = container.querySelector('.vergleich-lead')
    expect(lead).not.toBeNull()
    const text = lead!.textContent ?? ''
    expect(text).toContain('aus deinem eigenen Geld im Monat')
    const note = container.querySelector('.vergleich-result-note')!.textContent
    expect(note).toContain(`ab ${defaultProfile.retirementAge}, keine Gesamtrente`)
    expect(note).toContain('Beträge zum Rentenbeginn (nominal).')
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
        />,
      ),
    )
    const note = container.querySelector('.vergleich-result-note')
    expect(note!.textContent).toContain('63')
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
        />,
      ),
    )
    expect(container.textContent ?? '').not.toContain('Vergleich zusammenstellen')
    expect(container.textContent ?? '').not.toContain('Weitere Produkte')
  })

  it('keeps deeper content in three secondary disclosures', () => {
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
        />,
      ),
    )
    const disclosures = container.querySelectorAll('details.vergleich-secondary')
    expect(disclosures.length).toBe(3)
    expect([...disclosures].every((details) => !details.hasAttribute('open'))).toBe(true)
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
        />,
      ),
    )
    const drilldown = container.querySelector<HTMLAnchorElement>('.vergleich-drilldown__link')
    expect(drilldown).not.toBeNull()
    expect(drilldown!.getAttribute('href')).toBe('/vergleich/details?scenario=optimistisch')
  })

  it('drill-in link encodes the EFFECTIVE scenario id, not a stale selectedScenarioId (CodeRabbit R1 Major)', () => {
    // When the caller passes a `selectedScenarioId` that does not exist
    // among the live `returnScenarios`, `resolveEffectiveScenarioId`
    // falls back to the basis scenario. The drill-in URL must reflect
    // what the page actually rendered (effective id), not the stale
    // selection. Otherwise the detail page reads a different scenario.
    const result = buildResult(defaultAssumptions)
    const { container } = render(
      inShell(
        <VergleichPage
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          result={result}
          onAssumptionsChange={NOOP}
          // Stale id: nothing in defaultAssumptions.returnScenarios uses this.
          selectedScenarioId="does-not-exist"
          onSelectScenario={NOOP}
        />,
      ),
    )
    const drilldown = container.querySelector<HTMLAnchorElement>('.vergleich-drilldown__link')
    expect(drilldown).not.toBeNull()
    const href = drilldown!.getAttribute('href') ?? ''
    // The URL must NOT carry the stale id.
    expect(href).not.toContain('does-not-exist')
    // It must carry the fallback (basis) which is what the page rendered.
    expect(href).toBe('/vergleich/details?scenario=basis')
  })

  it('renders BOTH drill-in links side by side: details + Kapital im Verlauf', () => {
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
        />,
      ),
    )
    const links = container.querySelectorAll<HTMLAnchorElement>('.vergleich-drilldown__link')
    expect(links.length).toBe(2)
    // The existing drill-in to /vergleich/details carries the active scenario.
    expect(links[0].getAttribute('href')).toBe('/vergleich/details?scenario=basis')
    expect(links[0].textContent ?? '').toContain('Wohin geht das Geld')
    // The new drill-in to /kapital does not carry a query string.
    expect(links[1].getAttribute('href')).toBe('/kapital')
    expect(links[1].textContent ?? '').toContain('Kapital im Verlauf')
  })

  it('"Kapital im Verlauf" link triggers SPA navigation via navigate(ROUTES.kapital) and preventDefault on plain click', () => {
    const navigate = vi.fn()
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
          navigate={navigate}
        />,
      ),
    )
    const links = container.querySelectorAll<HTMLAnchorElement>('.vergleich-drilldown__link')
    const kapitalLink = links[1]
    expect(kapitalLink.getAttribute('href')).toBe('/kapital')

    // Plain click → shouldUseSpaNavigation returns true → SPA intercept fires.
    // `cancelable: true` so we can inspect defaultPrevented after the click.
    const fired = fireEvent.click(kapitalLink, { button: 0, cancelable: true })
    // fireEvent returns false when preventDefault was called on the event.
    expect(fired).toBe(false)

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith({ kind: 'kapital' })
  })

  it('"Kapital im Verlauf" link with metaKey-click falls through to native navigation (no SPA intercept)', () => {
    const navigate = vi.fn()
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
          navigate={navigate}
        />,
      ),
    )
    const links = container.querySelectorAll<HTMLAnchorElement>('.vergleich-drilldown__link')
    const kapitalLink = links[1]

    // Cmd/Ctrl-click → shouldUseSpaNavigation returns false → SPA handler bails
    // before preventDefault, letting the browser handle the navigation natively
    // (e.g. open in a new tab on macOS Cmd-click / Win Ctrl-click).
    const fired = fireEvent.click(kapitalLink, { button: 0, metaKey: true, ctrlKey: true, cancelable: true })
    // fireEvent returns true when preventDefault was NOT called.
    expect(fired).toBe(true)

    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders an empty state when no products are selected', () => {
    // Empty selection is intentional, even when the simulation has all products.
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
        />,
      ),
    )
    expect(container.textContent).toContain('Noch keine Sparform ausgewählt')
    expect(container.querySelector('.vergleich-pro-contra-grid')).toBeNull()
    expect(container.querySelector('.vergleich-comparison-table')).toBeNull()
    expect(container.querySelector('.vergleich-result-card')).toBeNull()
  })

  it('renders the selected products in the comparison table', () => {
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
        />,
      ),
    )
    const table = container.querySelector('.vergleich-comparison-table')
    expect(table).not.toBeNull()
    const rows = table!.querySelectorAll('tbody tr')
    // The table and cards follow the same visibleProducts selection.
    expect(rows.length).toBe(defaultAssumptions.visibleProducts.length)
  })
})

describe('VergleichPage — action bar (PR 332 R1 — Codex P2)', () => {
  it('renders all three buttons when all handlers are provided', () => {
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
          onPrint={NOOP}
          onExportCsv={NOOP}
          onCopyLink={NOOP}
          linkCopied={false}
        />,
      ),
    )
    expect(getByRole('button', { name: 'Drucken' })).not.toBeNull()
    expect(getByRole('button', { name: 'CSV exportieren' })).not.toBeNull()
    expect(getByRole('button', { name: 'Link kopieren' })).not.toBeNull()
  })

  it('each button invokes exactly its own handler on click', () => {
    const onPrint = vi.fn()
    const onExportCsv = vi.fn()
    const onCopyLink = vi.fn()
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
          onPrint={onPrint}
          onExportCsv={onExportCsv}
          onCopyLink={onCopyLink}
          linkCopied={false}
        />,
      ),
    )

    fireEvent.click(getByRole('button', { name: 'Drucken' }))
    expect(onPrint).toHaveBeenCalledOnce()
    expect(onExportCsv).not.toHaveBeenCalled()
    expect(onCopyLink).not.toHaveBeenCalled()

    fireEvent.click(getByRole('button', { name: 'CSV exportieren' }))
    expect(onExportCsv).toHaveBeenCalledOnce()
    expect(onCopyLink).not.toHaveBeenCalled()

    fireEvent.click(getByRole('button', { name: 'Link kopieren' }))
    expect(onCopyLink).toHaveBeenCalledOnce()
  })

  it('shows "Link kopiert ✓" when linkCopied is true', () => {
    const result = buildResult(defaultAssumptions)
    const { getByRole, queryByRole } = render(
      inShell(
        <VergleichPage
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          result={result}
          onAssumptionsChange={NOOP}
          selectedScenarioId="basis"
          onSelectScenario={NOOP}
          onPrint={NOOP}
          onExportCsv={NOOP}
          onCopyLink={NOOP}
          linkCopied={true}
        />,
      ),
    )
    expect(getByRole('button', { name: /Link kopiert/ })).not.toBeNull()
    expect(queryByRole('button', { name: 'Link kopieren' })).toBeNull()
  })

  it('does not render the action bar toolbar when no handlers are provided', () => {
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
        />,
      ),
    )
    expect(container.querySelector('.vergleich-actions')).toBeNull()
  })
})

describe('VergleichPage — allProductsSimulation prop (PR 332 R2 — Codex P2)', () => {
  it('uses Calculator-supplied allProductsSimulation when provided (no local re-simulation)', () => {
    // R2 fix: when Calculator lifts the all-6 simulation and threads it as a
    // prop, VergleichPage must reuse it instead of running its own
    // simulation. We pin this by patching the basis-scenario ETF row's
    // `capitalAtRetirement` to a wildly distinct number that no organic
    // engine run would produce. If the page falls back to its local memo,
    // the natural figure (~144 628 €) would show up instead.
    const realSim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const sentinelCapital = 987_654_321
    const patchedProducts = realSim.products.map((p) =>
      p.productId === 'etf' && p.scenarioId === 'basis'
        ? { ...p, capitalAtRetirement: sentinelCapital }
        : p,
    )
    const patchedSim = { ...realSim, products: patchedProducts }

    const result = buildResult(defaultAssumptions)
    const { container } = render(
      inShell(
        <VergleichPage
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          result={result}
          allProductsSimulation={patchedSim}
          onAssumptionsChange={NOOP}
          selectedScenarioId="basis"
          onSelectScenario={NOOP}
        />,
      ),
    )
    // de-DE formatting: 987.654.321 €
    expect(container.textContent ?? '').toContain('987.654.321')
  })

  it('falls back to a local simulation when allProductsSimulation is omitted (backwards compat)', () => {
    // Standalone callers use the local fair-comparison simulation, then
    // apply the same selection filter as callers with a supplied simulation.
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
        />,
      ),
    )
    const table = container.querySelector('.vergleich-comparison-table')
    expect(table).not.toBeNull()
    const headers = table!.querySelectorAll('thead th')
    expect(headers.length).toBe(7)
  })
})
