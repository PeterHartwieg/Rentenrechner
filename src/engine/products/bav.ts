import type { BavProductResult, ReturnScenario } from '../../domain'
import type { SimulationContext } from '../simulationContext'
import {
  applyPensionPayoutFee,
  buildProductResult,
  calculateLeibrenteBreakEvenAge,
} from '../buildResult'
import {
  afterTaxBavLumpSum,
  computeGrossMonthlyPayout,
  netBavPayout,
} from '../projections'

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
    buildPayout: ({ projection, payoutYears, payoutReturn }) => {
      const bav = assumptions.bav
      const grossMonthlyPayout = applyPensionPayoutFee(
        computeGrossMonthlyPayout(projection.capital, {
          mode: bav.payoutMode,
          rentenfaktor: bav.rentenfaktor,
          zeitrenteYears: bav.zeitrenteYears,
          kapitalverzehrYears: payoutYears,
          payoutReturn,
        }),
        bav.fees,
      )
      const afterTaxLumpSum = afterTaxBavLumpSum(
        projection.capital,
        profile,
        rules,
        bav.monthlyOtherRetirementIncome * 12,
        bav.kvdrMember,
        payoutYear,
        bavLumpSumTaxMode,
      )
      let netMonthlyPayout = netBavPayout(
        grossMonthlyPayout,
        profile,
        rules,
        bav.monthlyOtherRetirementIncome,
        bav.kvdrMember,
        payoutYear,
      )
      if (bav.includeGrvReduction) {
        netMonthlyPayout = Math.max(0, netMonthlyPayout - bavFunding.estimatedMonthlyGrvReduction)
      }

      return {
        afterTaxLumpSum,
        grossMonthlyPayout,
        netMonthlyPayout,
        leibrenteBreakEvenAge: calculateLeibrenteBreakEvenAge(
          profile.retirementAge,
          projection.capital,
          grossMonthlyPayout,
          bav.payoutMode === 'leibrente',
        ),
      }
    },
  })
}
