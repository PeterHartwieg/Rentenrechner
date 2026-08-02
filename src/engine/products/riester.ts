import type { RiesterProductResult, ReturnScenario } from '../../domain'
import {
  guaranteePrincipalAfterTransfers,
  type SimulationContext,
} from '../simulationContext'
import {
  buildProductResult,
} from '../buildResult'
import {
  allocateRiesterHouseholdFunding,
  afterTaxRiesterLumpSum,
  calculateRiesterFunding,
} from '../riester'
import { netCertifiedPensionPayoutFull } from '../certifiedPensionPayout'
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

  // In combine mode the funding override carries a scaled (capped) own contribution.
  // Use `riesterFunding.monthlyOwnContribution` rather than reading the raw assumption
  // directly so the accumulation loop respects the household §10a cap apportionment
  // computed by `portfolioFunding.ts`.  In compare mode (no override) the two values
  // are identical, so this change is backwards-compatible.
  const effectiveMonthlyOwnContribution = riesterFunding.monthlyOwnContribution

  // Build a patched assumption object that carries the capped contribution so
  // `fundingForYear` re-runs produce per-year allowances and Günstigerprüfung
  // on the correct (scaled) base — not the raw instance value.
  const scaledRiester: typeof riester = effectiveMonthlyOwnContribution === riester.monthlyOwnContribution
    ? riester
    : { ...riester, monthlyOwnContribution: effectiveMonthlyOwnContribution }

  // Total monthly contribution = portfolio-capped Eigenbeitrag
  // + state allowances + Günstigerprüfung tax refund flowing back into the contract.
  const totalMonthlyContribution =
    effectiveMonthlyOwnContribution +
    riesterFunding.guenstigerpruefungBenefitAnnual / 12 +
    riesterFunding.totalAllowanceAnnual / 12
  const yearlyFundingCache = new Map<number, ReturnType<typeof calculateRiesterFunding>>()
  const calculateFundingForYear = (yearIndex: number) => {
    const receivesPortfolioAllowance = riesterFunding.receivesPortfolioAllowance
    if (receivesPortfolioAllowance === undefined) {
      return calculateRiesterFunding(
        rules,
        ctx.salaryForOtherFunding,
        scaledRiester,
        profile,
        {
          contributionYear: rules.year + yearIndex,
          isFirstContributionYear:
            yearIndex === 0 && !riester.eligibility.careerStarterBonusUsed,
        },
      )
    }

    const householdEligibility =
      riesterFunding.portfolioHouseholdEligibility ?? scaledRiester.eligibility
    const requestedHouseholdOwnMonthly =
      riesterFunding.portfolioHouseholdRequestedOwnContributionMonthly ??
      riesterFunding.portfolioHouseholdOwnContributionMonthly ??
      effectiveMonthlyOwnContribution
    const requestedOwnMonthly =
      riesterFunding.portfolioRequestedOwnContributionMonthly ??
      effectiveMonthlyOwnContribution
    const portfolioTaxBenefitShare = riesterFunding.portfolioTaxBenefitShare ?? 1
    const householdOptions = {
      contributionYear: rules.year + yearIndex,
      isFirstContributionYear:
        yearIndex === 0 && !householdEligibility.careerStarterBonusUsed,
    }
    const calculateHousehold = (monthlyOwnContribution: number) =>
      calculateRiesterFunding(
        rules,
        ctx.salaryForOtherFunding,
        {
          ...scaledRiester,
          eligibility: householdEligibility,
          monthlyOwnContribution,
        },
        profile,
        householdOptions,
      )

    let yearlyScale = 1
    const requestedHouseholdFunding = calculateHousehold(requestedHouseholdOwnMonthly)
    if (
      requestedHouseholdOwnMonthly * 12 +
        requestedHouseholdFunding.totalAllowanceAnnual >
      rules.riester.annualCapInclAllowances
    ) {
      let lo = 0
      let hi = 1
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2
        const householdOwnMonthly = requestedHouseholdOwnMonthly * mid
        const funding = calculateHousehold(householdOwnMonthly)
        const acceptedAnnual =
          householdOwnMonthly * 12 + funding.totalAllowanceAnnual
        if (acceptedAnnual <= rules.riester.annualCapInclAllowances) {
          lo = mid
          if (rules.riester.annualCapInclAllowances - acceptedAnnual < 0.001) break
        } else hi = mid
      }
      yearlyScale = lo
    }

    const yearlyHouseholdOwnMonthly = requestedHouseholdOwnMonthly * yearlyScale
    const yearlyOwnMonthly = requestedOwnMonthly * yearlyScale
    const householdFunding = yearlyScale === 1
      ? requestedHouseholdFunding
      : calculateHousehold(yearlyHouseholdOwnMonthly)
    const ownFunding = calculateRiesterFunding(
      rules,
      ctx.salaryForOtherFunding,
      { ...scaledRiester, monthlyOwnContribution: yearlyOwnMonthly },
      profile,
      {
        contributionYear: rules.year + yearIndex,
        isFirstContributionYear:
          yearIndex === 0 && !scaledRiester.eligibility.careerStarterBonusUsed,
      },
    )
    return allocateRiesterHouseholdFunding(
      ownFunding,
      householdFunding,
      receivesPortfolioAllowance,
      portfolioTaxBenefitShare,
    )
  }
  const fundingForYear = (yearIndex: number) => {
    const cached = yearlyFundingCache.get(yearIndex)
    if (cached) return cached
    const funding = calculateFundingForYear(yearIndex)
    yearlyFundingCache.set(yearIndex, funding)
    return funding
  }
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
              guaranteePrincipalAfterTransfers(
                projection.totalProductContributions + riester.existingCapital,
                ctx.instanceCapitalPolicy,
              ) * guaranteePct,
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
              funding.monthlyOwnContribution +
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

      const riesterPayout = netCertifiedPensionPayoutFull(
        grossMonthlyPayout,
        profile,
        rules,
        riester.monthlyOtherRetirementIncome,
        payoutYear,
        ctx.grvGrossMonthlyPension,
        ctx.retirementHealthStatus,
      )
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
        netMonthlyPayout: riesterPayout.netMonthly,
        kvPvMonthly: riesterPayout.kvPvMonthly,
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
