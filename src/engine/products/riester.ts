import type { RiesterProductResult, ReturnScenario } from '../../domain'
import type { SimulationContext } from '../simulationContext'
import {
  buildProductResult,
  calculateLeibrenteBreakEvenAge,
} from '../buildResult'
import {
  afterTaxRiesterLumpSum,
  netRiesterPayout,
} from '../riester'
import { computeGrossMonthlyPayout } from '../projections'

export const metadata = {
  id: 'riester' as const,
  label: 'Riester (Schicht 2, Altvertrag)',
  shortLabel: 'Riester',
  color: '#be185d',
  order: 5,
  lockedCapital: true,
  hasFees: true,
  hasEmployerContribution: false,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): RiesterProductResult {
  const { profile, assumptions, rules, riesterFunding, payoutYear } = ctx
  return buildProductResult({
    productId: 'riester',
    label: metadata.label,
    scenario,
    profile,
    rules,
    assumptions,
    monthlyUserCost: riesterFunding.monthlyNetCost,
    monthlyProductContribution:
      riesterFunding.monthlyOwnContribution + riesterFunding.totalAllowanceAnnual / 12,
    monthlyEmployerContribution: 0,
    fees: assumptions.riester.fees,
    initialCapital: assumptions.riester.existingCapital > 0
      ? assumptions.riester.existingCapital
      : undefined,
    taxAndSvSavings:
      (riesterFunding.totalAllowanceAnnual + riesterFunding.guenstigerpruefungBenefitAnnual) *
      ctx.yearsToRetirement,
    buildPayout: ({ projection, payoutYears, payoutReturn }) => {
      const riester = assumptions.riester
      const grossMonthlyPayout = computeGrossMonthlyPayout(projection.capital, {
        mode: riester.payoutMode,
        rentenfaktor: riester.rentenfaktor,
        zeitrenteYears: riester.zeitrenteYears,
        kapitalverzehrYears: payoutYears,
        payoutReturn,
      })
      const partialPct = Math.min(riester.partialCapitalPct, 0.30)
      const partialCapital = projection.capital * partialPct
      const otherAnnual = riester.monthlyOtherRetirementIncome * 12

      return {
        afterTaxLumpSum: partialPct > 0
          ? afterTaxRiesterLumpSum(partialCapital, profile, rules, otherAnnual, payoutYear)
          : null,
        grossMonthlyPayout,
        netMonthlyPayout: netRiesterPayout(
          grossMonthlyPayout,
          profile,
          rules,
          riester.monthlyOtherRetirementIncome,
          payoutYear,
        ),
        leibrenteBreakEvenAge: calculateLeibrenteBreakEvenAge(
          profile.retirementAge,
          projection.capital,
          grossMonthlyPayout,
          riester.payoutMode === 'leibrente',
        ),
      }
    },
  })
}
