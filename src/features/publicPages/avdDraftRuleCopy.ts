import { activeRules } from '../../rules'

// Statutory amounts for the two AV-Depot draft pages
// (altersvorsorgedepot-gesetz / altersvorsorgedepot-anbieter), formatted for
// German copy. Values come from src/rules; worked examples combine them with
// the handoff's example inputs (own contribution, income, tax rate), which are
// assumptions, not statutory values. The .faq.json files cannot import, so
// avdDraftRuleLiterals.test.ts pins their amounts to these rules.

const avd = activeRules.altersvorsorgedepot
const riester = activeRules.riester

/** German number format with at most `maxDecimals` fraction digits. */
export function de(value: number, maxDecimals = 2): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: maxDecimals })
}

const pct = (ratio: number) => de(ratio * 100)

const CARDINALS: Record<number, string> = { 2: 'zwei', 3: 'drei', 4: 'vier', 5: 'fünf', 6: 'sechs', 7: 'sieben' }
const ORDINALS_DATIVE: Record<number, string> = { 3: 'dritten', 4: 'vierten', 5: 'fünften' }

/** Small count spelled out as in the copy ("zwei", "fünf"). */
export function deWord(value: number): string {
  const word = CARDINALS[value]
  if (!word) throw new Error(`No German word for ${value}`)
  return word
}

/** Dative ordinal as in "ab dem dritten Vertrag". */
export function deOrdinalDative(value: number): string {
  const word = ORDINALS_DATIVE[value]
  if (!word) throw new Error(`No German ordinal for ${value}`)
  return word
}

/** § 84 EStG (neu): Grundzulage for an annual own contribution. */
export function avdBasicAllowance(ownContribution: number): number {
  const tier1 = Math.min(ownContribution, avd.basicAllowanceTier1MaxContribution)
  const tier2 = Math.max(0, Math.min(ownContribution, avd.basicAllowanceTier2MaxContribution) - avd.basicAllowanceTier1MaxContribution)
  return tier1 * avd.basicAllowanceTier1Rate + tier2 * avd.basicAllowanceTier2Rate
}

/** § 85 EStG (neu): Kinderzulage per child for an annual own contribution. */
export function avdChildAllowance(ownContribution: number): number {
  return Math.min(ownContribution * avd.childAllowanceRate, avd.childAllowanceMax)
}

// --- Rule values ---------------------------------------------------------

export const AVD_TIER_1_RATE = pct(avd.basicAllowanceTier1Rate)
export const AVD_TIER_2_RATE = pct(avd.basicAllowanceTier2Rate)
export const AVD_TIER_1_MAX = de(avd.basicAllowanceTier1MaxContribution)
export const AVD_TIER_2_START = (avd.basicAllowanceTier1MaxContribution + 0.01).toLocaleString('de-DE', { minimumFractionDigits: 2 })
export const AVD_TIER_2_MAX = de(avd.basicAllowanceTier2MaxContribution)
export const AVD_BASIC_ALLOWANCE_MAX = de(avd.basicAllowanceMax)
export const AVD_INDIRECT_SPOUSE_ALLOWANCE_MAX = de(avd.indirectSpouseBasicAllowanceMax)
export const AVD_CAREER_STARTER_BONUS = de(avd.careerStarterBonus)
export const AVD_CAREER_STARTER_AGE_LIMIT = de(avd.careerStarterMaxAge + 1)
export const AVD_CHILD_ALLOWANCE_RATE = pct(avd.childAllowanceRate)
export const AVD_CHILD_ALLOWANCE_MAX = de(avd.childAllowanceMax)
/** Own contribution from which the full Kinderzulage is reached. */
export const AVD_CHILD_ALLOWANCE_FULL_FROM = de(avd.childAllowanceMax / avd.childAllowanceRate)
export const AVD_MINIMUM_OWN_CONTRIBUTION = de(avd.minimumOwnContributionAnnual)
export const AVD_CONTRACT_CONTRIBUTION_CAP = de(avd.contractContributionCapAnnual)
export const AVD_SPECIAL_EXPENSE_OWN_CAP = de(avd.specialExpenseOwnContributionCap)
export const AVD_STANDARD_COST_CAP = (avd.standarddepotEffektivkostenCap * 100).toLocaleString('de-DE', { minimumFractionDigits: 1 })
export const AVD_GLIDEPATH_5Y_MAX = pct(avd.glidepathHighRiskMax5YearsBefore)
export const AVD_GLIDEPATH_2Y_MAX = pct(avd.glidepathHighRiskMax2YearsBefore)
export const AVD_PAYOUT_MIN_AGE = de(avd.payoutMinAge)
export const AVD_PAYOUT_MAX_AGE = de(avd.payoutMaxFirstAge)
export const AVD_PAYOUT_PLAN_END_AGE = de(avd.payoutPlanMinEndAge)
export const AVD_PARTIAL_CAPITAL_MAX = pct(avd.partialCapitalMaxPct)
export const AVD_TRANSFER_COST_OLD_PROVIDER = de(avd.transferCostOldProviderWithin5YearsEUR)
export const AVD_TRANSFER_COST_NEW_PROVIDER = de(avd.transferCostNewProviderEUR)
export const AVD_TRANSFER_COST_WINDOW_YEARS = de(avd.transferCostWindowYears)
export const AVD_TRANSFER_COST_WINDOW_YEARS_WORD = deWord(avd.transferCostWindowYears)
export const AVD_TERMINATION_NOTICE_MONTHS_WORD = deWord(avd.terminationNoticeMonths)
export const AVD_SELF_EMPLOYED_AGE_LIMIT = de(avd.selfEmployedEligibilityAgeLimit)
export const AVD_MAX_CONTRACTS_WORD = deWord(avd.maxSubsidisedNewContracts)
export const AVD_FIRST_UNSUBSIDISED_CONTRACT_WORD = deOrdinalDative(avd.maxSubsidisedNewContracts + 1)
export const AVD_GUARANTEE_PARTIAL = pct(avd.guaranteeLevelPartial)
export const AVD_GUARANTEE_FULL = pct(avd.guaranteeLevelFull)
export const AVD_MAX_RISK_CLASS = de(avd.maxRiskClass)
export const AVD_STANDARD_FUND_COUNT_WORD = deWord(avd.standarddepotFundCount)
export const AVD_GLIDEPATH_FIRST_YEARS_WORD = deWord(avd.glidepathFirstCheckpointYearsBefore)
export const AVD_GLIDEPATH_SECOND_YEARS_WORD = deWord(avd.glidepathSecondCheckpointYearsBefore)

export const RIESTER_BASIC_ALLOWANCE = de(riester.grundzulage)
export const RIESTER_CHILD_ALLOWANCE_PRE_2008 = de(riester.childAllowancePre2008)
export const RIESTER_CHILD_ALLOWANCE_POST_2007 = de(riester.childAllowancePost2007)
export const RIESTER_MIN_CONTRIBUTION_PCT = pct(riester.minEigenbeitragPct)
export const RIESTER_SPECIAL_EXPENSE_CAP = de(riester.annualCapInclAllowances)
export const RIESTER_MINIMUM_OWN_CONTRIBUTION = de(riester.sockelbetrag)

// --- Law page: allowance examples (one year, § 84 / § 85 EStG) -----------

const LAW_EXAMPLE_MID_CONTRIBUTION = 1_200

export const LAW_EXAMPLE_ROWS = [
  avd.basicAllowanceTier1MaxContribution,
  LAW_EXAMPLE_MID_CONTRIBUTION,
  avd.basicAllowanceTier2MaxContribution,
].map((contribution) => ({
  contribution: de(contribution),
  basic: de(avdBasicAllowance(contribution)),
  withOneChild: de(avdBasicAllowance(contribution) + avdChildAllowance(contribution)),
}))

// --- Provider page: Günstigerprüfung threshold ---------------------------

const maxDeduction = avd.specialExpenseOwnContributionCap + avd.basicAllowanceMax
export const AVD_MAX_DEDUCTION = de(maxDeduction)
export const AVD_BREAK_EVEN_RATE_ROUNDED = de(avd.basicAllowanceMax / maxDeduction * 100, 0)
export const AVD_BREAK_EVEN_RATE = de(avd.basicAllowanceMax / maxDeduction * 100, 1)

// --- Provider page: Riester switch example (old vs. new rules) -----------

const SWITCH_INCOME = 40_000
const switchOldGross = SWITCH_INCOME * riester.minEigenbeitragPct
const switchOldMinimum = switchOldGross - riester.grundzulage
export const SWITCH = {
  income: de(SWITCH_INCOME),
  oldGross: de(switchOldGross),
  oldMinimum: de(switchOldMinimum),
  newBasic: de(avdBasicAllowance(switchOldMinimum)),
  tier2Part: de(switchOldMinimum - avd.basicAllowanceTier1MaxContribution),
}

// --- Provider page: Beispiel 1 (two children, 600 € own contribution) ----

const EX1_CONTRIBUTION = 600
const EX1_CHILDREN = 2
const EX1_TAX_RATE = 0.15
const EX1_RIESTER_INCOME = 20_000
const ex1Tier2Part = EX1_CONTRIBUTION - avd.basicAllowanceTier1MaxContribution
const ex1Basic = avdBasicAllowance(EX1_CONTRIBUTION)
const ex1Child = avdChildAllowance(EX1_CONTRIBUTION) * EX1_CHILDREN
const ex1Total = ex1Basic + ex1Child
const ex1OldTotal = riester.grundzulage + EX1_CHILDREN * riester.childAllowancePost2007
const ex1OldGross = EX1_RIESTER_INCOME * riester.minEigenbeitragPct
export const EX1 = {
  contribution: de(EX1_CONTRIBUTION),
  monthly: de(EX1_CONTRIBUTION / 12),
  children: de(EX1_CHILDREN),
  tier1Allowance: de(avd.basicAllowanceTier1MaxContribution * avd.basicAllowanceTier1Rate),
  tier2Part: de(ex1Tier2Part),
  tier2Allowance: de(ex1Tier2Part * avd.basicAllowanceTier2Rate),
  basic: de(ex1Basic),
  childPer: de(avdChildAllowance(EX1_CONTRIBUTION)),
  child: de(ex1Child),
  total: de(ex1Total),
  intoDepot: de(EX1_CONTRIBUTION + ex1Total),
  taxRate: pct(EX1_TAX_RATE),
  taxSaving: de((EX1_CONTRIBUTION + ex1Total) * EX1_TAX_RATE),
  riesterIncome: de(EX1_RIESTER_INCOME),
  oldTotal: de(ex1OldTotal),
  oldGross: de(ex1OldGross),
  oldRemainder: de(ex1OldGross - ex1OldTotal),
}

// --- Provider page: Beispiel 2 (Günstigerprüfung at 40 %) ----------------

const EX2_CONTRIBUTION = avd.specialExpenseOwnContributionCap
const EX2_TAX_RATE = 0.40
const ex2Tier2Part = EX2_CONTRIBUTION - avd.basicAllowanceTier1MaxContribution
const ex2Basic = avdBasicAllowance(EX2_CONTRIBUTION)
const ex2Deduction = EX2_CONTRIBUTION + ex2Basic
const ex2TaxSaving = ex2Deduction * EX2_TAX_RATE
const ex2Refund = ex2TaxSaving - ex2Basic
export const EX2 = {
  contribution: de(EX2_CONTRIBUTION),
  monthly: de(EX2_CONTRIBUTION / 12),
  taxRate: pct(EX2_TAX_RATE),
  tier1Allowance: de(avd.basicAllowanceTier1MaxContribution * avd.basicAllowanceTier1Rate),
  tier2Part: de(ex2Tier2Part),
  tier2Allowance: de(ex2Tier2Part * avd.basicAllowanceTier2Rate),
  basic: de(ex2Basic),
  deduction: de(ex2Deduction),
  taxSaving: de(ex2TaxSaving),
  refund: de(ex2Refund),
  netCost: de(EX2_CONTRIBUTION - ex2Refund),
}

// --- Provider page: Beispiel 3 (start at 58, payout plan to 85) ----------

const EX3_START_AGE = 58
const EX3_CONTRIBUTION = avd.specialExpenseOwnContributionCap
export const EX3_YEARS = avd.payoutMinAge - EX3_START_AGE
const ex3Allowances = avdBasicAllowance(EX3_CONTRIBUTION) * EX3_YEARS
const ex3Contributions = EX3_CONTRIBUTION * EX3_YEARS
const ex3Capital = ex3Allowances + ex3Contributions
const ex3Months = (avd.payoutPlanMinEndAge - avd.payoutMinAge) * 12
const ex3Partial = ex3Capital * avd.partialCapitalMaxPct
export const EX3 = {
  startAge: de(EX3_START_AGE),
  yearsWord: deWord(EX3_YEARS),
  contribution: de(EX3_CONTRIBUTION),
  allowancePerYear: de(avdBasicAllowance(EX3_CONTRIBUTION)),
  allowances: de(ex3Allowances),
  contributions: de(ex3Contributions),
  capital: de(ex3Capital),
  months: de(ex3Months),
  monthly: de(ex3Capital / ex3Months),
  partial: de(ex3Partial),
  rest: de(ex3Capital - ex3Partial),
  monthlyAfterPartial: de((ex3Capital - ex3Partial) / ex3Months),
}

// --- Provider page: Beispiel 4 (career starter, 360 € own contribution) --

const EX4_AGE = 22
const EX4_CONTRIBUTION = avd.basicAllowanceTier1MaxContribution
const ex4Basic = avdBasicAllowance(EX4_CONTRIBUTION)
export const EX4 = {
  age: de(EX4_AGE),
  contribution: de(EX4_CONTRIBUTION),
  monthly: de(EX4_CONTRIBUTION / 12),
  basic: de(ex4Basic),
  firstYear: de(ex4Basic + avd.careerStarterBonus),
  minimumBasic: de(avdBasicAllowance(avd.minimumOwnContributionAnnual)),
}
