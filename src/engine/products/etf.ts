import type { EtfProductResult, ReturnScenario } from '../../domain'
import type { SimulationContext } from '../simulationContext'
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

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): EtfProductResult {
  // Combine-mode (`simulatePortfolio`) sets `etfMonthlyUserCostOverride` per
  // instance so each ETF contract honors its own `monthlyContribution`.
  // Compare-mode leaves this undefined → fair-comparison invariant: ETF
  // invests `bavFunding.monthlyNetCost` (see CLAUDE.md "Non-obvious architecture").
  const etfMonthly = ctx.etfMonthlyUserCostOverride ?? ctx.bavFunding.monthlyNetCost
  return buildProductResult({
    productId: 'etf',
    label: metadata.label,
    scenario,
    profile: ctx.profile,
    rules: ctx.rules,
    assumptions: ctx.assumptions,
    monthlyUserCost: etfMonthly,
    monthlyProductContribution: etfMonthly,
    monthlyEmployerContribution: 0,
    fees: { ...zeroFeeModel, fundAssetFee: ctx.assumptions.etf.annualAssetFee },
    policy: withMarketReturnPolicy(ctx, scenario, {
      vorabpauschale: { partialExemption: ctx.assumptions.etf.equityPartialExemption },
      contributionGrowth: ctx.assumptions.etf.annualContributionGrowthRate
        ? { annualRate: ctx.assumptions.etf.annualContributionGrowthRate }
        : undefined,
    }),
    buildPayout: ({ projection, payoutYears, payoutReturn }) => {
      const partialExemption = ctx.assumptions.etf.equityPartialExemption
      const grossMonthlyPayout = monthlyPayoutFromCapital(projection.capital, payoutReturn, payoutYears)
      const afterTaxLumpSum = afterTaxInvestmentCapital(
        projection.capital,
        projection.totalContributionsBeforeFees,
        ctx.rules,
        partialExemption,
        projection.cumulativeVorabpauschale,
      )
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
