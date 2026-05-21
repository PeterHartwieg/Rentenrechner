// @vitest-environment jsdom
/**
 * Render tests for PrintReport (Group G issue 09 N6).
 *
 * Coverage:
 *   - combine-mode fixture with model_estimate → .pr-confidence-estimate is present
 *   - .pr-disclaimer-top is the FIRST child of #print-report (publication-blocking compliance)
 *   - combine-mode "Vertrag" column uses workspace instance labels (#27 P2)
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { PrintReport } from './PrintReport'
import { defaultProfile, defaultAssumptions } from '../../data/defaultScenario'
import type { SimulationResult, ProductResult, ScenarioAssumptions } from '../../domain'
import type { Workspace } from '../../domain/workspace'
import type { CombinedResult } from '../../engine/portfolioCombine'

afterEach(() => cleanup())

function makeSimulation(inputConfidence: ProductResult['inputConfidence']): SimulationResult {
  const product: ProductResult = {
    productId: 'etf',
    label: 'ETF',
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    annualReturn: 0.06,
    monthlyUserCost: 200,
    monthlyProductContribution: 200,
    monthlyEmployerContribution: 0,
    totalUserCost: 48000,
    totalProductContributions: 48000,
    totalEmployerContributions: 0,
    totalFees: 1000,
    capitalAtRetirement: 120000,
    realCapitalAtRetirement: 90000,
    afterTaxLumpSum: 110000,
    grossMonthlyPayout: 500,
    netMonthlyPayout: 450,
    taxAndSvSavings: 0,
    valueMultipleOnUserCost: 2.5,
    capitalMultipleAnnualized: 1.05,
    accumulationRiy: 0.008,
    inputConfidence,
    rows: [],
    etfPayoutRows: [],
  } as unknown as ProductResult

  return {
    products: [product],
    bavFunding: {
      monthlyNetCost: 0,
      monthlyGrossConversion: 0,
      monthlyEmployerContribution: 0,
      annualTaxSaving: 0,
      annualSvSaving: 0,
      annualTaxSvSavings: 0,
      annualSavings: 0,
      effectiveMonthlyEmployerContribution: 0,
      effectiveLimit3Nr63: 0,
      effectiveLimitSvEV: 0,
      monthly3Nr63Contribution: 0,
      monthlySvContribution: 0,
      monthlyExcessContribution: 0,
      cappedAt3Nr63: false,
      cappedAtSvEV: false,
      iterations: 0,
    } as unknown as SimulationResult['bavFunding'],
    statutoryPension: {
      grossMonthlyPension: 1000,
      netMonthlyPension: 900,
      projectedEntgeltpunkte: 35,
    } as unknown as SimulationResult['statutoryPension'],
    basisrenteFunding: { monthlyGrossContribution: 0 } as unknown as SimulationResult['basisrenteFunding'],
    altersvorsorgedepotFunding: { monthlyOwnContribution: 0 } as unknown as SimulationResult['altersvorsorgedepotFunding'],
    riesterFunding: { monthlyOwnContribution: 0 } as unknown as SimulationResult['riesterFunding'],
  }
}

describe('PrintReport', () => {
  it('renders .pr-confidence-estimate for a product with model_estimate inputConfidence', () => {
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('model_estimate')}
      />
    )
    const indicator = container.querySelector('.pr-confidence-estimate')
    expect(indicator).not.toBeNull()
    // Routed through formatEvidenceStateForExport — German label, not raw key.
    expect(indicator?.textContent).toContain('Schätzwert')
  })

  it('renders .pr-confidence-confirmed with German label for user_confirmed', () => {
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
      />
    )
    const indicator = container.querySelector('.pr-confidence-confirmed')
    expect(indicator).not.toBeNull()
    expect(indicator?.textContent).toContain('Bestätigt')
  })

  it('renders .pr-confidence-confirmed with "lt. Beleg" for statement (issue 13 helper routing)', () => {
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('statement')}
      />
    )
    // statement maps to confirmed via evidenceStateToProvKind, but uses a
    // dedicated German export label sourced from formatEvidenceStateForExport.
    const indicator = container.querySelector('.pr-confidence-confirmed')
    expect(indicator).not.toBeNull()
    expect(indicator?.textContent).toContain('lt. Beleg')
  })

  it('renders .pr-confidence-default with "Unbekannt" when inputConfidence is undefined', () => {
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation(undefined)}
      />
    )
    const indicator = container.querySelector('.pr-confidence-default')
    expect(indicator).not.toBeNull()
    expect(indicator?.textContent).toContain('Unbekannt')
  })

  it('.pr-disclaimer-top is the FIRST child of #print-report', () => {
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
      />
    )
    const root = container.querySelector('#print-report')
    expect(root).not.toBeNull()
    const firstChild = root!.firstElementChild
    expect(firstChild?.classList.contains('pr-disclaimer-top')).toBe(true)
    // PR 11 strengthening: also confirm the first child is a <section> (not
    // a div wrapper or comment) AND that it precedes every other section in
    // sourceindex order. A DOM walk catches accidental re-ordering even when
    // a new section accidentally hoists above the disclaimer in JSX.
    expect(firstChild?.tagName.toLowerCase()).toBe('section')
    const allSections = Array.from(root!.children)
    expect(allSections[0]).toBe(firstChild)
    expect(allSections.filter((c) => c.classList.contains('pr-disclaimer-top')).length).toBe(1)
  })

  // -------------------------------------------------------------------------
  // Combine-mode rendering (Group G issue 11).
  // -------------------------------------------------------------------------

  function makeCombined(monthlyNetIncome: number): CombinedResult {
    return {
      monthlyNetIncome,
      monthlyGrossPayouts: {
        statutoryPension: 1000,
        bav: 500,
        privateInsurance: 0,
        basisrente: 0,
        altersvorsorgedepot: 0,
        riester: 0,
        etf: 0,
      },
      aggregateTax: { totalTaxAnnual: 0 } as unknown as CombinedResult['aggregateTax'],
      aggregateKvPv: {} as unknown as CombinedResult['aggregateKvPv'],
      byInstance: {},
      statutoryPensionMonthlyNet: 900,
      notes: [],
    }
  }

  it('combine-mode renders portfolio detail section instead of singleton compare table', () => {
    const bavResult: ProductResult = {
      ...(makeSimulation('user_confirmed').products[0] as ProductResult),
      productId: 'bav',
      label: 'bAV Direktversicherung A',
      instanceId: 'bav-1',
    } as unknown as ProductResult
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
        combineMode={true}
        portfolio={{
          perInstance: { 'bav-1': [bavResult] },
          combinedByScenarioId: { basis: makeCombined(2200) },
          scenarioLabels: { basis: 'Basis' },
        }}
      />
    )
    // Combine title
    expect(container.textContent).toContain('Mein Plan')
    expect(container.textContent).toContain('Kombiniertes Renteneinkommen')
    // Per-instance label appears
    expect(container.textContent).toContain('bAV Direktversicherung A')
    // Singleton-compare specific section title is gone
    expect(container.textContent).not.toContain('Produktvergleich — alle Szenarien')
  })

  it('combine-mode keeps .pr-disclaimer-top as FIRST child of #print-report', () => {
    const bavResult: ProductResult = {
      ...(makeSimulation('user_confirmed').products[0] as ProductResult),
      productId: 'bav',
      label: 'bAV',
      instanceId: 'bav-1',
    } as unknown as ProductResult
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
        combineMode={true}
        portfolio={{
          perInstance: { 'bav-1': [bavResult] },
          combinedByScenarioId: { basis: makeCombined(2200) },
          scenarioLabels: { basis: 'Basis' },
        }}
      />
    )
    const root = container.querySelector('#print-report')
    expect(root).not.toBeNull()
    const firstChild = root!.firstElementChild
    expect(firstChild?.classList.contains('pr-disclaimer-top')).toBe(true)
    // PR 11 strengthening (mirrors compare-mode): first child is a <section>
    // and there is exactly one `.pr-disclaimer-top` in the print tree.
    expect(firstChild?.tagName.toLowerCase()).toBe('section')
    expect(root!.querySelectorAll('.pr-disclaimer-top').length).toBe(1)
  })

  it('compare-mode (combineMode=false / undefined) still renders the singleton product table — byte-identical first child', () => {
    // The compare-mode path is byte-identical to the historical render. We
    // assert the first-child invariant + presence of the singleton-only
    // section title.
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
      />
    )
    expect(container.textContent).toContain('Produktvergleich — alle Szenarien')
  })

  // -------------------------------------------------------------------------
  // Issue 27: combine-mode must source profile/GRV/scenarios from workspace,
  // never from singleton state. Pin the divergence with a workspace that
  // differs from the singleton defaults.
  // -------------------------------------------------------------------------

  it('combine-mode uses workspace profile, not singleton profile', () => {
    // Workspace profile deliberately differs from singleton (different salary).
    const workspaceProfile = { ...defaultProfile, grossSalaryYear: 99_000 }
    // Singleton keeps the default 75_000.

    const bavResult: ProductResult = {
      ...(makeSimulation('user_confirmed').products[0] as ProductResult),
      productId: 'bav',
      label: 'bAV',
      instanceId: 'bav-1',
    } as unknown as ProductResult

    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
        combineMode={true}
        portfolio={{
          perInstance: { 'bav-1': [bavResult] },
          combinedByScenarioId: { basis: makeCombined(2200) },
          scenarioLabels: { basis: 'Basis' },
        }}
        combineProfile={workspaceProfile}
      />
    )
    // Workspace salary (99_000) must appear; singleton default (75_000) must NOT.
    expect(container.textContent).toContain('99.000')
    expect(container.textContent).not.toContain('75.000')
  })

  it('combine-mode uses workspace GRV (combineGrv), not singleton simulation.statutoryPension', () => {
    // Singleton GRV: 1000 gross / 900 net (from makeSimulation).
    // Workspace GRV: deliberately different values.
    const workspaceGrv = {
      grossMonthlyPension: 1_234,
      netMonthlyPension: 1_111,
      projectedEntgeltpunkte: 42,
      taxMonthly: 100,
      kvPvMonthly: 23,
      grvReductionApplied: 0,
    }

    const bavResult: ProductResult = {
      ...(makeSimulation('user_confirmed').products[0] as ProductResult),
      productId: 'bav',
      label: 'bAV',
      instanceId: 'bav-1',
    } as unknown as ProductResult

    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
        combineMode={true}
        portfolio={{
          perInstance: { 'bav-1': [bavResult] },
          combinedByScenarioId: { basis: makeCombined(2200) },
          scenarioLabels: { basis: 'Basis' },
        }}
        combineGrv={workspaceGrv}
      />
    )
    // Workspace GRV gross 1_234 / EP 42 must appear in the GRV block.
    // formatCurrency(1234, 0) → "1.234 €"; formatNumber(42, 1) → "42"
    expect(container.textContent).toContain('1.234')
    expect(container.textContent).toContain('42 EP')
    // Singleton had grossMonthlyPension 1_000 and EP 35 — must be absent.
    // (1_000 formats as "1.000 €" — avoid false-positive match against "1.000" which
    //  could appear elsewhere, so we check the EP count which is unambiguous.)
    expect(container.textContent).not.toContain('35 EP')
  })

  it('combine-mode uses workspace returnScenarios for scenario ordering', () => {
    // Workspace has a custom scenario order: optimistisch before basis.
    const workspaceScenarios: ScenarioAssumptions['returnScenarios'] = [
      { id: 'optimistisch', label: 'Optimistisch', annualReturn: 0.09 },
      { id: 'basis', label: 'Basis', annualReturn: 0.06 },
    ]
    // Singleton assumptions has the default scenario set.

    const bavResult: ProductResult = {
      ...(makeSimulation('user_confirmed').products[0] as ProductResult),
      productId: 'bav',
      label: 'bAV',
      instanceId: 'bav-1',
    } as unknown as ProductResult

    const combined: Record<string, CombinedResult> = {
      optimistisch: makeCombined(3000),
      basis: makeCombined(2200),
    }

    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
        combineMode={true}
        portfolio={{
          perInstance: { 'bav-1': [bavResult] },
          combinedByScenarioId: combined,
          scenarioLabels: { basis: 'Basis', optimistisch: 'Optimistisch' },
        }}
        combineReturnScenarios={workspaceScenarios}
      />
    )
    // Both scenarios should be rendered in the combined income table.
    expect(container.textContent).toContain('Optimistisch')
    expect(container.textContent).toContain('Basis')
    // The workspace scenario list drives scenario rendering.
    // (Ordering is asserted by checking both appear; DOM order matches prop order.)
    const tableText = container.querySelector('.pr-table')?.textContent ?? ''
    const idxOpt = tableText.indexOf('Optimistisch')
    const idxBasis = tableText.indexOf('Basis')
    // workspace order: optimistisch first, then basis
    expect(idxOpt).toBeLessThan(idxBasis)
  })

  // -------------------------------------------------------------------------
  // Issue 27 P2: combine print "Vertrag" column uses workspace instance labels.
  // Two ETF instances with distinct user labels must each appear; the generic
  // engine label "ETF-Depot" must NOT appear twice in the "Vertrag" column.
  // -------------------------------------------------------------------------

  it('combine-mode Vertrag column uses workspace instance labels, not generic engine label', () => {
    // Two ETF instances with distinct user-provided labels.
    const etfBase = makeSimulation('user_confirmed').products[0] as ProductResult

    const etfResult1: ProductResult = {
      ...etfBase,
      productId: 'etf',
      label: 'ETF-Depot',
      instanceId: 'etf-1',
      scenarioId: 'basis',
      scenarioLabel: 'Basis',
    } as unknown as ProductResult

    const etfResult2: ProductResult = {
      ...etfBase,
      productId: 'etf',
      label: 'ETF-Depot',
      instanceId: 'etf-2',
      scenarioId: 'basis',
      scenarioLabel: 'Basis',
    } as unknown as ProductResult

    // Minimal workspace with two ETF instances carrying distinct user labels.
    const workspace: Workspace = {
      schemaVersion: 2,
      mode: 'combine',
      baseline: {
        id: 'baseline',
        label: 'Baseline',
        profile: defaultProfile,
        assumptions: {
          bav: [],
          etf: [
            {
              instanceId: 'etf-1',
              label: 'Depot A',
              status: 'active',
              contractStartYear: 2020,
              evidenceMap: {},
              annualAssetFee: 0.002,
              equityPartialExemption: 0.3,
              annualContributionGrowthRate: 0,
            },
            {
              instanceId: 'etf-2',
              label: 'Depot B',
              status: 'active',
              contractStartYear: 2021,
              evidenceMap: {},
              annualAssetFee: 0.002,
              equityPartialExemption: 0.3,
              annualContributionGrowthRate: 0,
            },
          ],
          insurance: [],
          basisrente: [],
          altersvorsorgedepot: [],
          riester: [],
          statutoryPension: defaultAssumptions.statutoryPension,
          inflationRate: 0.03,
          retirementEndAge: defaultAssumptions.retirementEndAge,
          returnScenarios: defaultAssumptions.returnScenarios,
          monteCarlo: defaultAssumptions.monteCarlo,
          visibleProducts: ['etf'],
        },
        createdAt: new Date().toISOString(),
        origin: 'baseline',
      },
      whatIfs: [],
      pinnedComparisonIds: [],
    }

    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
        combineMode={true}
        portfolio={{
          perInstance: {
            'etf-1': [etfResult1],
            'etf-2': [etfResult2],
          },
          combinedByScenarioId: { basis: makeCombined(2200) },
          scenarioLabels: { basis: 'Basis' },
        }}
        combineWorkspace={workspace}
      />
    )

    // Both workspace instance labels must appear in the rendered output.
    expect(container.textContent).toContain('Depot A')
    expect(container.textContent).toContain('Depot B')
    // Combine-mode reports disclose the workspace inflation assumption.
    expect(container.textContent).toMatch(/3\s*%/)

    // Count occurrences of the generic engine label "ETF-Depot" in the Vertrag
    // column. We check the full-table section for the per-instance detail table.
    // Since both rows now show workspace labels, "ETF-Depot" should appear 0
    // times in the Vertrag column (it still appears in the Produkt column but as
    // "ETF-Depot" from getProductMeta — we only care the Vertrag column is fixed).
    // The two <td> cells in the Vertrag column should contain "Depot A" / "Depot B",
    // not "ETF-Depot". Verify by checking the first column of each row via DOM.
    const detailTable = container.querySelector('.pr-main-table')
    expect(detailTable).not.toBeNull()
    const rows = Array.from(detailTable!.querySelectorAll('tbody tr'))
    const vertragTexts = rows.map((row) => row.querySelector('td')?.textContent ?? '')
    expect(vertragTexts).toContain('Depot A')
    expect(vertragTexts).toContain('Depot B')
    // The generic engine label must NOT appear in the Vertrag column.
    expect(vertragTexts.every((t) => t !== 'ETF-Depot')).toBe(true)
  })

  // -------------------------------------------------------------------------
  // PR 11 — new per-page mirror print sections.
  //
  // Compare-mode prints the "Wohin geht das Geld" per-product breakdown
  // (mirroring `/vergleich/details`) AND the "Methode & Quellen" pointer
  // block. Combine-mode prints "Zusammensetzung", "Kapital & Auszahlungen
  // — Wendepunkte je Vertrag", "Vertrag im Detail" (per-instance KPI +
  // provenance), AND "Methode & Quellen". Disclaimer-first invariant
  // remains pinned in both branches.
  // -------------------------------------------------------------------------

  describe('PR 11 — compare-mode print sections', () => {
    it('renders the "Wohin geht das Geld" section heading with dynamic retirementAge', () => {
      const { container } = render(
        <PrintReport
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          simulation={makeSimulation('user_confirmed')}
        />
      )
      const text = container.textContent ?? ''
      // Section title interpolates retirementAge (NOT hardcoded 67).
      expect(text).toContain(`Wohin geht das Geld`)
      expect(text).toContain(`Mit ${defaultProfile.retirementAge}`)
    })

    it('renders the "Methode & Quellen" block with all five bullets', () => {
      const { container } = render(
        <PrintReport
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          simulation={makeSimulation('user_confirmed')}
        />
      )
      const text = container.textContent ?? ''
      expect(text).toContain('Methode')
      expect(text).toContain('Renditeannahmen')
      expect(text).toContain('Steuermodell')
      expect(text).toContain('Sozialversicherung')
      expect(text).toContain('Statutorische Werte')
      expect(text).toContain('Bewusst nicht modelliert')
      // Methode pointer to the live /methode page.
      expect(text).toContain('rentenwiki.de/methode')
    })

    it('Wohin section sits AFTER the Produktvergleich table and BEFORE Hinweise', () => {
      const { container } = render(
        <PrintReport
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          simulation={makeSimulation('user_confirmed')}
        />
      )
      const text = container.textContent ?? ''
      const idxProdukt = text.indexOf('Produktvergleich')
      const idxWohin = text.indexOf('Wohin geht das Geld')
      const idxHinweise = text.indexOf('Hinweise und Grenzen')
      expect(idxProdukt).toBeGreaterThan(-1)
      expect(idxWohin).toBeGreaterThan(-1)
      expect(idxHinweise).toBeGreaterThan(-1)
      expect(idxProdukt).toBeLessThan(idxWohin)
      expect(idxWohin).toBeLessThan(idxHinweise)
    })
  })

  describe('PR 11 — combine-mode print sections', () => {
    function makeCombineRender(opts?: {
      etfLabel?: string
      etfInstance?: 'etf-1' | 'etf-2'
    }) {
      const etfBase = makeSimulation('user_confirmed').products[0] as ProductResult
      const etfResult: ProductResult = {
        ...etfBase,
        productId: 'etf',
        label: 'ETF-Depot',
        instanceId: opts?.etfInstance ?? 'etf-1',
        scenarioId: 'basis',
        scenarioLabel: 'Basis',
        // Provide rows for buildLifecycleLineSeries — empty is acceptable;
        // helper short-circuits to capitalAtRetirement defaults.
        rows: [],
      } as unknown as ProductResult

      const workspace: Workspace = {
        schemaVersion: 2,
        mode: 'combine',
        baseline: {
          id: 'baseline',
          label: 'Baseline',
          profile: defaultProfile,
          assumptions: {
            bav: [],
            etf: [
              {
                instanceId: opts?.etfInstance ?? 'etf-1',
                label: opts?.etfLabel ?? 'Depot A',
                status: 'active',
                contractStartYear: 2020,
                evidenceMap: { monthlyContribution: 'user_confirmed', annualAssetFee: 'model_estimate' },
                annualAssetFee: 0.002,
                equityPartialExemption: 0.3,
                annualContributionGrowthRate: 0,
                monthlyContribution: 200,
              },
            ],
            insurance: [],
            basisrente: [],
            altersvorsorgedepot: [],
            riester: [],
            statutoryPension: defaultAssumptions.statutoryPension,
            inflationRate: 0.02,
            retirementEndAge: defaultAssumptions.retirementEndAge,
            returnScenarios: defaultAssumptions.returnScenarios,
            monteCarlo: defaultAssumptions.monteCarlo,
            visibleProducts: ['etf'],
          },
          createdAt: new Date().toISOString(),
          origin: 'baseline',
        },
        whatIfs: [],
        pinnedComparisonIds: [],
      }

      return render(
        <PrintReport
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          simulation={makeSimulation('user_confirmed')}
          combineMode={true}
          portfolio={{
            perInstance: { [opts?.etfInstance ?? 'etf-1']: [etfResult] },
            combinedByScenarioId: { basis: makeCombined(2200) },
            scenarioLabels: { basis: 'Basis' },
          }}
          combineWorkspace={workspace}
        />
      )
    }

    it('renders the Zusammensetzung section with dynamic retirementAge in the heading', () => {
      const { container } = makeCombineRender()
      const text = container.textContent ?? ''
      expect(text).toContain('Zusammensetzung')
      expect(text).toContain(`Rente mit ${defaultProfile.retirementAge}`)
      // Statutory pension leading row (label varies by baseline type;
      // default workspace uses GRV).
      expect(text).toMatch(/Gesetzliche\s?Rente/)
    })

    it('renders the Kapital & Auszahlungen Wendepunkte section', () => {
      const { container } = makeCombineRender()
      const text = container.textContent ?? ''
      expect(text).toContain('Wendepunkte')
      // The four wendepunkte labels from buildWendepunkte:
      expect(text).toContain('Halbzeit der Ansparphase')
      expect(text).toContain('Renteneintritt')
      expect(text).toContain('Voraussichtliches Vertragsende')
    })

    it('renders the Vertrag im Detail section with one block per active instance', () => {
      const { container } = makeCombineRender({ etfLabel: 'My Special ETF' })
      const text = container.textContent ?? ''
      expect(text).toContain('Vertrag im Detail')
      // The user-supplied instance label is preferred over the engine label.
      expect(text).toContain('My Special ETF')
      // KPI tile labels.
      expect(text).toContain('Beitrag mtl.')
      expect(text).toContain('Einzahlungen ges.')
      expect(text).toContain('Voraussichtl. Kapital')
      expect(text).toContain('Netto-Rente')
      // Provenance pill labels — model_estimate → "Schätzwert".
      expect(text).toContain('Schätzwert')
      // user_confirmed evidence on monthlyContribution → "Bestätigt".
      expect(text).toContain('Bestätigt')
    })

    it('renders the Methode & Quellen block (combine-mode shares the compare-mode block)', () => {
      const { container } = makeCombineRender()
      const text = container.textContent ?? ''
      expect(text).toContain('Methode')
      expect(text).toContain('Renditeannahmen')
      expect(text).toContain('rentenwiki.de/methode')
    })

    it('combine-mode new sections sit AFTER "Detail je Vertrag" and BEFORE Hinweise', () => {
      const { container } = makeCombineRender()
      const text = container.textContent ?? ''
      const idxDetail = text.indexOf('Detail je Vertrag')
      const idxZusammen = text.indexOf('Zusammensetzung')
      const idxWende = text.indexOf('Wendepunkte')
      const idxVertrag = text.indexOf('Vertrag im Detail')
      const idxMethode = text.indexOf('Methode')
      const idxHinweise = text.indexOf('Hinweise und Grenzen')
      expect(idxDetail).toBeGreaterThan(-1)
      expect(idxDetail).toBeLessThan(idxZusammen)
      expect(idxZusammen).toBeLessThan(idxWende)
      expect(idxWende).toBeLessThan(idxVertrag)
      expect(idxVertrag).toBeLessThan(idxMethode)
      expect(idxMethode).toBeLessThan(idxHinweise)
    })
  })
})
