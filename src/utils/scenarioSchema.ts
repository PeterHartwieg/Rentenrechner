import type {
  PersonalProfile,
  ReturnScenario,
  ReturnScenarioId,
  ScenarioAssumptions,
  StatutoryPensionAssumptions,
} from '../domain'
import { inRange, isFiniteNumber, isInt } from '../domain/validation/primitives'
import { validateEtf } from '../engine/products/etf.validation'
import { validateBav } from '../engine/products/bav.validation'
import { validateInsurance } from '../engine/products/insurance.validation'
import { validateBasisrente } from '../engine/products/basisrente.validation'
import { validateAltersvorsorgedepot } from '../engine/products/altersvorsorgedepot.validation'
import { validateRiester } from '../engine/products/riester.validation'

// Range/shape validation for state loaded from URL share or localStorage (#49).
// Inputs are post-mergeDeep so all keys exist; this layer rejects NaN, ±Infinity,
// out-of-domain enums, broken invariants, and malformed nested arrays.

const VALID_SCENARIO_IDS: readonly ReturnScenarioId[] = ['konservativ', 'basis', 'optimistisch']

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

function validateStatutoryPension(sp: StatutoryPensionAssumptions): boolean {
  if (sp.manualMonthlyGross !== null && !inRange(sp.manualMonthlyGross, 0, 100_000)) return false
  if (!inRange(sp.currentEntgeltpunkte, 0, 200)) return false
  if (typeof sp.includeGrvReduction !== 'boolean') return false
  if (!inRange(sp.annualSalaryGrowthRate ?? 0, -0.1, 0.2)) return false
  if (!inRange(sp.rentenwertGrowthRate ?? 0, -0.05, 0.1)) return false
  return true
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
  if (!a.statutoryPension || typeof a.statutoryPension !== 'object' || !validateStatutoryPension(a.statutoryPension)) return null
  if (!a.basisrente || typeof a.basisrente !== 'object' || !validateBasisrente(a.basisrente)) return null
  if (!a.altersvorsorgedepot || typeof a.altersvorsorgedepot !== 'object' || !validateAltersvorsorgedepot(a.altersvorsorgedepot)) return null
  if (!a.riester || typeof a.riester !== 'object' || !validateRiester(a.riester)) return null
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
