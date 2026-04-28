import type { BavAssumptions, BavDurchfuehrungsweg, PayoutMode } from '../../domain'
import { inRange, intInRange, isFiniteNumber, validateFees } from '../../domain/validation/primitives'

const VALID_DURCHFUEHRUNGSWEGE: readonly BavDurchfuehrungsweg[] = [
  'direktversicherung_3_63',
  'pensionskasse_3_63',
  'pensionsfonds_3_63',
  'direktversicherung_40b_alt',
  'direktzusage',
  'unterstuetzungskasse',
]

const VALID_PAYOUT_MODES: readonly PayoutMode[] = ['leibrente', 'zeitrente', 'kapitalverzehr']

export function validateBav(bav: BavAssumptions): boolean {
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
