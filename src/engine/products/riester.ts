import type { RiesterProductResult, ReturnScenario } from '../../domain'
import type { SimulationContext } from '../simulationContext'
import {
  buildProductResult,
} from '../buildResult'
import {
  afterTaxRiesterLumpSum,
  calculateRiesterFunding,
  netRiesterPayout,
} from '../riester'
import { computeGrossMonthlyPayout } from '../payoutMath'
import { calculateLeibrenteBreakEvenAge } from '../productPayout'
import { withMarketReturnPolicy } from '../marketReturns'

export const metadata = {
  id: 'riester' as const,
  label: 'Riester-Rente',
  shortLabel: 'Riester',
  color: '#be185d',
  order: 5,
  lockedCapital: true,
  hasFees: true,
  hasEmployerContribution: false,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): RiesterProductResult {
  const { profile, assumptions, rules, riesterFunding, payoutYear, yearsToRetirement } = ctx
  const riester = assumptions.riester
  const guaranteePct = riester.capitalGuarantee.enabled
    ? riester.capitalGuarantee.floorPctOfContributions
    : 0

  // Total monthly contribution = user-entered Eigenbeitrag (actual out-of-pocket cash)
  // + state allowances + Günstigerprüfung tax refund flowing back into the contract.
  const totalMonthlyContribution =
    assumptions.riester.monthlyOwnContribution +
    riesterFunding.guenstigerpruefungBenefitAnnual / 12 +
    riesterFunding.totalAllowanceAnnual / 12
  const fundingForYear = (yearIndex: number) =>
    calculateRiesterFunding(
      rules,
      ctx.bavFunding.salaryWithBav,
      riester,
      profile,
      {
        contributionYear: rules.year + yearIndex,
        isFirstContributionYear:
          yearIndex === 0 && !riester.eligibility.careerStarterBonusUsed,
      },
    )
  const yearlySavings = Array.from({ length: yearsToRetirement }).reduce<number>(
    (sum, _, yearIndex) => {
      const funding = fundingForYear(yearIndex)
      return sum + funding.totalAllowanceAnnual + funding.guenstigerpruefungBenefitAnnual
    },
    0,
  )

  return buildProductResult({
    productId: 'riester',
    label: metadata.label,
    scenario,
    profile,
    rules,
    assumptions,
    monthlyUserCost: riesterFunding.monthlyNetCost,
    monthlyProductContribution: totalMonthlyContribution,
    monthlyEmployerContribution: 0,
    fees: riester.fees,
    guarantee:
      guaranteePct > 0
        ? {
            label: `${Math.round(guaranteePct * 100)}% Beitragsgarantie`,
            floorCapital: (projection) =>
              (projection.totalProductContributions + riester.existingCapital) * guaranteePct,
          }
        : undefined,
    policy: withMarketReturnPolicy(
      ctx,
      scenario,
      {
        ...(riester.existingCapital > 0
          ? { initialCapital: riester.existingCapital }
          : {}),
        yearlyContributions: (yearIndex) => {
          const funding = fundingForYear(yearIndex)
          return {
            monthlyUserCost: funding.monthlyNetCost,
            monthlyProductContribution:
              riester.monthlyOwnContribution +
              funding.guenstigerpruefungBenefitAnnual / 12 +
              funding.totalAllowanceAnnual / 12,
          }
        },
      },
    ),
    taxAndSvSavings: yearlySavings,
    buildPayout: ({ projection, payoutYears, payoutReturn }) => {
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
          ? afterTaxRiesterLumpSum(
              partialCapital,
              profile,
              rules,
              otherAnnual,
              payoutYear,
              ctx.grvGrossMonthlyPension,
            )
          : null,
        grossMonthlyPayout,
        netMonthlyPayout: netRiesterPayout(
          grossMonthlyPayout,
          profile,
          rules,
          riester.monthlyOtherRetirementIncome,
          payoutYear,
          ctx.grvGrossMonthlyPension,
          ctx.retirementHealthStatus,
        ),
        leibrenteBreakEvenAge: calculateLeibrenteBreakEvenAge(
          profile.retirementAge,
          projection.capital,
          grossMonthlyPayout,
          riester.payoutMode === 'leibrente',
        ),
        payoutEndAge:
          riester.payoutMode === 'leibrente'
            ? undefined
            : profile.retirementAge + riester.zeitrenteYears,
      }
    },
  })
}
