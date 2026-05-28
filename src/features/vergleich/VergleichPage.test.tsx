// @vitest-environment jsdom

/**
 * VergleichPage tests (R1 rewrite — issue #319, R1 review fixes).
 *
 * Coverage:
 *   - Renders kicker, H1, lead paragraph (with live Beitrag / Laufzeit /
 *     Renteneintritt values from the LOCAL all-6 simulation, independent
 *     of `assumptions.visibleProducts` — Codex R1 P2 fix)
 *   - Renders rendite chip strip with terse rate-only labels (bracket-style
 *     active chip per Decision C)
 *   - Does NOT render the ComparisonPicker (R1 removed it from /vergleich;
 *     the page now shows all 6 products always)
 *   - Renders ONE section heading only — § 1 above the pro/contra grid; the
 *     comparison table has no section number / heading above it
 *   - Renders the "Wohin geht das Geld" drill-in link with the EFFECTIVE
 *     scenario id as the `?scenario=<id>` query string (CodeRabbit R1 Major
 *     fix — `effectiveScenarioId`, not `selectedScenarioId`)
 *   - Even when `assumptions.visibleProducts` is empty, the table still
 *     renders 6 product rows (R1 contract: "shows all 6 products always")
 *   - Table rows are sorted by netMonthlyPayout desc, ties broken by
 *     PRODUCT_REGISTRY order
 *   - Column header for "Kapital mit N" uses dynamic profile.retirementAge
 *     (never hardcoded 67)
 *   - Page renders without throwing across phone / tablet / desktop
 */

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

  it('renders all 6 product rows even when assumptions.visibleProducts is empty (R1 contract: shows all 6 always)', () => {
    // R1 Codex P2: the page runs its own simulation with visibleProducts
    // forced to the full PRODUCT_REGISTRY list, so the user's `/eingaben`
    // selection cannot suppress rows here. This is the new contract.
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
    // No empty-state panel — that branch is gone.
    expect(container.querySelector('.rw-error-state.rw-error-state--empty')).toBeNull()
    // Pro/contra grid still rendered.
    expect(container.querySelector('.vergleich-pro-contra-grid')).not.toBeNull()
    // Comparison table renders 6 rows on desktop (one per product in
    // PRODUCT_REGISTRY), regardless of the empty `visibleProducts`.
    const table = container.querySelector('.vergleich-comparison-table')
    expect(table).not.toBeNull()
    const rows = table!.querySelectorAll('tbody tr')
    expect(rows.length).toBe(6)
  })

  it('renders all 6 products in the comparison table (iterates PRODUCT_REGISTRY, not a hardcoded list)', () => {
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
    // R1 contract: always shows all 6 products from PRODUCT_REGISTRY, never
    // a hardcoded list or a `visibleProducts`-filtered subset.
    expect(rows.length).toBe(6)
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
    // Without the prop, the page still renders all 6 rows via its internal
    // useMemo (the R1 contract). Standalone callers + existing tests keep
    // working unchanged.
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
    expect(rows.length).toBe(6)
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
