import type { GermanRules, PersonalProfile, RiesterAssumptions, RiesterFundingResult, SalaryResult } from '../domain'
import { calculateRiesterIndividualFunding, computeFullRiesterAllowances } from './riester'
import { calculateSalaryPhaseTaxDelta } from './salaryPhaseFunding'
import { childBirthYearsUnder25InYear } from './childEligibility'
import { activeRules } from '../rules'
import type { Scenario } from '../domain/workspace'

/** Do not resolve contradictory person facts by choosing one contract. */
export function riesterHouseholdInputIssues(scenario: Scenario, contributionYear = activeRules.year): string[] {
  const allActive = scenario.assumptions.riester.filter(r => r.status === 'active')
  const entries = allActive.filter(r => r.fundingEligible !== false)
  const issues: string[] = []
  if (entries.some(r => r.ownedBy === 'partner') && !scenario.partner) {
    issues.push('Riester: Für den Partnervertrag fehlen die Angaben zur zweiten Person im Haushalt.')
  }
  for (const owner of ['self', 'partner']) {
    const owned = entries.filter(r => (r.ownedBy ?? 'self') === owner)
    const kinds = new Set(owned.map(r => r.eligibility.directlyEligible ? 'direct' : r.eligibility.indirectSpouseEligible ? 'indirect' : 'none'))
    const incomes = new Set(owned.map(r => r.eligibility.priorYearRelevantIncome).filter(v => v !== undefined))
    if (kinds.size > 1 || incomes.size > 1) issues.push('Riester: Förderberechtigung und Vorjahreseinkommen müssen für alle Verträge derselben Person übereinstimmen. Die Förderfähigkeit des Vertrags ist separat einstellbar.')
  }
  if (childBirthYearsUnder25InYear(scenario.profile.childBirthYears, contributionYear).length > 0 && new Set(entries.filter(r =>
    r.fundingEligible !== false && r.eligibility.claimsChildAllowance !== false &&
    (r.eligibility.directlyEligible || r.eligibility.indirectSpouseEligible)).map(r => r.ownedBy ?? 'self')).size > 1) {
    issues.push('Riester: Die Kinderzulagen sind beiden Personen zugeordnet. Bitte nur bei der empfangenden Person aktivieren.')
  }
  if (entries.some(r => r.eligibility.indirectSpouseEligible && !r.eligibility.directlyEligible &&
    !allActive.some(other => (other.ownedBy ?? 'self') !== (r.ownedBy ?? 'self') && other.eligibility.directlyEligible))) {
    issues.push('Riester: Für die mittelbare Berechtigung fehlen der Vertrag und die Beiträge der unmittelbar berechtigten Person.')
  }
  return issues
}

type Owner = 'self' | 'partner'
export interface RiesterFundingEntry {
  instanceId: string
  ownedBy?: Owner
  contract: RiesterAssumptions
}
export interface RiesterFundingPerson {
  profile: PersonalProfile
  salary: SalaryResult
}

/** Legacy law only: §10a(3)-(4), §79 and §86 EStG; BMF 5.10.2023, Rn. 100–120.
 * Actual payments are never reduced to a tax deduction ceiling. Refunds remain
 * cash, allocated by considered OWN payments (not allowances or raw inflows).
 */
export function calculateRiesterHouseholdFunding(
  entries: RiesterFundingEntry[],
  people: { self: RiesterFundingPerson; partner?: RiesterFundingPerson },
  rules: GermanRules,
  options: { yearIndex?: number; jointTaxableIncome?: number } = {},
): Record<string, RiesterFundingResult> {
  const yearIndex = options.yearIndex ?? 0
  const r = rules.riester
  const owners: Owner[] = ['self', 'partner']
  const groups = owners.map(owner => {
    const person = people[owner]
    const contracts = entries.filter(e => (e.ownedBy ?? 'self') === owner)
    // Legacy contradictory flags are excluded contract by contract. The UI
    // flags that inconsistent person-level input instead of silently upgrading it.
    const direct = contracts.some(e => e.contract.eligibility.directlyEligible)
    const pool = person ? contracts.filter(e => e.contract.fundingEligible !== false &&
      (direct ? e.contract.eligibility.directlyEligible : e.contract.eligibility.indirectSpouseEligible &&
        e.contract.monthlyOwnContribution * 12 >= r.indirectEligibilityMinimumAnnual)) : []
    const own = pool.reduce((s, e) => s + e.contract.monthlyOwnContribution * 12, 0)
    const indirect = !direct && pool.length > 0
    const candidates = pool.map(e => ({ entry: e, full: computeFullRiesterAllowances(
      e.contract, { ...person!.profile, childBirthYears: people.self.profile.childBirthYears }, rules,
      yearIndex === 0, rules.year + yearIndex,
    ) }))
    // Allowance destination: the larger full allowance first, so the person's
    // total never drops; among equal claims a paying contract before a EUR 0 one
    // (R2-2 decision), then instanceId. The amount paid is not a key. Indirect
    // pools only hold paying contracts, so the paying key never applies there.
    const paying = (e: RiesterFundingEntry) => e.contract.monthlyOwnContribution > 0 ? 1 : 0
    candidates.sort((a, b) => b.full.total - a.full.total || paying(b.entry) - paying(a.entry) ||
      a.entry.instanceId.localeCompare(b.entry.instanceId))
    const recipient = candidates[0]
    return { owner, person, contracts, pool, own, direct: !!person && direct, indirect,
      recipient, full: recipient?.full ?? { grundzulage: 0, childAllowance: 0, careerStarter: 0, total: 0 },
      ratio: 0, minimum: r.sockelbetrag, allowance: 0, deductibleAllowance: 0, considered: 0, refund: 0 }
  })
  const directGroup = groups.find(g => g.direct)
  const indirectGroup = groups.find(g => g.indirect && !g.direct && g.person && directGroup)
  const householdDeductionCapAnnual = groups.filter(g => g.direct).length * r.annualCapInclAllowances +
    (indirectGroup ? r.indirectSpouseDeductionIncreaseAnnual : 0)
  for (const g of groups) {
    if (!g.direct) continue
    const priorIncome = g.pool.find(e => e.contract.eligibility.priorYearRelevantIncome !== undefined)?.contract.eligibility.priorYearRelevantIncome ??
      Math.min(g.person!.salary.annualGross, rules.socialSecurity.pensionCapYear)
    g.minimum = Math.max(r.sockelbetrag, Math.min(r.minEigenbeitragPct * priorIncome,
      r.annualCapInclAllowances) - g.full.total - (g === directGroup ? indirectGroup?.full.total ?? 0 : 0))
    g.ratio = Math.min(1, g.own / g.minimum)
  }
  if (indirectGroup && directGroup) {
    indirectGroup.ratio = directGroup.ratio
    indirectGroup.minimum = r.indirectEligibilityMinimumAnnual
  }
  for (const g of groups) {
    g.allowance = g.full.total * g.ratio
    g.deductibleAllowance = g.direct ? Math.min(g.allowance, r.annualCapInclAllowances) : 0
    g.considered = g.direct ? Math.min(g.own, Math.max(0, r.annualCapInclAllowances - g.allowance)) : 0
  }
  if (directGroup && indirectGroup) {
    const cap = r.annualCapInclAllowances + r.indirectSpouseDeductionIncreaseAnnual
    directGroup.deductibleAllowance = Math.min(directGroup.allowance, cap)
    indirectGroup.deductibleAllowance = Math.min(indirectGroup.allowance, cap - directGroup.deductibleAllowance)
    const room = Math.max(0, cap - directGroup.allowance - indirectGroup.allowance)
    directGroup.considered = Math.min(directGroup.own, Math.max(0, room - r.indirectEligibilityMinimumAnnual))
    indirectGroup.considered = Math.min(indirectGroup.own, room - directGroup.considered)
  }
  if (options.jointTaxableIncome !== undefined) {
    const allowance = groups.reduce((s, g) => s + g.allowance, 0)
    const considered = groups.reduce((s, g) => s + g.considered, 0)
    const refund = Math.max(0, calculateSalaryPhaseTaxDelta(rules, options.jointTaxableIncome,
      considered + groups.reduce((s, g) => s + g.deductibleAllowance, 0), 'married').taxSavingAnnual - allowance)
    for (const g of groups) g.refund = considered > 0 ? refund * g.considered / considered : 0
  } else {
    for (const g of groups) {
      if (!g.person || !g.direct) continue
      const indirect = g === directGroup ? indirectGroup : undefined
      const allowance = g.allowance + (indirect?.allowance ?? 0)
      const considered = g.considered + (indirect?.considered ?? 0)
      const salary = g.person.salary
      const refund = Math.max(0, calculateSalaryPhaseTaxDelta(rules,
        salary.taxableIncomeForDeductions ?? salary.taxableIncome,
        considered + g.deductibleAllowance + (indirect?.deductibleAllowance ?? 0), 'single').taxSavingAnnual - allowance)
      g.refund = considered > 0 ? refund * g.considered / considered : 0
      if (indirect) indirect.refund = considered > 0 ? refund * indirect.considered / considered : 0
    }
  }
  return Object.fromEntries(groups.flatMap(g => g.contracts.map(e => {
    const c = e.contract
    const person = g.person ?? people.self
    const base = calculateRiesterIndividualFunding(rules, person.salary, c, person.profile,
      { contributionYear: rules.year + yearIndex, isFirstContributionYear: yearIndex === 0 })
    const included = g.pool.includes(e) && (g.direct || g === indirectGroup)
    const share = included && g.own > 0 ? base.annualOwnContribution / g.own : 0
    const recipient = included && g.recipient?.entry.instanceId === e.instanceId
    const allowance = recipient ? g.allowance : 0
    const refund = g.refund * share
    return [e.instanceId, {
      ...base,
      section10aEligible: included,
      portfolioDeductionCapAnnual: householdDeductionCapAnnual,
      grundzulageAnnual: recipient ? g.full.grundzulage * g.ratio : 0,
      childAllowanceAnnual: recipient ? g.full.childAllowance * g.ratio : 0,
      careerStarterBonusAnnual: recipient ? g.full.careerStarter * g.ratio : 0,
      totalAllowanceAnnual: allowance,
      minEigenbeitragAnnual: g.minimum,
      meetsMinContribution: included && g.ratio === 1,
      prorationFactor: included ? g.ratio : 0,
      specialExpenseDeductibleAnnual: g.considered * share + (recipient ? g.deductibleAllowance : 0),
      guenstigerpruefungBenefitAnnual: refund,
      monthlyNetCost: base.monthlyOwnContribution - refund / 12,
      receivesPortfolioAllowance: recipient,
      portfolioTaxBenefitShare: share,
      portfolioHouseholdOwnContributionMonthly: g.own / 12,
    }]
  })))
}
