import type { PersonalProfile } from '../../domain'

/** The person + inflation the saved plan computes on; read once at mount by `/vergleich`. */
export interface PlanProfileSummary {
  age: number
  grossSalaryYear: number
  publicHealthInsurance: boolean
  inflationRate: number
}

/** Field-by-field comparison of the compare profile against the plan's. */
export function profileDiffersFrom(
  plan: PlanProfileSummary | undefined,
  profile: Pick<PersonalProfile, 'age' | 'grossSalaryYear' | 'publicHealthInsurance'>,
  inflationRate: number,
): boolean {
  if (!plan) return false
  return plan.age !== profile.age
    || plan.grossSalaryYear !== profile.grossSalaryYear
    || plan.publicHealthInsurance !== profile.publicHealthInsurance
    || plan.inflationRate !== inflationRate
}
