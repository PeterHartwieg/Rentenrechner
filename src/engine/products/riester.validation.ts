import type { RiesterAssumptions } from '../../domain/types'
import { inRange, intInRange, isFiniteNumber, validateFees } from '../../domain/validation/primitives'

const VALID_RIESTER_PAYOUT_MODES: readonly string[] = ['leibrente', 'zeitrente']

export function validateRiester(r: RiesterAssumptions): boolean {
  if (!isFiniteNumber(r.monthlyOwnContribution) || r.monthlyOwnContribution < 0) return false
  if (!isFiniteNumber(r.existingCapital) || r.existingCapital < 0) return false
  // eligibility
  const e = r.eligibility
  if (!e || typeof e !== 'object') return false
  if (typeof e.directlyEligible !== 'boolean') return false
  if (!intInRange(e.ageAtContractStart, 0, 120)) return false
  if (typeof e.careerStarterBonusUsed !== 'boolean') return false
  // payout
  if (!VALID_RIESTER_PAYOUT_MODES.includes(r.payoutMode)) return false
  if (!inRange(r.rentenfaktor, 0, 100)) return false
  if (!intInRange(r.zeitrenteYears, 1, 50)) return false
  if (!inRange(r.partialCapitalPct, 0, 0.3)) return false
  if (!isFiniteNumber(r.monthlyOtherRetirementIncome) || r.monthlyOtherRetirementIncome < 0) return false
  if (!r.fees || typeof r.fees !== 'object') return false
  return validateFees(r.fees)
}
