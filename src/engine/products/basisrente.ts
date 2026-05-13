import type { BasisrenteProductResult, ReturnScenario } from '../../domain'
import type { SimulationContext } from '../simulationContext'
import {
  buildProductResult,
} from '../buildResult'
import { netBasisrentePayoutFull } from '../basisrente'
import {
  calculateLeibrenteBreakEvenAge,
  computeFeeAdjustedGrossMonthlyPayout,
} from '../productPayout'
import { withMarketReturnPolicy } from '../marketReturns'

export const metadata = {
  id: 'basisrente' as const,
  label: 'Rürup-Rente (Basisrente)',
  shortLabel: 'Rürup',
  color: '#7c3aed',
  order: 3,
  lockedCapital: true,
  hasFees: true,
  hasEmployerContribution: false,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): BasisrenteProductResult {
  const { profile, assumptions, rules, basisrenteFunding, payoutYear } = ctx

  return buildProductResult({
    productId: 'basisrente',
    label: metadata.label,
    scenario,
    profile,
    rules,
    assumptions,
    monthlyUserCost: basisrenteFunding.monthlyNetCost,
    monthlyProductContribution: basisrenteFunding.monthlyGrossContribution,
    monthlyEmployerContribution: 0,
    fees: assumptions.basisrente.fees,
    taxAndSvSavings: basisrenteFunding.annualTaxSaving * ctx.yearsToRetirement,
    policy: withMarketReturnPolicy(ctx, scenario),
    buildPayout: ({ projection, payoutYears, payoutReturn }) => {
      const basisrente = assumptions.basisrente
      const grossMonthlyPayout = computeFeeAdjustedGrossMonthlyPayout(
        projection.capital,
        {
          mode: 'leibrente',
          rentenfaktor: basisrente.rentenfaktor,
          zeitrenteYears: 0,
          kapitalverzehrYears: payoutYears,
          payoutReturn,
        },
        basisrente.fees,
      )

      const basisrentePayout = netBasisrentePayoutFull(
        grossMonthlyPayout,
        profile,
        rules,
        basisrente.monthlyOtherRetirementIncome,
        payoutYear,
        ctx.retirementHealthStatus,
        ctx.grvGrossMonthlyPension,
      )
      return {
        afterTaxLumpSum: null,
        grossMonthlyPayout,
        netMonthlyPayout: basisrentePayout.netMonthly,
        kvPvMonthly: basisrentePayout.kvPvMonthly,
        leibrenteBreakEvenAge: calculateLeibrenteBreakEvenAge(
          profile.retirementAge,
          projection.capital,
          grossMonthlyPayout,
          true,
        ),
        payoutEndAge: undefined,
      }
    },
  })
}
