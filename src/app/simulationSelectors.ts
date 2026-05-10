// Pure, framework-agnostic selectors derived from simulation results.
//
// These functions are intentionally React-free so they can be unit-tested
// without hooks and reused by both the live `useSimulationViewModel` facade and
// any future per-instance derived views (Group G). They must NOT introduce
// rounding — display rounding stays at the formatter boundary.
//
// The subset consumed by src/api/ and src/engine/ lives in src/utils/simulationSelectors
// to avoid upward app-layer imports from those layers. This file re-exports that
// subset and adds UI-only selectors (chart data, Rentenlücke) on top.

export {
  resolveEffectiveScenarioId,
  deriveSelectedResults,
  deriveVisibleProducts,
  deriveComparableCapitalResults,
  deriveBestCapital,
  deriveBestPension,
  deriveTaxModes,
  makeRowAfterTaxBalance,
  type TaxModeContext,
  type CashflowAfterTaxInput,
} from '../utils/simulationSelectors'

import type {
  InsuranceProductResult,
  PersonalProfile,
  ProductId,
  ProductResult,
  SimulationResult,
} from '../domain'
import type { Workspace } from '../domain/workspace'
import type { InstanceCommon } from '../domain/instances'
import type { CombinedResult } from '../engine/portfolioCombine'
import { GRV_COLOR, getProductMeta } from './productPresentation'

// ---------------------------------------------------------------------------
// Rentenlücke constants
// ---------------------------------------------------------------------------

/**
 * Default replacement ratio used when the user has not set
 * `profile.desiredNetMonthlyPension`. The Vergleich dashboard derives the
 * target on-the-fly as `(grossSalaryYear / 12) * RENTENLUCKE_DEFAULT_REPLACEMENT_RATIO`
 * so existing scenarios still show a meaningful gap without requiring migration.
 */
export const RENTENLUCKE_DEFAULT_REPLACEMENT_RATIO = 0.7

/**
 * Resolve the target monthly net retirement income.
 *
 * Returns `{ value, isUserSet }` so callers can render a hint when the value
 * is derived from salary rather than user-overridden. When neither is
 * available (no salary, no override), returns 0 / `isUserSet=false`.
 */
export function resolveTargetMonthlyRetirementIncome(
  profile: PersonalProfile,
): { value: number; isUserSet: boolean } {
  const userSet = profile.desiredNetMonthlyPension
  if (userSet !== undefined && userSet > 0) {
    return { value: userSet, isUserSet: true }
  }
  const grossMonthly = profile.grossSalaryYear / 12
  const fallback = grossMonthly * RENTENLUCKE_DEFAULT_REPLACEMENT_RATIO
  return { value: Math.max(0, fallback), isUserSet: false }
}

// ---------------------------------------------------------------------------
// Chart + cashflow selectors (UI-facing, depend on GRV_COLOR / getProductMeta)
// ---------------------------------------------------------------------------

/**
 * Build the {age, year, [productLabel]: balance} rows the capital chart binds
 * to. When `showRealValues` is true, the per-product values are inflation-
 * adjusted balances; otherwise nominal balances.
 */
export function buildCapitalChartData(
  selectedResults: ProductResult[],
  showRealValues: boolean,
): Array<Record<string, string | number>> | undefined {
  return selectedResults[0]?.rows.map((row) => {
    const point: Record<string, string | number> = { age: row.age, year: row.year }
    selectedResults.forEach((result) => {
      const matchingRow = result.rows.find((candidate) => candidate.year === row.year)
      point[result.label] = showRealValues
        ? matchingRow?.realBalance ?? 0
        : matchingRow?.balance ?? 0
    })
    return point
  })
}

/**
 * GRV bar plus one bar per visible private product, in registry order.
 */
export function buildPensionBars(
  simulation: SimulationResult,
  selectedResults: ProductResult[],
): Array<{ name: string; shortName: string; value: number; fill: string }> {
  return [
    {
      name: 'Gesetzl. Rente',
      shortName: 'GRV',
      value: simulation.statutoryPension.netMonthlyPension,
      fill: GRV_COLOR,
    },
    ...selectedResults.map((result) => ({
      name: result.label,
      shortName: getProductMeta(result.productId)?.shortLabel ?? result.label,
      value: result.netMonthlyPayout,
      fill: getProductMeta(result.productId)?.color ?? '#888888',
    })),
  ]
}

/**
 * Cashflow-table product binding. Falls back to the first selected product when
 * the user-chosen `cashflowProductId` is no longer in the comparison set.
 */
export function deriveCashflowBinding(
  selectedResults: ProductResult[],
  cashflowProductId: ProductId,
  simulation: SimulationResult,
): {
  cashflowResult: ProductResult | undefined
  effectiveCashflowProductId: ProductId
  cashflowAnnualTaxSvSavings: number
  insuranceResult: InsuranceProductResult | undefined
} {
  const cashflowResult =
    selectedResults.find((r) => r.productId === cashflowProductId) ?? selectedResults[0]
  const effectiveCashflowProductId = cashflowResult?.productId ?? cashflowProductId
  const insuranceResult = selectedResults.find(
    (r): r is InsuranceProductResult => r.productId === 'versicherung',
  )
  const cashflowAnnualTaxSvSavings =
    effectiveCashflowProductId === 'bav' ? simulation.bavFunding.annualTaxAndSvSavings : 0
  return {
    cashflowResult,
    effectiveCashflowProductId,
    cashflowAnnualTaxSvSavings,
    insuranceResult,
  }
}

// ---------------------------------------------------------------------------
// Rentenlücke selectors
// ---------------------------------------------------------------------------

/**
 * Aggregate net monthly retirement income across the comparison set.
 *
 * GRV's `netMonthlyPension` plus each visible product's `netMonthlyPayout`.
 * This is the same data the per-product `PensionChart` consumes — no parallel
 * calculation path is introduced.
 */
export interface RentenluckeOverview {
  /** Net monthly GRV pension. */
  grvNet: number
  /**
   * Per-source breakdown. In compare-mode (`deriveRentenluckeOverview`) ids are
   * `ProductId` literals; in combine-mode (`deriveRentenluckeOverviewFromCombine`)
   * ids are workspace `instanceId`s so multiple instances of the same product
   * appear as separate rows.
   */
  productBreakdown: Array<{ id: string; label: string; value: number; color: string }>
  /** Sum of GRV + all product net monthly payouts. */
  projectedTotal: number
  /** Target monthly net retirement income (user-set or salary-derived). */
  target: number
  /** True when target comes from `profile.desiredNetMonthlyPension`. */
  targetIsUserSet: boolean
  /** Positive gap when projection falls short of the target; 0 when the goal is reached. */
  gap: number
  /** True when projectedTotal >= target. */
  goalReached: boolean
}

export function deriveRentenluckeOverview(
  simulation: SimulationResult,
  selectedResults: ProductResult[],
  profile: PersonalProfile,
): RentenluckeOverview {
  const grvNet = simulation.statutoryPension.netMonthlyPension
  const productBreakdown = selectedResults.map((result) => ({
    id: result.productId as string,
    label: result.label,
    value: result.netMonthlyPayout,
    color: getProductMeta(result.productId)?.color ?? '#888888',
  }))
  return assembleOverview(grvNet, productBreakdown, profile)
}

/**
 * Combine-mode variant: build a Rentenlücke overview from the user's actual
 * portfolio rather than a head-to-head product comparison.
 *
 * Iterates every workspace instance (skipping `surrendered` and `offered`), pulls the
 * back-allocated `monthlyNet` from `combinedResult.byInstance[instanceId]`, and
 * keys each row by `instanceId` so two instances of the same product (e.g. two
 * ETF Sparpläne) render as separate segments instead of collapsing.
 *
 * `combinedResult.statutoryPensionMonthlyNet` already includes the GRV
 * contribution to the back-allocated pipeline; passing it directly avoids
 * double-counting against `byInstance` totals.
 */
export function deriveRentenluckeOverviewFromCombine(
  workspace: Workspace,
  combinedResult: CombinedResult,
  profile: PersonalProfile,
): RentenluckeOverview {
  const wsa = workspace.baseline.assumptions
  const productSlots: Array<{ id: ProductId; instances: { instanceId: string; label: string; status: InstanceCommon['status'] }[] }> = [
    { id: 'bav', instances: wsa.bav },
    { id: 'etf', instances: wsa.etf },
    { id: 'versicherung', instances: wsa.insurance },
    { id: 'basisrente', instances: wsa.basisrente },
    { id: 'altersvorsorgedepot', instances: wsa.altersvorsorgedepot },
    { id: 'riester', instances: wsa.riester },
  ]
  const productBreakdown: RentenluckeOverview['productBreakdown'] = []
  for (const slot of productSlots) {
    const meta = getProductMeta(slot.id)
    for (const inst of slot.instances) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue
      const share = combinedResult.byInstance[inst.instanceId]
      if (!share) continue
      const label = inst.label?.trim().length ? inst.label : (meta?.label ?? slot.id)
      productBreakdown.push({
        id: inst.instanceId,
        label,
        value: share.monthlyNet,
        color: meta?.color ?? '#888888',
      })
    }
  }
  return assembleOverview(combinedResult.statutoryPensionMonthlyNet, productBreakdown, profile)
}

function assembleOverview(
  grvNet: number,
  productBreakdown: RentenluckeOverview['productBreakdown'],
  profile: PersonalProfile,
): RentenluckeOverview {
  const projectedTotal =
    grvNet + productBreakdown.reduce((sum, entry) => sum + entry.value, 0)
  const { value: target, isUserSet: targetIsUserSet } =
    resolveTargetMonthlyRetirementIncome(profile)
  const gap = Math.max(0, target - projectedTotal)
  const goalReached = target > 0 && projectedTotal >= target
  return {
    grvNet,
    productBreakdown,
    projectedTotal,
    target,
    targetIsUserSet,
    gap,
    goalReached,
  }
}
