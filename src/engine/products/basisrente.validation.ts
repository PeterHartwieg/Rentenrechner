import type { BasisrenteAssumptions } from '../../domain'
import { inRange, intInRange, isFiniteNumber, validateFees } from '../../domain/validation/primitives'

const VALID_BASISRENTE_PAYOUT_MODES: readonly string[] = ['leibrente', 'zeitrente']

export function validateBasisrente(br: BasisrenteAssumptions): boolean {
  if (!isFiniteNumber(br.monthlyGrossContribution) || br.monthlyGrossContribution < 0) return false
  if (!VALID_BASISRENTE_PAYOUT_MODES.includes(br.payoutMode)) return false
  if (!inRange(br.rentenfaktor, 0, 100)) return false
  if (!intInRange(br.zeitrenteYears, 1, 50)) return false
  if (!isFiniteNumber(br.monthlyOtherRetirementIncome) || br.monthlyOtherRetirementIncome < 0) return false
  if (!br.fees || typeof br.fees !== 'object') return false
  return validateFees(br.fees)
}
