import type { BasisrenteAssumptions } from '../../domain'
import { inRange, isFiniteNumber, validateFees } from '../../domain/validation/primitives'

const VALID_RETIREMENT_HEALTH_STATUSES: readonly string[] = ['kvdr', 'freiwillig_gkv', 'pkv']

export function validateBasisrente(br: BasisrenteAssumptions): boolean {
  if (!isFiniteNumber(br.monthlyGrossContribution) || br.monthlyGrossContribution < 0) return false
  if (br.payoutMode !== 'leibrente') return false
  if (!inRange(br.rentenfaktor, 0, 100)) return false
  if (!isFiniteNumber(br.monthlyOtherRetirementIncome) || br.monthlyOtherRetirementIncome < 0) return false
  if (!VALID_RETIREMENT_HEALTH_STATUSES.includes(br.retirementHealthStatus)) return false
  if (!br.fees || typeof br.fees !== 'object') return false
  return validateFees(br.fees)
}
