import type {
  BavAssumptions,
  BavDurchfuehrungsweg,
  EtfAssumptions,
  FeeModel,
  InsuranceAssumptions,
  PayoutMode,
  PersonalProfile,
  ReturnScenario,
  ReturnScenarioId,
  ScenarioAssumptions,
} from '../domain/types'

// Range/shape validation for state loaded from URL share or localStorage (#49).
// Inputs are post-mergeDeep so all keys exist; this layer rejects NaN, ±Infinity,
// out-of-domain enums, broken invariants, and malformed nested arrays.

const VALID_DURCHFUEHRUNGSWEGE: readonly BavDurchfuehrungsweg[] = [
  'direktversicherung_3_63',
  'pensionskasse_3_63',
  'pensionsfonds_3_63',
  'direktversicherung_40b_alt',
  'direktzusage',
  'unterstuetzungskasse',
]

const VALID_SCENARIO_IDS: readonly ReturnScenarioId[] = ['konservativ', 'basis', 'optimistisch']

const VALID_PARTIAL_EXEMPTIONS = [0, 0.15, 0.3, 0.6, 0.8] as const

const VALID_PAYOUT_MODES: readonly PayoutMode[] = ['leibrente', 'zeitrente', 'kapitalverzehr']

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function inRange(v: unknown, min: number, max: number): v is number {
  return isFiniteNumber(v) && v >= min && v <= max
}

function isInt(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v)
}

function intInRange(v: unknown, min: number, max: number): v is number {
  return isInt(v) && v >= min && v <= max
}

function validateFees(fees: FeeModel): boolean {
  return (
    inRange(fees.wrapperAssetFee, 0, 0.5) &&
    inRange(fees.fundAssetFee, 0, 0.5) &&
    inRange(fees.pensionPayoutFeePct, 0, 0.5) &&
    inRange(fees.contributionFee, 0, 0.5) &&
    inRange(fees.fixedMonthlyFee, 0, 1_000_000) &&
    inRange(fees.acquisitionCostPct, 0, 0.5) &&
    intInRange(fees.acquisitionCostSpreadYears, 1, 50)
  )
}

export function validateProfile(input: unknown): PersonalProfile | null {
  if (!input || typeof input !== 'object') return null
  const p = input as PersonalProfile
  if (!isFiniteNumber(p.age) || p.age < 0) return null
  if (!isFiniteNumber(p.retirementAge)) return null
  if (p.retirementAge < p.age || p.retirementAge > 120) return null
  if (!isFiniteNumber(p.grossSalaryYear) || p.grossSalaryYear < 0) return null
  if (p.taxClass !== 1) return null
  if (!Array.isArray(p.childBirthYears) || p.childBirthYears.length > 20) return null
  for (const y of p.childBirthYears) {
    if (!isInt(y) || y < 1900 || y > 2200) return null
  }
  if (typeof p.churchTax !== 'boolean') return null
  if (typeof p.publicHealthInsurance !== 'boolean') return null
  if (!inRange(p.healthAdditionalContributionPct, 0, 10)) return null
  if (!inRange(p.pkvMonthlyPremium, 0, 10_000)) return null
  if (!inRange(p.pPVMonthlyPremium, 0, 10_000)) return null
  return p
}

export function validateReturnScenarios(input: unknown): ReturnScenario[] | null {
  if (!Array.isArray(input)) return null
  if (input.length < 1 || input.length > 10) return null
  const seen = new Set<string>()
  for (const item of input) {
    if (!item || typeof item !== 'object') return null
    const s = item as ReturnScenario
    if (!VALID_SCENARIO_IDS.includes(s.id)) return null
    if (seen.has(s.id)) return null
    seen.add(s.id)
    if (typeof s.label !== 'string' || s.label.length === 0) return null
    if (!inRange(s.annualReturn, -0.5, 0.5)) return null
  }
  return input as ReturnScenario[]
}

function validateEtf(etf: EtfAssumptions): boolean {
  if (!inRange(etf.annualAssetFee, 0, 0.5)) return false
  if (!isFiniteNumber(etf.equityPartialExemption)) return false
  return (VALID_PARTIAL_EXEMPTIONS as readonly number[]).includes(etf.equityPartialExemption)
}

function validateBav(bav: BavAssumptions): boolean {
  if (!isFiniteNumber(bav.monthlyGrossConversion) || bav.monthlyGrossConversion < 0) return false
  if (typeof bav.statutoryMinimumSubsidyEnabled !== 'boolean') return false
  if (!inRange(bav.contractualMatchPercent, 0, 1)) return false
  if (!isFiniteNumber(bav.contractualFixedMonthly) || bav.contractualFixedMonthly < 0) return false
  if (!isFiniteNumber(bav.monthlyOtherRetirementIncome) || bav.monthlyOtherRetirementIncome < 0) return false
  if (typeof bav.includeGrvReduction !== 'boolean') return false
  if (typeof bav.kvdrMember !== 'boolean') return false
  if (!VALID_DURCHFUEHRUNGSWEGE.includes(bav.durchfuehrungsweg)) return false
  if (typeof bav.pre2005EligibleTaxFree !== 'boolean') return false
  if (!VALID_PAYOUT_MODES.includes(bav.payoutMode)) return false
  if (!inRange(bav.rentenfaktor, 0, 100)) return false
  if (!intInRange(bav.zeitrenteYears, 1, 50)) return false
  if (!bav.fees || typeof bav.fees !== 'object') return false
  return validateFees(bav.fees)
}

function validateInsurance(ins: InsuranceAssumptions): boolean {
  if (!intInRange(ins.contractStartYear, 1900, 2100)) return false
  if (typeof ins.oldContractTaxFreeEligible !== 'boolean') return false
  if (!isFiniteNumber(ins.monthlyOtherRetirementIncome) || ins.monthlyOtherRetirementIncome < 0) return false
  if (!VALID_PAYOUT_MODES.includes(ins.payoutMode)) return false
  if (!inRange(ins.rentenfaktor, 0, 100)) return false
  if (!intInRange(ins.zeitrenteYears, 1, 50)) return false
  if (!ins.fees || typeof ins.fees !== 'object') return false
  return validateFees(ins.fees)
}

export function validateAssumptions(input: unknown): ScenarioAssumptions | null {
  if (!input || typeof input !== 'object') return null
  const a = input as ScenarioAssumptions
  if (!inRange(a.inflationRate, -0.1, 0.2)) return null
  if (!isFiniteNumber(a.retirementEndAge) || a.retirementEndAge > 120) return null
  if (validateReturnScenarios(a.returnScenarios) === null) return null
  if (!a.etf || typeof a.etf !== 'object' || !validateEtf(a.etf)) return null
  if (!a.bav || typeof a.bav !== 'object' || !validateBav(a.bav)) return null
  if (!a.insurance || typeof a.insurance !== 'object' || !validateInsurance(a.insurance)) return null
  return a
}

export function validateState(
  profileInput: unknown,
  assumptionsInput: unknown,
): { profile: PersonalProfile; assumptions: ScenarioAssumptions } | null {
  const profile = validateProfile(profileInput)
  if (!profile) return null
  const assumptions = validateAssumptions(assumptionsInput)
  if (!assumptions) return null
  // Cross-object invariant: retirementEndAge > retirementAge.
  if (assumptions.retirementEndAge <= profile.retirementAge) return null
  return { profile, assumptions }
}
