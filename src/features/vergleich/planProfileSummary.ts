import type { PersonalProfile } from '../../domain'

/**
 * The person + inflation the saved plan computes on; read once at mount by
 * `/vergleich`. Every field here is one the comparison itself uses, and the
 * result strip lists all of them for both the comparison and the plan, so a
 * difference is always visible in the copy (audit F11 follow-up).
 */
export interface PlanProfileSummary {
  age: number
  retirementAge: number
  grossSalaryYear: number
  publicHealthInsurance: boolean
  inflationRate: number
}

/** The profile fields the comparison is diffed on. */
export type ComparedProfile = Pick<PersonalProfile, 'age' | 'retirementAge' | 'grossSalaryYear' | 'publicHealthInsurance'>

/** Field-by-field comparison of the compare profile against the plan's. */
export function profileDiffersFrom(
  plan: PlanProfileSummary | undefined,
  profile: ComparedProfile,
  inflationRate: number,
): boolean {
  if (!plan) return false
  return plan.age !== profile.age
    || plan.retirementAge !== profile.retirementAge
    || plan.grossSalaryYear !== profile.grossSalaryYear
    || plan.publicHealthInsurance !== profile.publicHealthInsurance
    || plan.inflationRate !== inflationRate
}
