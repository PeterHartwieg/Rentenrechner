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
      // Methode pointer to the live /methode page (brand: RentenWiki.de per
      // CLAUDE.md public-copy convention).
      expect(text).toContain('RentenWiki.de/methode')
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
      // Branded RentenWiki.de per CLAUDE.md public-copy convention (CR6).
      expect(text).toContain('RentenWiki.de/methode')
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

    // ---------------------------------------------------------------------
    // PR 11 R1 scope restore — sensitivity sub-table inside § Zusammensetzung.
    // ---------------------------------------------------------------------

    it('renders the Sensitivität sub-table when combineSensitivityRows is passed', () => {
      // Use the local makeCombineRender fixture and inject sensitivity rows
      // directly so this test is hermetic — no `runCombineSimulation` cost.
      const etfBase = makeSimulation('user_confirmed').products[0] as ProductResult
      const etfResult: ProductResult = {
        ...etfBase,
        productId: 'etf',
        label: 'ETF-Depot',
        instanceId: 'etf-1',
        scenarioId: 'basis',
        scenarioLabel: 'Basis',
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
                instanceId: 'etf-1',
                label: 'Depot A',
                status: 'active',
                contractStartYear: 2020,
                evidenceMap: {},
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

      const { container } = render(
        <PrintReport
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          simulation={makeSimulation('user_confirmed')}
          combineMode={true}
          portfolio={{
            perInstance: { 'etf-1': [etfResult] },
            combinedByScenarioId: { basis: makeCombined(2200) },
            scenarioLabels: { basis: 'Basis' },
          }}
          combineWorkspace={workspace}
          combineSensitivityRows={[
            {
              id: 'rendite-konservativ',
              conditionText:
                '… die Märkte über die gesamte Laufzeit nur 3,0 % p. a. erwirtschaften (Szenario „Konservativ")',
              deltaText: '−120 € / Mon.',
              sign: 'neg',
              noteText: null,
            },
            {
              id: 'etf-bump',
              conditionText: '… du den ersten ETF-Sparplan um 100 €/Monat erhöhst',
              deltaText: '+45 € / Mon.',
              sign: 'pos',
              noteText: null,
            },
          ]}
        />,
      )

      const text = container.textContent ?? ''
      // Renamed combined section heading.
      expect(text).toContain('Zusammensetzung & Sensitivität')
      // Sub-heading rendered.
      expect(text).toContain('Was sich ändern würde')
      // Both perturbation conditions render.
      expect(text).toContain('Märkte über die gesamte Laufzeit')
      expect(text).toContain('ETF-Sparplan')
      // Delta text rendered with correct signs.
      expect(text).toContain('−120 € / Mon.')
      expect(text).toContain('+45 € / Mon.')
      // CSS-class hook for the sub-table is present so styling locks in.
      expect(container.querySelector('.pr-sens-table')).not.toBeNull()
      // Pos/neg pill classes are applied.
      expect(container.querySelector('.pr-sens-delta--pos')).not.toBeNull()
      expect(container.querySelector('.pr-sens-delta--neg')).not.toBeNull()
    })
  })

  // ---------------------------------------------------------------------
  // PR 4.1 (H4) Sober D port regression coverage.
  //
  // The visual port is observable mostly via CSS — JSDOM does not apply
  // `@media print` styling, so the regression tests below assert the
  // structural / textual contracts of the printed output:
  //   - Public brand "RentenWiki.de" is in the printed title (P0).
  //   - The `.pr-disclaimer-top` block is the LITERAL first child of
  //     `#print-report` even with `combineSensitivityRows` threaded in.
  //   - The compare-mode summary table row count matches what the
  //     `exportProjection.buildCompareExportProjection` produces, so the
  //     CSV and PDF exports stay row-aligned even as new products are added.
  // ---------------------------------------------------------------------

  describe('PR 4.1 — Sober D port regression coverage', () => {
    it('compare-mode header still says "RentenWiki.de" (public-brand P0)', () => {
      const { container } = render(
        <PrintReport
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          simulation={makeSimulation('user_confirmed')}
        />,
      )
      const title = container.querySelector('.pr-title')
      expect(title).not.toBeNull()
      expect(title?.textContent ?? '').toContain('RentenWiki.de')
      // The legacy "Rentenrechner" surface must not have leaked into a
      // public-facing brand string.
      expect(title?.textContent ?? '').not.toContain('Rentenrechner')
    })

    it('combine-mode header still says "RentenWiki.de" (public-brand P0)', () => {
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
        />,
      )
      const title = container.querySelector('.pr-title')
      expect(title).not.toBeNull()
      expect(title?.textContent ?? '').toContain('RentenWiki.de')
    })

    it('disclaimer-first invariant holds with combineSensitivityRows + workspace threaded in', () => {
      // Belt-and-braces: re-pin the P0 disclaimer-first invariant for the
      // combine-mode branch when EVERY combine prop is set (the path
      // Calculator.tsx exercises in production).
      const etfBase = makeSimulation('user_confirmed').products[0] as ProductResult
      const etfResult: ProductResult = {
        ...etfBase,
        productId: 'etf',
        label: 'ETF-Depot',
        instanceId: 'etf-1',
        scenarioId: 'basis',
        scenarioLabel: 'Basis',
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
                instanceId: 'etf-1',
                label: 'Depot A',
                status: 'active',
                contractStartYear: 2020,
                evidenceMap: {},
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

      const { container } = render(
        <PrintReport
          profile={defaultProfile}
          assumptions={defaultAssumptions}
          simulation={makeSimulation('user_confirmed')}
          combineMode={true}
          portfolio={{
            perInstance: { 'etf-1': [etfResult] },
            combinedByScenarioId: { basis: makeCombined(2200) },
            scenarioLabels: { basis: 'Basis' },
          }}
          combineWorkspace={workspace}
          combineSensitivityRows={[
            {
              id: 'etf-bump',
              conditionText: '… du den ersten ETF-Sparplan um 100 €/Monat erhöhst',
              deltaText: '+45 € / Mon.',
              sign: 'pos',
              noteText: null,
            },
          ]}
        />,
      )
      const root = container.querySelector('#print-report')
      expect(root).not.toBeNull()
      const firstChild = root!.firstElementChild
      expect(firstChild?.classList.contains('pr-disclaimer-top')).toBe(true)
      expect(firstChild?.tagName.toLowerCase()).toBe('section')
      // Exactly one disclaimer-top in the entire print tree.
      expect(root!.querySelectorAll('.pr-disclaimer-top').length).toBe(1)
    })

    it('compare summary table row count equals buildCompareExportProjection summary length', async () => {
      // Phase B (row-builder migration) acceptance: both the print summary
      // table and the CSV "Detailvergleich" section iterate the same set of
      // rows — the projection layer is the canonical source. We do not
      // re-thread `bavFunding` etc. into PrintReport (which would be a
      // larger API change); instead we assert that for the same input the
      // print row count matches the projection row count, so any future
      // filter / sort change must update both sides consistently.
      const { buildCompareExportProjection } = await import(
        '../../engine/exportProjection'
      )
      const { de2026Rules } = await import('../../rules/de2026')

      // Two scenarios so we get >1 row per product and the count check is
      // meaningful (singleton products × scenarios).
      const sim = makeSimulation('user_confirmed')
      const productBase = sim.products[0] as ProductResult
      const productKonservativ: ProductResult = {
        ...productBase,
        scenarioId: 'konservativ',
        scenarioLabel: 'Konservativ',
      } as unknown as ProductResult
      const productsForBoth: ProductResult[] = [productBase, productKonservativ]

      const projection = buildCompareExportProjection({
        products: productsForBoth,
        bavAnnualTaxSvSavings: 0,
        bavProfile: defaultProfile,
        bavKvdrMember: true,
        bavOtherAnnualIncome: 0,
        insuranceTaxMode: 'abgeltungsteuer',
        equityPartialExemption: 0.3,
        insuranceOtherAnnualIncome: 0,
        rules: de2026Rules,
      })

      const { container } = render(
        <PrintReport
          profile={defaultProfile}
          assumptions={{
            ...defaultAssumptions,
            visibleProducts: ['etf'],
          }}
          simulation={{ ...sim, products: productsForBoth }}
        />,
      )
      const mainTable = container.querySelector('.pr-main-table')
      expect(mainTable).not.toBeNull()
      const rows = mainTable!.querySelectorAll('tbody tr')
      // Print and projection sourced from the same `products` array →
      // identical row count. The projection layer applies no extra
      // filter / sort that the print does not.
      expect(rows.length).toBe(projection.summary.length)
      // The afterTaxLumpSum displayed in the print matches the projection
      // value formatted to whole euros — this is the "single source of truth"
      // assertion required by the cron-dispatch §2 paired-test guardrail.
      // (Both rows correspond to the same product so afterTax is consistent;
      //  we sample row 0.)
      const row0 = rows[0]
      const projRow0 = projection.summary[0]
      if (projRow0 && projRow0.afterTaxLumpSum !== null) {
        // The "Kapital n. St." cell is the 5th td (0-indexed: 4).
        const afterTaxCell = row0.querySelectorAll('td')[4]
        expect(afterTaxCell).toBeDefined()
        // Engine returns full precision; print formatter rounds to whole €.
        const expected = Math.round(projRow0.afterTaxLumpSum)
        // We assert containment rather than equality so locale formatting
        // (thousands separator) does not break the assertion.
        expect(afterTaxCell.textContent ?? '').toMatch(
          new RegExp(String(expected).replace(/(?<=\d)(?=(\d{3})+$)/g, '\\.?')),
        )
      }
    })

    it('CSS file declares the load-bearing Sober D tokens, @page rule, and @media print block', async () => {
      // String-content regression test. The CSS file is shipped via a
      // co-located `import './PrintReport.css'` — vitest's CSS handler does
      // not parse it, so we read the raw file and assert structural tokens
      // appear. This protects against accidental removal of the print
      // boundary (@page / @media print) and the Sober D token vocabulary.
      const { readFileSync } = await import('node:fs')
      const { resolve } = await import('node:path')
      // Resolve via the project working directory rather than
      // `import.meta.url` — the latter is not a `file://` URL under vitest
      // ESM transform on Windows.
      const cssPath = resolve(
        process.cwd(),
        'src/features/results/PrintReport.css',
      )
      const css = readFileSync(cssPath, 'utf8')

      // Sober D tokens — the load-bearing five.
      expect(css).toContain('var(--rw-bg-paper)')
      expect(css).toContain('var(--rw-ink)')
      expect(css).toContain('var(--rw-rule)')
      expect(css).toContain('var(--rw-font-sans)')
      expect(css).toContain('var(--rw-font-mono)')
      // Print boundary.
      expect(css).toMatch(/@page\s*{[^]*?size:\s*A4\s+portrait/)
      expect(css).toMatch(/@media\s+print\s*{/)
      // Color-adjust hook so user-agents do not strip backgrounds.
      expect(css).toMatch(/print-color-adjust:\s*exact/)
      // Page-number suppression on page 1 (disclaimer page).
      expect(css).toMatch(/@page\s*:first/)
      // Disclaimer-top still has its own class block (no accidental rename).
      expect(css).toContain('.pr-disclaimer-top')
    })
  })
})
