// @vitest-environment jsdom
/**
 * Render tests for `CombineDetailView` (Group G issue 28).
 *
 * Coverage:
 *   - Renders one row per active/paid_up instance, including multiple
 *     instances of the same product type (workspace v2 multi-instance).
 *   - Skips surrendered instances.
 *   - Surfaces provenance markers for user-confirmed vs. estimated input
 *     fields via the shared `ProvLabel` primitive.
 *   - Empty workspace renders the empty state, not a malformed table.
 *   - Compare-mode `DetailComparisonTable` is never invoked here — these
 *     tests use the sibling component directly.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { CombineDetailView } from './CombineDetailView'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import { migrateV1ToV2 } from '../../storage'
import { PRODUCT_EVIDENCE_FIELDS } from '../../app/evidence'
import type { Workspace } from '../../domain/workspace'
import type { EtfInstance, BavInstance } from '../../domain/instances'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { RetirementTaxBreakdown, RetirementKvPvBreakdown } from '../../domain/retirementTax'
import { formatCurrency } from '../../utils/format'

afterEach(() => cleanup())

/** Zero-value RetirementTaxBreakdown for use in synthetic CombinedResult objects in tests. */
function zeroTaxBreakdown(): RetirementTaxBreakdown {
  return {
    statutoryPensionTaxable: 0,
    bavPensionTaxable: 0,
    privateInsuranceTaxable: 0,
    otherTaxable: 0,
    werbungskostenVersorgung: 0,
    werbungskostenRenten: 0,
    sonderausgaben: 0,
    zuVersteuerndesEinkommen: 0,
    einkommensteuer: 0,
    solidaritaetszuschlag: 0,
    abgeltungsteuerOnPrivateInsurance: 0,
    totalTaxAnnual: 0,
    netRetirementIncomeAnnual: 0,
  }
}

/** Zero-value RetirementKvPvBreakdown for use in synthetic CombinedResult objects in tests. */
function zeroKvPvBreakdown(): RetirementKvPvBreakdown {
  return {
    bavKvMonthly: 0,
    bavPvMonthly: 0,
    otherVersorgungsbezuegeKvMonthly: 0,
    otherVersorgungsbezuegePvMonthly: 0,
    statutoryPensionKvMonthly: 0,
    statutoryPensionPvMonthly: 0,
    freiwilligOtherKvMonthly: 0,
    freiwilligOtherPvMonthly: 0,
    totalKvMonthly: 0,
    totalPvMonthly: 0,
    uncappedKvMonthly: 0,
    uncappedPvMonthly: 0,
  }
}

function makeBaseWorkspace(): Workspace {
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    defaultAssumptions as unknown as Record<string, unknown>,
  )
}

function defaultProps(workspace: Workspace) {
  const bundle = runCombineSimulation(workspace, de2026Rules)
  const scenario = workspace.baseline.assumptions.returnScenarios[0]
  return {
    workspace,
    perInstance: bundle.perInstance,
    selectedScenarioId: scenario.id,
    selectedScenarioLabel: scenario.label,
    onExportCsv: vi.fn(),
    onPrint: vi.fn(),
  }
}

describe('CombineDetailView — multi-instance row rendering (#28)', () => {
  it('renders one row per active instance, including multiple instances of the same product', () => {
    const ws = makeBaseWorkspace()
    // Strip the migrated default contents; we want a deterministic 2 ETF + 1 bAV setup.
    ws.baseline.assumptions.etf = []
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []

    const etfA: EtfInstance = {
      instanceId: 'etf-A',
      label: 'Aktien-ETF',
      status: 'active',
      contractStartYear: 2022,
      currentValueEUR: 0,
      annualAssetFee: 0.002,
      annualContributionGrowthRate: 0,
      equityPartialExemption: 0.3,
      monthlyContribution: 200,
      evidenceMap: {},
    }
    const etfB: EtfInstance = {
      ...etfA,
      instanceId: 'etf-B',
      label: 'World-ETF',
      monthlyContribution: 150,
    }
    const bavExisting: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-X',
      label: 'Direktversicherung Allianz',
    }
    ws.baseline.assumptions.etf = [etfA, etfB]
    ws.baseline.assumptions.bav = [bavExisting]

    const { container, getByText } = render(<CombineDetailView {...defaultProps(ws)} />)

    // 2 ETF + 1 bAV = 3 rows.
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(3)

    // Each instance label is rendered.
    expect(getByText('Aktien-ETF')).not.toBeNull()
    expect(getByText('World-ETF')).not.toBeNull()
    expect(getByText('Direktversicherung Allianz')).not.toBeNull()
  })

  it('skips surrendered instances — they are not rows', () => {
    const ws = makeBaseWorkspace()
    ws.baseline.assumptions.etf = []
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []

    const active: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-active',
      label: 'Aktive bAV',
    }
    const surrendered: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-surrendered',
      label: 'Gekündigte bAV',
      status: 'surrendered',
    }
    ws.baseline.assumptions.bav = [active, surrendered]

    const { container, queryByText, getByText } = render(<CombineDetailView {...defaultProps(ws)} />)

    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(getByText('Aktive bAV')).not.toBeNull()
    expect(queryByText('Gekündigte bAV')).toBeNull()
  })

  it('renders the empty state when no instances are present', () => {
    const ws = makeBaseWorkspace()
    ws.baseline.assumptions.bav = []
    ws.baseline.assumptions.etf = []
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []

    const { container, queryByText } = render(<CombineDetailView {...defaultProps(ws)} />)
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(0)
    expect(queryByText(/Noch keine Verträge erfasst/)).not.toBeNull()
  })

  it('empty state does not contain "Empfehlungs-Plan" (Sober D voice guard)', () => {
    const ws = makeBaseWorkspace()
    ws.baseline.assumptions.bav = []
    ws.baseline.assumptions.etf = []
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []

    const { container } = render(<CombineDetailView {...defaultProps(ws)} />)
    const emptyPara = container.querySelector('.combine-detail-empty')
    expect(emptyPara).not.toBeNull()
    expect(emptyPara?.textContent).not.toContain('Empfehlungs-Plan')
  })

  it('CSV and print buttons fire the supplied handlers', () => {
    const ws = makeBaseWorkspace()
    const props = defaultProps(ws)
    const { getByText } = render(<CombineDetailView {...props} />)
    getByText('CSV exportieren').click()
    getByText('PDF drucken').click()
    expect(props.onExportCsv).toHaveBeenCalledTimes(1)
    expect(props.onPrint).toHaveBeenCalledTimes(1)
  })

  it('does not render a "Link kopieren" button (combine mode never shares v1 URLs)', () => {
    const ws = makeBaseWorkspace()
    const { queryByText } = render(<CombineDetailView {...defaultProps(ws)} />)
    expect(queryByText('Link kopieren')).toBeNull()
  })
})

describe('CombineDetailView — back-allocated netto from combinedForScenario (#28 P1)', () => {
  /**
   * Regression test: when two taxable sources interact under progressive tax,
   * the per-instance simulator's `netMonthlyPayout` overstates the correct
   * after-tax net. The view must render `byInstance[id].monthlyNet` from the
   * aggregate `CombinedResult`, not the per-instance value.
   *
   * Strategy: run the real simulation for a 2-instance workspace (bAV + ETF),
   * then build a synthetic `CombinedResult` whose `byInstance` entries contain
   * deliberately different sentinel values. Assert the rendered netto cells
   * match the synthetic values, proving the component reads from
   * `combinedForScenario.byInstance` and not from `result.netMonthlyPayout`.
   */
  it('renders byInstance.monthlyNet, not result.netMonthlyPayout, when combinedForScenario is provided', () => {
    const ws = makeBaseWorkspace()
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []

    const etfInst: EtfInstance = {
      instanceId: 'etf-reg',
      label: 'Reg-ETF',
      status: 'active',
      contractStartYear: 2022,
      currentValueEUR: 0,
      annualAssetFee: 0.002,
      annualContributionGrowthRate: 0,
      equityPartialExemption: 0.3,
      monthlyContribution: 300,
      evidenceMap: {},
    }
    const bavInst: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-reg',
      label: 'Reg-bAV',
    }
    ws.baseline.assumptions.etf = [etfInst]
    ws.baseline.assumptions.bav = [bavInst]

    const bundle = runCombineSimulation(ws, de2026Rules)
    const scenario = ws.baseline.assumptions.returnScenarios[0]
    const scenarioId = scenario.id

    // Grab what the per-instance simulator produced so we can confirm the
    // rendered value differs from it when we supply a synthetic combined result.
    const etfPerInstanceResult = bundle.perInstance['etf-reg']?.find(
      (r) => r.scenarioId === scenarioId,
    )
    const bavPerInstanceResult = bundle.perInstance['bav-reg']?.find(
      (r) => r.scenarioId === scenarioId,
    )

    // Sentinel monthly-net values that are intentionally different from the
    // per-instance simulator outputs (simulating the progressive-tax reduction
    // that the aggregate pipeline would apply).
    const ETF_BACK_ALLOCATED_NET = 777.77
    const BAV_BACK_ALLOCATED_NET = 444.44

    // Sanity: the sentinel must differ from the per-instance value so the test
    // meaningfully distinguishes the two sources.
    expect(etfPerInstanceResult?.netMonthlyPayout).not.toBeCloseTo(ETF_BACK_ALLOCATED_NET, 0)
    expect(bavPerInstanceResult?.netMonthlyPayout).not.toBeCloseTo(BAV_BACK_ALLOCATED_NET, 0)

    const syntheticCombined: CombinedResult = {
      monthlyNetIncome: ETF_BACK_ALLOCATED_NET + BAV_BACK_ALLOCATED_NET,
      monthlyGrossPayouts: {
        statutoryPension: 0,
        bav: bavPerInstanceResult?.netMonthlyPayout ?? 500,
        privateInsurance: 0,
        basisrente: 0,
        altersvorsorgedepot: 0,
        riester: 0,
        etf: etfPerInstanceResult?.netMonthlyPayout ?? 800,
      },
      aggregateTax: zeroTaxBreakdown(),
      aggregateKvPv: zeroKvPvBreakdown(),
      byInstance: {
        'etf-reg': {
          instanceId: 'etf-reg',
          productId: 'etf',
          monthlyGross: etfPerInstanceResult?.netMonthlyPayout ?? 800,
          monthlyNet: ETF_BACK_ALLOCATED_NET,
          taxShareAnnual: 1200,
          kvPvShare: 50,
        },
        'bav-reg': {
          instanceId: 'bav-reg',
          productId: 'bav',
          monthlyGross: bavPerInstanceResult?.netMonthlyPayout ?? 500,
          monthlyNet: BAV_BACK_ALLOCATED_NET,
          taxShareAnnual: 600,
          kvPvShare: 80,
        },
      },
      statutoryPensionMonthlyNet: 0,
      notes: [],
    }

    const { container } = render(
      <CombineDetailView
        workspace={ws}
        perInstance={bundle.perInstance}
        selectedScenarioId={scenarioId}
        selectedScenarioLabel={scenario.label}
        combinedForScenario={syntheticCombined}
        onExportCsv={vi.fn()}
        onPrint={vi.fn()}
      />,
    )

    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(2)

    // Collect all netto cell text from the table. The netto column is the 6th
    // column (index 5). Verify the back-allocated sentinel values appear and
    // the raw per-instance values do not.
    const nettoCells = Array.from(rows).map((row) => {
      const cells = row.querySelectorAll('td')
      return cells[5]?.textContent ?? ''
    })

    const etfExpected = formatCurrency(ETF_BACK_ALLOCATED_NET, 0)
    const bavExpected = formatCurrency(BAV_BACK_ALLOCATED_NET, 0)

    expect(nettoCells).toEqual(
      expect.arrayContaining([
        expect.stringContaining(etfExpected),
        expect.stringContaining(bavExpected),
      ]),
    )

    // The raw per-instance values must NOT appear in the netto cells.
    const etfRaw = formatCurrency(etfPerInstanceResult?.netMonthlyPayout ?? -1, 0)
    const bavRaw = formatCurrency(bavPerInstanceResult?.netMonthlyPayout ?? -1, 0)
    for (const cell of nettoCells) {
      expect(cell).not.toBe(etfRaw)
      expect(cell).not.toBe(bavRaw)
    }
  })

  it('falls back to result.netMonthlyPayout when combinedForScenario is undefined', () => {
    const ws = makeBaseWorkspace()
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []
    ws.baseline.assumptions.bav = []

    const etfInst: EtfInstance = {
      instanceId: 'etf-fallback',
      label: 'Fallback-ETF',
      status: 'active',
      contractStartYear: 2022,
      currentValueEUR: 0,
      annualAssetFee: 0.002,
      annualContributionGrowthRate: 0,
      equityPartialExemption: 0.3,
      monthlyContribution: 200,
      evidenceMap: {},
    }
    ws.baseline.assumptions.etf = [etfInst]

    const bundle = runCombineSimulation(ws, de2026Rules)
    const scenario = ws.baseline.assumptions.returnScenarios[0]
    const scenarioId = scenario.id

    const perInstanceResult = bundle.perInstance['etf-fallback']?.find(
      (r) => r.scenarioId === scenarioId,
    )
    // The result must exist and have a meaningful net payout for this test.
    expect(perInstanceResult).toBeDefined()
    expect(perInstanceResult?.netMonthlyPayout).toBeGreaterThan(0)

    const { container } = render(
      <CombineDetailView
        workspace={ws}
        perInstance={bundle.perInstance}
        selectedScenarioId={scenarioId}
        selectedScenarioLabel={scenario.label}
        combinedForScenario={undefined}
        onExportCsv={vi.fn()}
        onPrint={vi.fn()}
      />,
    )

    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(1)
    const nettoCell = rows[0].querySelectorAll('td')[5]?.textContent ?? ''
    const expected = formatCurrency(perInstanceResult!.netMonthlyPayout, 0)
    expect(nettoCell).toContain(expected)
  })

  it('surfaces tax and KV/PV tooltip on the netto cell when combinedForScenario is provided', () => {
    const ws = makeBaseWorkspace()
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []
    ws.baseline.assumptions.bav = []

    const etfInst: EtfInstance = {
      instanceId: 'etf-tooltip',
      label: 'Tooltip-ETF',
      status: 'active',
      contractStartYear: 2022,
      currentValueEUR: 0,
      annualAssetFee: 0.002,
      annualContributionGrowthRate: 0,
      equityPartialExemption: 0.3,
      monthlyContribution: 200,
      evidenceMap: {},
    }
    ws.baseline.assumptions.etf = [etfInst]

    const bundle = runCombineSimulation(ws, de2026Rules)
    const scenario = ws.baseline.assumptions.returnScenarios[0]
    const scenarioId = scenario.id

    const syntheticCombined: CombinedResult = {
      monthlyNetIncome: 900,
      monthlyGrossPayouts: {
        statutoryPension: 0, bav: 0, privateInsurance: 0,
        basisrente: 0, altersvorsorgedepot: 0, riester: 0, etf: 1000,
      },
      aggregateTax: zeroTaxBreakdown(),
      aggregateKvPv: zeroKvPvBreakdown(),
      byInstance: {
        'etf-tooltip': {
          instanceId: 'etf-tooltip',
          productId: 'etf',
          monthlyGross: 1000,
          monthlyNet: 900,
          taxShareAnnual: 1200, // 100 €/mo
          kvPvShare: 45,
        },
      },
      statutoryPensionMonthlyNet: 0,
      notes: [],
    }

    const { container } = render(
      <CombineDetailView
        workspace={ws}
        perInstance={bundle.perInstance}
        selectedScenarioId={scenarioId}
        selectedScenarioLabel={scenario.label}
        combinedForScenario={syntheticCombined}
        onExportCsv={vi.fn()}
        onPrint={vi.fn()}
      />,
    )

    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(1)
    const nettoCell = rows[0].querySelectorAll('td')[5] as HTMLElement | undefined
    expect(nettoCell).toBeDefined()
    // The title/aria-label must mention both tax and KV/PV values.
    const title = nettoCell?.getAttribute('title') ?? ''
    expect(title).toContain('Steuer')
    expect(title).toContain('KV/PV')
    // taxShareAnnual = 1200, /12 = 100 €/mo → formatCurrency(100, 0)
    expect(title).toContain(formatCurrency(100, 0))
    // kvPvShare = 45 €/mo → formatCurrency(45, 0)
    expect(title).toContain(formatCurrency(45, 0))
  })
})

describe('CombineDetailView — provenance markers (#28)', () => {
  it('shows the "Modellwert" pill when an instance has an empty evidenceMap (model-estimate)', () => {
    const ws = makeBaseWorkspace()
    // The migrateV1ToV2 default contents start with empty evidenceMaps → model_estimate.
    const { container } = render(<CombineDetailView {...defaultProps(ws)} />)
    const modelPills = container.querySelectorAll('.pec-prov--model')
    // At least one row (default workspace has bAV at minimum) carries the model marker.
    expect(modelPills.length).toBeGreaterThan(0)
  })

  it('shows the "geprüft" pill when all consumed input fields are user_confirmed', () => {
    const ws = makeBaseWorkspace()
    ws.baseline.assumptions.bav = []
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []

    const etfEvidenceMap = Object.fromEntries(
      PRODUCT_EVIDENCE_FIELDS.etf.map((f) => [f, 'user_confirmed' as const]),
    )
    const confirmedEtf: EtfInstance = {
      instanceId: 'etf-confirmed',
      label: 'Vertragsgeprüfter ETF',
      status: 'active',
      contractStartYear: 2022,
      currentValueEUR: 0,
      annualAssetFee: 0.002,
      annualContributionGrowthRate: 0,
      equityPartialExemption: 0.3,
      monthlyContribution: 200,
      evidenceMap: etfEvidenceMap,
    }
    ws.baseline.assumptions.etf = [confirmedEtf]

    const { container } = render(<CombineDetailView {...defaultProps(ws)} />)
    const confirmedPills = container.querySelectorAll('.pec-prov--confirmed')
    // Exactly one row, marker must be confirmed.
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(confirmedPills.length).toBe(1)
  })
})
