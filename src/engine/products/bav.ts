import type { BavProductResult, ReturnScenario } from '../../domain'
import type { SimulationContext } from '../simulationContext'
import {
  buildProductResult,
} from '../buildResult'
import {
  bavLumpSumBreakdown,
  netBavPayoutFull,
} from '../bavPayout'
import {
  calculateLeibrenteBreakEvenAge,
  computeFeeAdjustedGrossMonthlyPayout,
} from '../productPayout'
import { withMarketReturnPolicy } from '../marketReturns'

export const metadata = {
  id: 'bav' as const,
  label: 'Betriebliche Altersvorsorge (bAV)',
  shortLabel: 'bAV',
  color: '#0f766e',
  order: 1,
  lockedCapital: true,
  hasFees: true,
  hasEmployerContribution: true,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): BavProductResult {
  const { profile, assumptions, rules, bavFunding, bavLumpSumTaxMode, payoutYear } = ctx
  return buildProductResult({
    productId: 'bav',
    label: metadata.label,
    scenario,
    profile,
    rules,
    assumptions,
    monthlyUserCost: bavFunding.monthlyNetCost,
    monthlyProductContribution:
      bavFunding.monthlyGrossConversion + bavFunding.monthlyEmployerContribution,
    monthlyEmployerContribution: bavFunding.monthlyEmployerContribution,
    fees: assumptions.bav.fees,
    taxAndSvSavings: bavFunding.annualTaxAndSvSavings * ctx.yearsToRetirement,
    policy: withMarketReturnPolicy(
      ctx,
      scenario,
      assumptions.bav.annualContributionGrowthRate
        ? { contributionGrowth: { annualRate: assumptions.bav.annualContributionGrowthRate } }
        : undefined,
    ),
    buildPayout: ({ projection, payoutYears, payoutReturn }) => {
      const bav = assumptions.bav
      const grossMonthlyPayout = computeFeeAdjustedGrossMonthlyPayout(
        projection.capital,
        {
          mode: bav.payoutMode,
          rentenfaktor: bav.rentenfaktor,
          zeitrenteYears: bav.zeitrenteYears,
          kapitalverzehrYears: payoutYears,
          payoutReturn,
        },
        bav.fees,
      )
      const lumpSum = bavLumpSumBreakdown(
        projection.capital,
        profile,
        rules,
        bav.monthlyOtherRetirementIncome * 12,
        bav.kvdrMember,
        payoutYear,
        bavLumpSumTaxMode,
        ctx.grvGrossMonthlyPension,
      )
      const bavPayout = netBavPayoutFull(
        grossMonthlyPayout,
        profile,
        rules,
        bav.monthlyOtherRetirementIncome,
        bav.kvdrMember,
        payoutYear,
        ctx.grvGrossMonthlyPension,
      )
      let netMonthlyPayout = bavPayout.netMonthly
      if (bav.includeGrvReduction) {
        netMonthlyPayout = Math.max(0, netMonthlyPayout - bavFunding.estimatedMonthlyGrvReduction)
      }

      return {
        afterTaxLumpSum: lumpSum.net,
        lumpSumDeductions: { incomeTax: lumpSum.incomeTax, kvPv: lumpSum.kvPv },
        grossMonthlyPayout,
        netMonthlyPayout,
        kvPvMonthly: bavPayout.kvPvMonthly,
        leibrenteBreakEvenAge: calculateLeibrenteBreakEvenAge(
          profile.retirementAge,
          projection.capital,
          grossMonthlyPayout,
          bav.payoutMode === 'leibrente',
        ),
        payoutEndAge:
          bav.payoutMode === 'leibrente'
            ? undefined
            : bav.payoutMode === 'zeitrente'
              ? profile.retirementAge + bav.zeitrenteYears
              : assumptions.retirementEndAge,
      }
    },
  })
}
