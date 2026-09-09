import type { InsuranceAssumptions, PayoutMode } from '../../domain'
import {
  inRange,
  intInRange,
  isFiniteNumber,
  validateCapitalGuarantee,
  validateFees,
} from '../../domain/validation/primitives'
import {
  CONTRACT_START_YEAR_BOUNDS,
  CONTRIBUTION_GROWTH_BOUNDS,
  RENTENFAKTOR_BOUNDS,
  SURRENDER_HAIRCUT_BOUNDS,
  ZEITRENTE_YEARS_BOUNDS,
} from '../../domain/validation/bounds'

const VALID_PAYOUT_MODES: readonly PayoutMode[] = ['leibrente', 'zeitrente', 'kapitalverzehr']

export function validateInsurance(ins: InsuranceAssumptions): boolean {
  if (!intInRange(
      ins.contractStartYear,
      CONTRACT_START_YEAR_BOUNDS.min,
      CONTRACT_START_YEAR_BOUNDS.max,
    )) return false
  if (typeof ins.oldContractTaxFreeEligible !== 'boolean') return false
  if (!isFiniteNumber(ins.monthlyOtherRetirementIncome) || ins.monthlyOtherRetirementIncome < 0) return false
  if (!VALID_PAYOUT_MODES.includes(ins.payoutMode)) return false
  if (!validateCapitalGuarantee(ins.capitalGuarantee)) return false
  if (!inRange(ins.rentenfaktor, RENTENFAKTOR_BOUNDS.min, RENTENFAKTOR_BOUNDS.max)) return false
  if (typeof ins.rentenfaktorConfirmed !== 'boolean') return false
  if (!intInRange(ins.zeitrenteYears, ZEITRENTE_YEARS_BOUNDS.min, ZEITRENTE_YEARS_BOUNDS.max)) return false
  if (!ins.fees || typeof ins.fees !== 'object') return false
  if (!validateFees(ins.fees)) return false
  // #65: paidUpAge is optional; when present must be a non-negative integer
  if (ins.paidUpAge !== undefined && !intInRange(ins.paidUpAge, 0, 120)) return false
  if (!inRange(
      ins.surrenderHaircutPct,
      SURRENDER_HAIRCUT_BOUNDS.min,
      SURRENDER_HAIRCUT_BOUNDS.max,
    )) return false
  if (!inRange(
      ins.annualContributionGrowthRate,
      CONTRIBUTION_GROWTH_BOUNDS.min,
      CONTRIBUTION_GROWTH_BOUNDS.max,
    )) return false
  return true
}
