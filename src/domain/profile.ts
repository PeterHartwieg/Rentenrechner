export type ReturnScenarioId = 'konservativ' | 'basis' | 'optimistisch' | 'custom'

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
  /**
   * Optional Wunschnetto: target net monthly pension in EUR. When set, the
   * Vergleichs-Übersicht renders a Lücke card (Wunsch − GRV-Netto) and shows
   * how much of the gap each visible product fills.
   * Captured by the Rentenlücke guided-setup path; users can leave it 0/undefined
   * if they don't want a target.
   */
  desiredNetMonthlyPension?: number
}

export interface ReturnScenario {
  id: ReturnScenarioId
  label: string
  annualReturn: number
}
