import type { InsuranceAssumptions, PayoutMode } from '../../domain'
import { inRange, intInRange, isFiniteNumber, validateFees } from '../../domain/validation/primitives'

const VALID_PAYOUT_MODES: readonly PayoutMode[] = ['leibrente', 'zeitrente', 'kapitalverzehr']

export function validateInsurance(ins: InsuranceAssumptions): boolean {
  if (!intInRange(ins.contractStartYear, 1900, 2100)) return false
  if (typeof ins.oldContractTaxFreeEligible !== 'boolean') return false
  if (!isFiniteNumber(ins.monthlyOtherRetirementIncome) || ins.monthlyOtherRetirementIncome < 0) return false
  if (!VALID_PAYOUT_MODES.includes(ins.payoutMode)) return false
  if (!inRange(ins.rentenfaktor, 0, 100)) return false
  if (typeof ins.rentenfaktorConfirmed !== 'boolean') return false
  if (!intInRange(ins.zeitrenteYears, 1, 50)) return false
  if (!ins.fees || typeof ins.fees !== 'object') return false
  if (!validateFees(ins.fees)) return false
  // #65: paidUpAge is optional; when present must be a non-negative integer
  if (ins.paidUpAge !== undefined && !intInRange(ins.paidUpAge, 0, 120)) return false
  if (!inRange(ins.surrenderHaircutPct, 0, 1)) return false
  return true
}
