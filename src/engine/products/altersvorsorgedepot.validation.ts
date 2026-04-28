import type {
  AltersvorsorgedepotAssumptions,
  AltersvorsorgedepotPayoutMode,
  AltersvorsorgedepotSubtype,
} from '../../domain/types'
import { inRange, intInRange, isFiniteNumber, validateFees } from '../../domain/validation/primitives'

const VALID_AVD_SUBTYPES: readonly AltersvorsorgedepotSubtype[] = [
  'depot_no_guarantee',
  'standarddepot',
  'guarantee_80',
  'guarantee_100',
]

const VALID_AVD_PAYOUT_MODES: readonly AltersvorsorgedepotPayoutMode[] = [
  'lifelong_annuity',
  'certified_payout_plan',
  'hybrid_80_annuity',
]

export function validateAltersvorsorgedepot(avd: AltersvorsorgedepotAssumptions): boolean {
  if (!VALID_AVD_SUBTYPES.includes(avd.subtype)) return false
  if (!isFiniteNumber(avd.monthlyOwnContribution) || avd.monthlyOwnContribution < 0) return false
  // eligibility
  const e = avd.eligibility
  if (!e || typeof e !== 'object') return false
  if (typeof e.directlyEligible !== 'boolean') return false
  if (typeof e.indirectSpouseEligible !== 'boolean') return false
  if (!intInRange(e.eligibleChildren, 0, 20)) return false
  if (!intInRange(e.ageAtContractStart, 0, 120)) return false
  if (typeof e.careerStarterBonusUsed !== 'boolean') return false
  // allocation / returns
  if (!inRange(avd.riskAllocationPct, 0, 1)) return false
  if (!inRange(avd.riskAnnualReturn, -0.5, 0.5)) return false
  if (!inRange(avd.lowRiskAnnualReturn, -0.5, 0.5)) return false
  // payout
  if (!VALID_AVD_PAYOUT_MODES.includes(avd.payoutMode)) return false
  if (!intInRange(avd.payoutPlanEndAge, 60, 120)) return false
  if (!inRange(avd.partialCapitalPct, 0, 0.3)) return false
  if (!inRange(avd.transferCostEUR, 0, 1_000)) return false
  if (!isFiniteNumber(avd.monthlyOtherRetirementIncome) || avd.monthlyOtherRetirementIncome < 0) return false
  if (!inRange(avd.rentenfaktor, 0, 100)) return false
  if (!avd.fees || typeof avd.fees !== 'object') return false
  if (!validateFees(avd.fees)) return false
  if (!isFiniteNumber(avd.riesterTransferCapital) || avd.riesterTransferCapital < 0) return false
  return true
}
