// Composes simulation output and UI state into chart/table/export-shaped data.
//
// Every field here is a pure function of (simulation, ui, profile, assumptions)
// — exported through pure selectors in `simulationSelectors.ts`. The hook just
// memoizes.

import { useMemo } from 'react'
import type {
  InsuranceProductResult,
  PersonalProfile,
  ProductId,
  ProductResult,
  ScenarioAssumptions,
} from '../domain'
import type { CombinedResult } from '../engine/portfolioCombine'
import { de2026Rules } from '../rules/de2026'
import { buildCombinePortfolioCsv, buildExportCsv, downloadCsv } from '../utils/csvExport'
import { buildShareUrl } from '../utils/urlShare'
import {
  buildCapitalChartData,
  buildPensionBars,
  deriveBestCapital,
  deriveBestPension,
  deriveCashflowBinding,
  deriveSelectedResults,
  deriveVisibleProducts,
  makeRowAfterTaxBalance,
} from './simulationSelectors'
import type { SimulationResultBundle } from './useSimulationResult'
import { useState } from 'react'

export interface DerivedViews {
  visibleProducts: ProductResult[]
  selectedResults: ProductResult[]
  capitalChartData: Array<Record<string, string | number>> | undefined
  pensionBars: Array<{ name: string; value: number; fill: string }>
  bestCapital: ReturnType<typeof deriveBestCapital>
  bestPension: ReturnType<typeof deriveBestPension>
  cashflowResult: ProductResult | undefined
  effectiveCashflowProductId: ProductId
  insuranceResult: InsuranceProductResult | undefined
  cashflowAnnualTaxSvSavings: number
  rowAfterTaxBalance: (
    balance: number,
    cumulativeContributions: number,
    cumulativeVorabpauschale: number,
  ) => number | null
  /** Whether the Teilen-Link button just copied — auto-resets after 1.5s. */
  linkCopied: boolean
  handleCopyLink: () => void
  handleExportCsv: () => void
}

/**
 * Optional combine-mode bundle. When provided AND `combineMode === true`,
 * `handleExportCsv` emits the per-instance + combined-income CSV instead of
 * the singleton compare-mode export. Compare-mode behaviour is byte-identical
 * when this is omitted (Group G issue 11).
 */
export interface CombineExportBundle {
  perInstance: Record<string, ProductResult[]>
  combinedByScenarioId: Record<string, CombinedResult>
  scenarioLabels: Record<string, string>
}

export function useDerivedViews(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  result: SimulationResultBundle,
  ui: {
    showRealValues: boolean
    cashflowProductId: ProductId
  },
  options?: {
    combineMode?: boolean
    combine?: CombineExportBundle
  },
): DerivedViews {
  const { simulation, effectiveScenarioId, taxModes } = result

  const visibleProducts = useMemo(
    () => deriveVisibleProducts(simulation, assumptions.visibleProducts),
    [simulation, assumptions.visibleProducts],
  )

  const selectedResults = useMemo(
    () => deriveSelectedResults(simulation, assumptions.visibleProducts, effectiveScenarioId),
    [simulation, assumptions.visibleProducts, effectiveScenarioId],
  )

  const capitalChartData = useMemo(
    () => buildCapitalChartData(selectedResults, ui.showRealValues),
    [selectedResults, ui.showRealValues],
  )

  const pensionBars = useMemo(
    () => buildPensionBars(simulation, selectedResults),
    [simulation, selectedResults],
  )

  const bestCapital = useMemo(() => deriveBestCapital(selectedResults), [selectedResults])
  const bestPension = useMemo(() => deriveBestPension(selectedResults), [selectedResults])

  const cashflowBinding = useMemo(
    () => deriveCashflowBinding(selectedResults, ui.cashflowProductId, simulation),
    [selectedResults, ui.cashflowProductId, simulation],
  )

  const rowAfterTaxBalance = useMemo(
    () =>
      makeRowAfterTaxBalance({
        effectiveCashflowProductId: cashflowBinding.effectiveCashflowProductId,
        profile,
        assumptions,
        rules: de2026Rules,
        simulation,
        taxModes,
      }),
    [cashflowBinding.effectiveCashflowProductId, profile, assumptions, simulation, taxModes],
  )

  // Side-effect callbacks. linkCopied resets after 1.5s; the timer state
  // belongs with the callback that sets it, hence local useState here.
  const [linkCopied, setLinkCopied] = useState(false)

  function handleCopyLink() {
    const url = buildShareUrl(profile, assumptions)
    history.replaceState(null, '', url)
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    })
  }

  function handleExportCsv() {
    // Combine-mode (Group G issue 11): emit portfolio rows when the caller
    // supplies the per-instance + combined bundle. Compare-mode (no
    // `combine`) keeps the singleton export byte-identical.
    if (options?.combineMode && options.combine) {
      const csv = buildCombinePortfolioCsv(options.combine)
      downloadCsv('TODO_BRAND_NAME-export.csv', csv)
      return
    }
    const csv = buildExportCsv({
      products: visibleProducts,
      bavAnnualTaxSvSavings: simulation.bavFunding.annualTaxAndSvSavings,
      bavProfile: profile,
      bavKvdrMember: taxModes.kvdrMember,
      bavOtherAnnualIncome: assumptions.bav.monthlyOtherRetirementIncome * 12,
      insuranceTaxMode: taxModes.insuranceTaxMode,
      equityPartialExemption: assumptions.etf.equityPartialExemption,
      insuranceOtherAnnualIncome: assumptions.insurance.monthlyOtherRetirementIncome * 12,
      rules: de2026Rules,
    })
    downloadCsv('TODO_BRAND_NAME-export.csv', csv)
  }

  return {
    visibleProducts,
    selectedResults,
    capitalChartData,
    pensionBars,
    bestCapital,
    bestPension,
    cashflowResult: cashflowBinding.cashflowResult,
    effectiveCashflowProductId: cashflowBinding.effectiveCashflowProductId,
    insuranceResult: cashflowBinding.insuranceResult,
    cashflowAnnualTaxSvSavings: cashflowBinding.cashflowAnnualTaxSvSavings,
    rowAfterTaxBalance,
    linkCopied,
    handleCopyLink,
    handleExportCsv,
  }
}
