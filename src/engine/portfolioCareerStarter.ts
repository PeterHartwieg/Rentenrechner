import type { GermanRules, PersonalProfile, SalaryResult, AltersvorsorgedepotAssumptions, RiesterAssumptions } from '../domain'
import type { AltersvorsorgedepotInstance, RiesterInstance } from '../domain/instances'
import { calculateAvdFunding } from './altersvorsorgedepot'
import { calculateRiesterFunding } from './riester'
import { stripInstanceCommonKeys } from './portfolioProjection'

/** Shared contribution-dependent allocation; historical usage remains an input. */
export function selectPortfolioCareerStarterRecipient(
  activeAvd: AltersvorsorgedepotInstance[], activeRiester: RiesterInstance[],
  careerStarterBonusAlreadyUsed: boolean, profile: PersonalProfile,
  salaryAfterBasisrenteDeduction: SalaryResult, rules: GermanRules,
): string | undefined {
  const householdRiesterOwnMonthly = activeRiester.filter(instance => instance.ownedBy !== 'partner' && instance.fundingEligible !== false && instance.eligibility.directlyEligible).reduce(
    (sum, instance) => sum + instance.monthlyOwnContribution,
    0,
  )
  const careerStarterCandidates = careerStarterBonusAlreadyUsed
    ? []
    : [
        ...activeAvd
          .map((instance) => {
            const singleton = stripInstanceCommonKeys(
              instance as unknown as Record<string, unknown>,
            ) as unknown as AltersvorsorgedepotAssumptions
            const withBonus = calculateAvdFunding(
              rules,
              salaryAfterBasisrenteDeduction,
              singleton,
              {
                profile,
                contributionYear: rules.year,
                isFirstContributionYear: true,
              },
            )
            const withoutBonus = calculateAvdFunding(
              rules,
              salaryAfterBasisrenteDeduction,
              singleton,
              {
                profile,
                contributionYear: rules.year,
                isFirstContributionYear: false,
              },
            )
            return {
              instanceId: instance.instanceId,
              contractStartYear: instance.contractStartYear,
              paying: instance.monthlyOwnContribution > 0 ? 1 : 0,
              allowanceClaimAnnual: withBonus.totalAllowanceAnnual,
              careerStarterBonusAnnual: withBonus.careerStarterBonusAnnual,
              realisedBenefitAnnual:
                withBonus.totalContractContributionAnnual +
                withBonus.guenstigerpruefungBenefitAnnual -
                withoutBonus.totalContractContributionAnnual -
                withoutBonus.guenstigerpruefungBenefitAnnual,
            }
          })
          .filter(
            (candidate) =>
              candidate.careerStarterBonusAnnual > 0 &&
              candidate.realisedBenefitAnnual >= 0,
          ),
        ...activeRiester.filter(instance => instance.ownedBy !== 'partner' && instance.fundingEligible !== false && instance.eligibility.directlyEligible)
          .map((instance) => {
            const singleton = stripInstanceCommonKeys(
              instance as unknown as Record<string, unknown>,
            ) as unknown as RiesterAssumptions
            const withBonus = calculateRiesterFunding(
              rules,
              salaryAfterBasisrenteDeduction,
              {
                ...singleton,
                monthlyOwnContribution: householdRiesterOwnMonthly,
              },
              profile,
              {
                contributionYear: rules.year,
                isFirstContributionYear: true,
              },
            )
            const withoutBonus = calculateRiesterFunding(
              rules,
              salaryAfterBasisrenteDeduction,
              {
                ...singleton,
                monthlyOwnContribution: householdRiesterOwnMonthly,
              },
              profile,
              {
                contributionYear: rules.year,
                isFirstContributionYear: false,
              },
            )
            return {
              instanceId: instance.instanceId,
              contractStartYear: instance.contractStartYear,
              paying: instance.monthlyOwnContribution > 0 ? 1 : 0,
              allowanceClaimAnnual: withBonus.totalAllowanceAnnual,
              careerStarterBonusAnnual: withBonus.careerStarterBonusAnnual,
              realisedBenefitAnnual:
                withBonus.annualOwnContribution +
                withBonus.totalAllowanceAnnual +
                withBonus.guenstigerpruefungBenefitAnnual -
                withoutBonus.annualOwnContribution -
                withoutBonus.totalAllowanceAnnual -
                withoutBonus.guenstigerpruefungBenefitAnnual,
            }
          })
          .filter(
            (candidate) =>
              candidate.careerStarterBonusAnnual > 0 &&
              candidate.realisedBenefitAnnual >= 0,
          ),
      ].sort(
        (left, right) =>
          right.realisedBenefitAnnual - left.realisedBenefitAnnual ||
          right.allowanceClaimAnnual - left.allowanceClaimAnnual ||
          // Riester candidates share the pooled contribution, so an empty and a
          // paying contract tie above. Follow the allowance destination (R2-2).
          // This key also orders an AVD candidate against a Riester candidate
          // when both claims tie; equal benefit and claim leave amounts unchanged.
          right.paying - left.paying ||
          left.contractStartYear - right.contractStartYear ||
          left.instanceId.localeCompare(right.instanceId),
      )
  return careerStarterCandidates[0]?.instanceId
}
