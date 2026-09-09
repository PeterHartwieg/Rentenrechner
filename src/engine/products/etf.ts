import type { EtfProductResult, ReturnScenario } from '../../domain'
import type { EtfCalculationContext, SimulationContext } from '../simulationContext'
import { etfContextFrom } from '../simulationContext'
import { buildProductResult, zeroFeeModel } from '../buildResult'
import {
  afterTaxInvestmentCapital,
  etfPayoutSchedule,
} from '../etfPayout'
import {
  monthlyPayoutFromCapital,
} from '../payoutMath'
import { withMarketReturnPolicy } from '../marketReturns'

export const metadata = {
  id: 'etf' as const,
  label: 'ETF-Depot',
  shortLabel: 'ETF',
  color: '#2563eb',
  order: 0,
  lockedCapital: false,
  hasFees: true,
  hasEmployerContribution: false,
}

/**
 * ETF simulator over the narrow typed calculation context (issue #380).
 *
 * `EtfCalculationContext` is the closed set of inputs the ETF math consumes;
 * callers build it via `etfContextFrom` (compare mode, full
 * `SimulationContext`) or `buildEtfCalculationContext` (combine mode,
 * per-instance). The simulator reads no bAV funding and no unrelated-product
 * assumptions — the fair-comparison anchor is resolved by the caller.
 */
export function simulateEtf(ctx: EtfCalculationContext, scenario: ReturnScenario): EtfProductResult {
  const etfAssumptions = ctx.assumptions.etf
  return buildProductResult({
    productId: 'etf',
    label: metadata.label,
    scenario,
    profile: ctx.profile,
    rules: ctx.rules,
    assumptions: ctx.assumptions,
    monthlyUserCost: ctx.monthlyUserCost,
    monthlyProductContribution: ctx.monthlyUserCost,
    monthlyEmployerContribution: 0,
    fees: { ...zeroFeeModel, fundAssetFee: etfAssumptions.annualAssetFee },
    policy: withMarketReturnPolicy(ctx, scenario, {
      vorabpauschale: {
        partialExemption: etfAssumptions.equityPartialExemption,
        // Combine-mode shares the §20 Abs. 9 EStG allowance across ETF instances
        // per year — `simulatePortfolio` post-processes this. Compare-mode and
        // length-1 portfolios leave it undefined → full allowance per call.
        saverAllowanceOverride: ctx.saverAllowanceOverride,
      },
      contributionGrowth: etfAssumptions.annualContributionGrowthRate
        ? { annualRate: etfAssumptions.annualContributionGrowthRate }
        : undefined,
    }),
    buildPayout: ({ projection, payoutYears, payoutReturn }) => {
      const partialExemption = etfAssumptions.equityPartialExemption
      const grossMonthlyPayout = monthlyPayoutFromCapital(projection.capital, payoutReturn, payoutYears)
      // For the lump-sum, query the override at the first retirement year (the
      // liquidation year). Per-year scheduling for `etfPayoutSchedule` shifts
      // the index inside that helper.
      const yearsToRetirement = ctx.yearsToRetirement
      const lumpSumAllowance = ctx.saverAllowanceOverride
        ? ctx.saverAllowanceOverride(yearsToRetirement)
        : ctx.rules.capitalGains.saverAllowance
      const afterTaxLumpSum = afterTaxInvestmentCapital(
        projection.capital,
        projection.totalContributionsBeforeFees,
        ctx.rules,
        partialExemption,
        projection.cumulativeVorabpauschale,
        lumpSumAllowance,
      )
      // Payout-phase override: each retirement year-1..N maps to
      // `yearsToRetirement + (year-1)` in the unified schedule.
      const payoutAllowanceOverride = ctx.saverAllowanceOverride
        ? (payoutYearIndex: number) =>
            ctx.saverAllowanceOverride!(yearsToRetirement + payoutYearIndex)
        : undefined
      const etfPayoutRows = etfPayoutSchedule(
        projection.capital,
        projection.totalContributionsBeforeFees,
        projection.cumulativeVorabpauschale,
        grossMonthlyPayout,
        payoutYears,
        payoutReturn,
        ctx.profile.retirementAge,
        ctx.rules,
        partialExemption,
        payoutAllowanceOverride,
      )

      return {
        afterTaxLumpSum,
        grossMonthlyPayout,
        netMonthlyPayout: etfPayoutRows.length > 0
          ? etfPayoutRows[0].netMonthlyPayout
          : grossMonthlyPayout,
        etfPayoutRows,
        payoutEndAge: ctx.assumptions.retirementEndAge,
      }
    },
  })
}

/**
 * Registry / compare-mode entry: adapts the six-product `SimulationContext`
 * to the narrow ETF context. `PRODUCT_REGISTRY`, `simulateRetirementComparison`
 * and `runMonteCarlo` keep their `(SimulationContext, scenario)` signature —
 * Monte Carlo threads its shared `marketReturnPath` through the full context,
 * and the adapter forwards it (along with the bAV fair-comparison anchor and
 * any per-instance policy) into the narrow shape.
 */
export function simulate(ctx: SimulationContext, scenario: ReturnScenario): EtfProductResult {
  return simulateEtf(etfContextFrom(ctx), scenario)
}
