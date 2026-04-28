export type ReturnScenarioId = 'konservativ' | 'basis' | 'optimistisch'

export interface PersonalProfile {
  age: number
  retirementAge: number
  grossSalaryYear: number
  taxClass: 1
  // §55 Abs. 3 / Abs. 3a SGB XI: birth year of each child.
  // Kinderlosenzuschlag (+0.6 %) applies when empty. Discounts (−0.25 % per child
  // starting from the 2nd) apply only to children under 25 in the contribution year.
  childBirthYears: number[]
  churchTax: boolean
  publicHealthInsurance: boolean
  healthAdditionalContributionPct: number
  // #50: PKV premium inputs (used only when publicHealthInsurance = false).
  // pkvMonthlyPremium: gross monthly PKV premium paid by the employee.
  // pPVMonthlyPremium: monthly private Pflegeversicherung premium.
  // Employer pays §257 SGB V subsidy (half the premium, capped at GKV employer equivalent).
  pkvMonthlyPremium: number
  pPVMonthlyPremium: number
}

export interface ReturnScenario {
  id: ReturnScenarioId
  label: string
  annualReturn: number
}
