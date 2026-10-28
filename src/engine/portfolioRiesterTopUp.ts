import type { GermanRules } from '../domain'
import type { PortfolioFunding } from '../domain/workspace'
import { selectPortfolioCareerStarterRecipient } from './portfolioCareerStarter'
import { calculateRiesterHouseholdFunding } from './riesterHousehold'
import { calculateAvdFunding } from './altersvorsorgedepot'

/** Recompute only contribution-dependent funding, retaining prepared payroll. */
export function evaluateRiesterTopUp(
  context: NonNullable<PortfolioFunding['riesterFundingContext']>, rules: GermanRules,
  targetId: string, additionalMonthly: number,
  options: { includeAvdFunding?: boolean } = {},
) {
  const activeRiester = context.activeRiester.map(contract => contract.instanceId === targetId
    ? { ...contract, monthlyOwnContribution: contract.monthlyOwnContribution + additionalMonthly }
    : contract)
  const recipient = selectPortfolioCareerStarterRecipient(context.activeAvd, activeRiester,
    context.careerStarterBonusAlreadyUsed, context.people.self.profile,
    context.salaryAfterBasisrenteDeduction, rules)
  const entries = context.entries.map(entry => {
    const raw = activeRiester.find(contract => contract.instanceId === entry.instanceId)!
    return { ...entry, contract: { ...entry.contract, monthlyOwnContribution: raw.monthlyOwnContribution,
      eligibility: entry.ownedBy === 'partner' ? entry.contract.eligibility : {
        ...raw.eligibility, careerStarterBonusUsed: raw.eligibility.careerStarterBonusUsed || entry.instanceId !== recipient,
      } } }
  })
  const riester = calculateRiesterHouseholdFunding(entries, context.people, rules,
    { jointTaxableIncome: context.jointTaxableIncome })
  // Headroom needs allocation effects on Riester, but not the competing AVD rows.
  const avd = Object.fromEntries((options.includeAvdFunding === false ? [] : context.activeAvd).map(contract => [contract.instanceId,
    calculateAvdFunding(rules, context.salaryAfterBasisrenteDeduction, {
      ...contract, eligibility: { ...contract.eligibility,
        careerStarterBonusUsed: contract.eligibility.careerStarterBonusUsed || contract.instanceId !== recipient },
    }, { profile: context.people.self.profile, contributionYear: rules.year, isFirstContributionYear: true }),
  ]))
  return { riester, avd }
}
