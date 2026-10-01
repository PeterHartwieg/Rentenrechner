import type { BasisrenteAssumptions } from '../../domain'
import { inRange, isFiniteNumber, validateFees } from '../../domain/validation/primitives'
import { RENTENFAKTOR_BOUNDS } from '../../domain/validation/bounds'

export function validateBasisrente(br: BasisrenteAssumptions): boolean {
  if (!isFiniteNumber(br.monthlyGrossContribution) || br.monthlyGrossContribution < 0) return false
  if (br.payoutMode !== 'leibrente') return false
  if (!inRange(br.rentenfaktor, RENTENFAKTOR_BOUNDS.min, RENTENFAKTOR_BOUNDS.max)) return false
  if (typeof br.rentenfaktorConfirmed !== 'boolean') return false
  if (!isFiniteNumber(br.monthlyOtherRetirementIncome) || br.monthlyOtherRetirementIncome < 0) return false
  if (!br.fees || typeof br.fees !== 'object') return false
  return validateFees(br.fees)
}
