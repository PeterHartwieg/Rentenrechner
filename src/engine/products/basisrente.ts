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
  const { profile, assumptions, rules, basisrenteFunding, bavFunding, payoutYear } = ctx

  const effectiveSavingRate = basisrenteFunding.monthlyGrossContribution > 0
    ? basisrenteFunding.monthlyTaxSaving / basisrenteFunding.monthlyGrossContribution
    : 0
  const normalizedGross = effectiveSavingRate < 1
    ? bavFunding.monthlyNetCost / (1 - effectiveSavingRate)
    : bavFunding.monthlyNetCost

  return buildProductResult({
    productId: 'basisrente',
    label: metadata.label,
    scenario,
    profile,
    rules,
    assumptions,
    monthlyUserCost: bavFunding.monthlyNetCost,
    monthlyProductContribution: normalizedGross,
    monthlyEmployerContribution: 0,
    fees: assumptions.basisrente.fees,
    taxAndSvSavings: basisrenteFunding.annualTaxSaving * ctx.yearsToRetirement,
    buildPayout: ({ projection, payoutYears, payoutReturn }) => {
      const basisrente = assumptions.basisrente
      const grossMonthlyPayout = applyPensionPayoutFee(
        computeGrossMonthlyPayout(projection.capital, {
          mode: 'leibrente',
          rentenfaktor: basisrente.rentenfaktor,
          zeitrenteYears: 0,
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
          basisrente.retirementHealthStatus,
        ),
        leibrenteBreakEvenAge: calculateLeibrenteBreakEvenAge(
          profile.retirementAge,
          projection.capital,
          grossMonthlyPayout,
          true,
        ),
      }
    },
  })
}
