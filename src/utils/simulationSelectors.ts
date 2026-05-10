// Pure, framework-agnostic selectors derived from simulation results.
//
// Subset extracted for use by src/api/ and src/engine/ — keeping those layers
// free of upward src/app imports. src/app/simulationSelectors re-exports from
// here; UI-only selectors (buildPensionBars, Rentenlücke helpers, etc.) stay
// in src/app/simulationSelectors.

import type {
  GermanRules,
  InsuranceTaxMode,
  PersonalProfile,
  ProductId,
  ProductResult,
  ScenarioAssumptions,
  SimulationResult,
} from '../domain'
import { afterTaxBavLumpSum, deriveBavLumpSumTaxMode } from '../engine/bavPayout'
import { afterTaxInvestmentCapital } from '../engine/etfPayout'
import { afterTaxInsuranceLumpSum, deriveInsuranceTaxMode } from '../engine/insurancePayout'
import { getProductMeta } from '../engine/productRegistry'

/**
 * Resolve the active scenario id, falling back to 'basis' when the user just
 * removed a custom row.
 */
export function resolveEffectiveScenarioId(
  assumptions: ScenarioAssumptions,
  selectedScenarioId: string,
): string {
  return assumptions.returnScenarios.some((s) => s.id === selectedScenarioId)
    ? selectedScenarioId
    : 'basis'
}

/**
 * Filter `simulation.products` to the user's `visibleProducts` set, then to the
 * active scenario, sorted by registry order. Returns the comparison-set rows
 * the Vergleich view binds against.
 */
export function deriveSelectedResults(
  simulation: SimulationResult,
  visibleProducts: readonly ProductId[],
  scenarioId: string,
): ProductResult[] {
  const visibleSet = new Set<ProductId>(visibleProducts)
  return simulation.products
    .filter((product) => product.scenarioId === scenarioId)
    .filter((product) => visibleSet.has(product.productId))
    .sort(
      (a, b) =>
        (getProductMeta(a.productId)?.order ?? 99) -
        (getProductMeta(b.productId)?.order ?? 99),
    )
}

/**
 * `simulation.products` filtered to the user's visibleProducts selection
 * (across all scenarios). Used by the detail-comparison table and CSV export.
 */
export function deriveVisibleProducts(
  simulation: SimulationResult,
  visibleProducts: readonly ProductId[],
): ProductResult[] {
  const visibleSet = new Set<ProductId>(visibleProducts)
  return simulation.products.filter((p) => visibleSet.has(p.productId))
}

/** Products from the comparison set whose lump-sum payout is comparable. */
export function deriveComparableCapitalResults(
  selectedResults: ProductResult[],
): Array<ProductResult & { afterTaxLumpSum: number }> {
  return selectedResults.filter(
    (result): result is ProductResult & { afterTaxLumpSum: number } =>
      result.afterTaxLumpSum !== null,
  )
}

/** Best after-tax-lump-sum product, if any. */
export function deriveBestCapital(
  selectedResults: ProductResult[],
): (ProductResult & { afterTaxLumpSum: number }) | undefined {
  const comparable = deriveComparableCapitalResults(selectedResults)
  return comparable.length
    ? comparable.reduce((best, r) => (r.afterTaxLumpSum > best.afterTaxLumpSum ? r : best))
    : undefined
}

/** Best net-monthly-payout product, if any. */
export function deriveBestPension(selectedResults: ProductResult[]): ProductResult | undefined {
  return selectedResults.length
    ? selectedResults.reduce((best, r) => (r.netMonthlyPayout > best.netMonthlyPayout ? r : best))
    : undefined
}

/** Aggregate of tax-mode plus year-of-payout for retirement-phase pipelines. */
export interface TaxModeContext {
  insurancePayoutYear: number
  insuranceContractRuntime: number
  insuranceTaxMode: InsuranceTaxMode
  kvdrMember: boolean
  bavLumpSumTaxMode: ReturnType<typeof deriveBavLumpSumTaxMode>
}

export function deriveTaxModes(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  rules: GermanRules,
): TaxModeContext {
  const insurancePayoutYear = rules.year + (profile.retirementAge - profile.age)
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
  return {
    insurancePayoutYear,
    insuranceContractRuntime,
    insuranceTaxMode,
    kvdrMember,
    bavLumpSumTaxMode,
  }
}

/**
 * Inputs for `deriveCashflowAfterTaxBalance`. Bundling them keeps the
 * call-site readable and lets the cashflow row-mapper stay a 3-arg closure.
 */
export interface CashflowAfterTaxInput {
  effectiveCashflowProductId: ProductId
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  rules: GermanRules
  simulation: SimulationResult
  taxModes: TaxModeContext
}

/**
 * Build a row-mapper that returns the after-tax balance for the cashflow
 * table's currently selected product. Returns null for products whose
 * accumulation balance has no comparable lump-sum semantics
 * (Altersvorsorgedepot, Basisrente, Riester).
 */
export function makeRowAfterTaxBalance(
  input: CashflowAfterTaxInput,
): (
  balance: number,
  cumulativeContributions: number,
  cumulativeVorabpauschale: number,
) => number | null {
  const { effectiveCashflowProductId, profile, assumptions, rules, simulation, taxModes } = input
  const { insurancePayoutYear, insuranceTaxMode, kvdrMember, bavLumpSumTaxMode } = taxModes
  return function rowAfterTaxBalance(
    balance: number,
    cumulativeContributions: number,
    cumulativeVorabpauschale: number,
  ): number | null {
    if (effectiveCashflowProductId === 'bav') {
      return afterTaxBavLumpSum(
        balance,
        profile,
        rules,
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
        rules,
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
      rules,
      otherAnnual,
      insurancePayoutYear,
      profile,
      kvdrMember,
      simulation.statutoryPension.grossMonthlyPension,
    )
  }
}
