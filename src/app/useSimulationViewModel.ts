import { useMemo, useState } from 'react'
import type { InsuranceProductResult, InsuranceTaxMode, PersonalProfile, ProductId, ProductResult, ScenarioAssumptions } from '../domain'
import { afterTaxBavLumpSum, deriveBavLumpSumTaxMode } from '../engine/bavPayout'
import { afterTaxInvestmentCapital } from '../engine/etfPayout'
import { afterTaxInsuranceLumpSum, deriveInsuranceTaxMode } from '../engine/insurancePayout'
import { simulateRetirementComparison } from '../engine/simulate'
import { de2026Rules } from '../rules/de2026'
import { buildExportCsv, downloadCsv } from '../utils/csvExport'
import { buildShareUrl } from '../utils/urlShare'
import { GRV_COLOR, getProductMeta } from './productPresentation'

export function useSimulationViewModel(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
) {
  const [selectedScenarioId, setSelectedScenarioId] = useState('basis')
  const [showRealValues, setShowRealValues] = useState(false)
  const [cashflowProductId, setCashflowProductId] = useState<ProductId>('bav')
  const [tarifgebunden, setTarifgebunden] = useState(false)
  const [showAssumptions, setShowAssumptions] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const simulation = useMemo(
    () => simulateRetirementComparison(profile, assumptions, de2026Rules),
    [profile, assumptions],
  )

  // Fall back to 'basis' when the selected scenario is no longer present (e.g. user
  // just removed their custom row).
  const effectiveScenarioId = assumptions.returnScenarios.some(
    (s) => s.id === selectedScenarioId,
  )
    ? selectedScenarioId
    : 'basis'
  const selectedScenario = assumptions.returnScenarios.find(
    (scenario) => scenario.id === effectiveScenarioId,
  )
  // visibleProducts is the explicit comparison set. Empty means "no private product
  // selected" — UX10 surfaces an empty-state in the Vergleich view rather than
  // silently showing all products.
  const visibleSet = new Set<ProductId>(assumptions.visibleProducts)
  const visibleProducts = simulation.products.filter((p) => visibleSet.has(p.productId))
  const selectedResults = simulation.products
    .filter((product) => product.scenarioId === effectiveScenarioId)
    .filter((product) => visibleSet.has(product.productId))
    .sort((a, b) => (getProductMeta(a.productId)?.order ?? 99) - (getProductMeta(b.productId)?.order ?? 99))

  const capitalChartData = selectedResults[0]?.rows.map((row) => {
    const point: Record<string, string | number> = { age: row.age, year: row.year }
    selectedResults.forEach((result) => {
      const matchingRow = result.rows.find((candidate) => candidate.year === row.year)
      point[result.label] = showRealValues
        ? matchingRow?.realBalance ?? 0
        : matchingRow?.balance ?? 0
    })
    return point
  })

  const pensionBars = [
    {
      name: 'Gesetzl. Rente',
      value: simulation.statutoryPension.netMonthlyPension,
      fill: GRV_COLOR,
    },
    ...selectedResults.map((result) => ({
      name: result.label,
      value: result.netMonthlyPayout,
      fill: getProductMeta(result.productId)?.color ?? '#888888',
    })),
  ]

  const comparableCapitalResults = selectedResults.filter(
    (result): result is ProductResult & { afterTaxLumpSum: number } =>
      result.afterTaxLumpSum !== null,
  )

  const bestCapital = comparableCapitalResults.length
    ? comparableCapitalResults.reduce((best, r) =>
        r.afterTaxLumpSum > best.afterTaxLumpSum ? r : best,
      )
    : undefined
  const bestPension = selectedResults.length
    ? selectedResults.reduce((best, r) => r.netMonthlyPayout > best.netMonthlyPayout ? r : best)
    : undefined

  const cashflowResult =
    selectedResults.find((r) => r.productId === cashflowProductId) ?? selectedResults[0]
  const effectiveCashflowProductId = cashflowResult?.productId ?? cashflowProductId
  const insuranceResult = selectedResults.find((r): r is InsuranceProductResult => r.productId === 'versicherung')
  const cashflowAnnualTaxSvSavings =
    effectiveCashflowProductId === 'bav' ? simulation.bavFunding.annualTaxAndSvSavings : 0

  const insurancePayoutYear = de2026Rules.year + (profile.retirementAge - profile.age)
  const insuranceContractRuntime = insurancePayoutYear - assumptions.insurance.contractStartYear
  const insuranceTaxMode: InsuranceTaxMode = deriveInsuranceTaxMode(
    assumptions.insurance.contractStartYear,
    insuranceContractRuntime,
    profile.retirementAge,
    assumptions.insurance.oldContractTaxFreeEligible,
  )
  const kvdrMember = assumptions.bav.kvdrMember !== false
  const bavLumpSumTaxMode = deriveBavLumpSumTaxMode(
    assumptions.bav.durchfuehrungsweg,
    assumptions.bav.pre2005EligibleTaxFree,
  )

  function rowAfterTaxBalance(
    balance: number,
    cumulativeContributions: number,
    cumulativeVorabpauschale: number,
  ): number | null {
    if (effectiveCashflowProductId === 'bav') {
      return afterTaxBavLumpSum(
        balance,
        profile,
        de2026Rules,
        assumptions.bav.monthlyOtherRetirementIncome * 12,
        kvdrMember,
        insurancePayoutYear,
        bavLumpSumTaxMode,
        simulation.statutoryPension.grossMonthlyPension,
      )
    }
    if (effectiveCashflowProductId === 'etf') {
      return afterTaxInvestmentCapital(
        balance,
        cumulativeContributions,
        de2026Rules,
        assumptions.etf.equityPartialExemption,
        cumulativeVorabpauschale,
      )
    }
    if (
      effectiveCashflowProductId === 'altersvorsorgedepot' ||
      effectiveCashflowProductId === 'basisrente' ||
      effectiveCashflowProductId === 'riester'
    ) {
      return null
    }
    const otherAnnual = assumptions.insurance.monthlyOtherRetirementIncome * 12
    return afterTaxInsuranceLumpSum(
      balance,
      cumulativeContributions,
      insuranceTaxMode,
      de2026Rules,
      otherAnnual,
      insurancePayoutYear,
      profile,
      kvdrMember,
      simulation.statutoryPension.grossMonthlyPension,
    )
  }

  function handleCopyLink() {
    const url = buildShareUrl(profile, assumptions)
    history.replaceState(null, '', url)
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    })
  }

  function handleExportCsv() {
    const csv = buildExportCsv({
      products: simulation.products.filter((p) => visibleSet.has(p.productId)),
      bavAnnualTaxSvSavings: simulation.bavFunding.annualTaxAndSvSavings,
      bavProfile: profile,
      bavKvdrMember: kvdrMember,
      bavOtherAnnualIncome: assumptions.bav.monthlyOtherRetirementIncome * 12,
      insuranceTaxMode,
      equityPartialExemption: assumptions.etf.equityPartialExemption,
      insuranceOtherAnnualIncome: assumptions.insurance.monthlyOtherRetirementIncome * 12,
      rules: de2026Rules,
    })
    downloadCsv('rentenrechner-export.csv', csv)
  }

  return {
    // UI state
    selectedScenarioId: effectiveScenarioId, setSelectedScenarioId,
    showRealValues, setShowRealValues,
    cashflowProductId: effectiveCashflowProductId, setCashflowProductId,
    tarifgebunden, setTarifgebunden,
    showAssumptions, setShowAssumptions,
    linkCopied,
    // Simulation
    simulation,
    /** simulation.products filtered to the user's visibleProducts selection. */
    visibleProducts,
    // Derived display data
    selectedScenario,
    selectedResults,
    capitalChartData,
    pensionBars,
    comparableCapitalResults,
    bestCapital,
    bestPension,
    cashflowResult,
    insuranceResult,
    cashflowAnnualTaxSvSavings,
    // Tax helpers
    insurancePayoutYear,
    insuranceContractRuntime,
    insuranceTaxMode,
    kvdrMember,
    bavLumpSumTaxMode,
    // Callbacks
    rowAfterTaxBalance,
    handleCopyLink,
    handleExportCsv,
  }
}
