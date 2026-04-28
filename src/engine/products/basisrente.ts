import type { BasisrenteProductResult, ReturnScenario } from '../../domain'
import type { SimulationContext } from '../simulationContext'
import {
  applyPensionPayoutFee,
  buildProductResult,
  calculateLeibrenteBreakEvenAge,
} from '../buildResult'
import { netBasisrentePayout } from '../basisrente'
import { computeGrossMonthlyPayout } from '../projections'

export const metadata = {
  id: 'basisrente' as const,
  label: 'Basisrente (Rürup, Schicht 1)',
  shortLabel: 'Basisrente',
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
    buildPayout: ({ projection, payoutYears, payoutReturn }) => {
      const basisrente = assumptions.basisrente
      const grossMonthlyPayout = applyPensionPayoutFee(
        computeGrossMonthlyPayout(projection.capital, {
          mode: basisrente.payoutMode,
          rentenfaktor: basisrente.rentenfaktor,
          zeitrenteYears: basisrente.zeitrenteYears,
          kapitalverzehrYears: payoutYears,
          payoutReturn,
        }),
        basisrente.fees,
      )

      return {
        afterTaxLumpSum: null,
        grossMonthlyPayout,
        netMonthlyPayout: netBasisrentePayout(
          grossMonthlyPayout,
          profile,
          rules,
          basisrente.monthlyOtherRetirementIncome,
          payoutYear,
        ),
        leibrenteBreakEvenAge: calculateLeibrenteBreakEvenAge(
          profile.retirementAge,
          projection.capital,
          grossMonthlyPayout,
          basisrente.payoutMode === 'leibrente',
        ),
      }
    },
  })
}
