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
  return buildProductResult({
    productId: 'etf',
    label: metadata.label,
    scenario,
    profile: ctx.profile,
    rules: ctx.rules,
    assumptions: ctx.assumptions,
    monthlyUserCost: ctx.bavFunding.monthlyNetCost,
    monthlyProductContribution: ctx.bavFunding.monthlyNetCost,
    monthlyEmployerContribution: 0,
    fees: { ...zeroFeeModel, fundAssetFee: ctx.assumptions.etf.annualAssetFee },
    policy: {
      vorabpauschale: { partialExemption: ctx.assumptions.etf.equityPartialExemption },
    },
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
