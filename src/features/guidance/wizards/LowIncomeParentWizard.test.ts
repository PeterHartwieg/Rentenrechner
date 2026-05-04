/**
 * Unit tests for the LowIncomeParentWizard workspace-output shape.
 *
 * We test the applyAndComplete logic that lives in GuidedSetup.tsx (not the
 * React component itself), by simulating the same merging logic to verify the
 * expected workspace shape: persona Lena (33, Erzieherin, 60% Teilzeit, 2 Kinder).
 */

import { describe, it, expect } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../../data/defaultScenario'
import { VISIBLE_PRODUCTS_BY_PATH } from '../../../content/triggers'
import type { BasicInputs, PathSpecific } from './shared'
import type { PersonalProfile, ScenarioAssumptions } from '../../../domain'

// ---------------------------------------------------------------------------
// Replicate the applyAndComplete logic for the low_income_parent path.
// This mirrors GuidedSetup.tsx without pulling in React.
// ---------------------------------------------------------------------------

function applyLowIncomeParent(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  basics: BasicInputs,
  extras: PathSpecific,
): { profile: PersonalProfile; assumptions: ScenarioAssumptions } {
  const childBirthYears = [extras.childBirthYear1, extras.childBirthYear2, extras.childBirthYear3]
    .filter((y) => y > 0)

  const nextProfile: PersonalProfile = {
    ...profile,
    age: basics.age,
    retirementAge: basics.retirementAge,
    grossSalaryYear: basics.grossSalaryYear,
    publicHealthInsurance: basics.publicHealthInsurance,
    childBirthYears,
  }

  const nextAssumptions: ScenarioAssumptions = {
    ...assumptions,
    visibleProducts: VISIBLE_PRODUCTS_BY_PATH['low_income_parent'],
    riester: {
      ...assumptions.riester,
      monthlyOwnContribution: Math.max(10, Math.min(extras.tightBudgetMonthly, 200)),
      eligibility: {
        ...assumptions.riester.eligibility,
        directlyEligible: true,
      },
    },
    statutoryPension: {
      ...assumptions.statutoryPension,
      pensionBaselineType: assumptions.statutoryPension.pensionBaselineType ?? 'grv',
    },
  }

  return { profile: nextProfile, assumptions: nextAssumptions }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LowIncomeParentWizard workspace shape — Lena (33, Erzieherin, 60%, 2 Kinder)', () => {
  const basics: BasicInputs = {
    age: 33,
    retirementAge: 67,
    grossSalaryYear: 22_000,
    publicHealthInsurance: true,
  }

  const extras: PathSpecific = {
    // bav_offer / etf / rentengap fields (unused in this path)
    bavGrossConversion: 0,
    bavTotalMatchPct: 15,
    etfTerPct: 0.2,
    yearsWorked: 0,
    desiredNetMonthlyPension: 0,
    // low_income_parent fields
    partTimePct: 60,
    tightBudgetMonthly: 100,
    childBirthYear1: 2020,
    childBirthYear2: 2023,
    childBirthYear3: 0,
    // beamter fields (unused)
    versorgungType: 'beamtenpension',
    estimatedBeamtenpensionMonthly: 0,
  }

  const { profile: outProfile, assumptions: outAssumptions } = applyLowIncomeParent(
    defaultProfile,
    defaultAssumptions,
    basics,
    extras,
  )

  it('profile has correct child birth years (no zeros)', () => {
    expect(outProfile.childBirthYears).toEqual([2020, 2023])
  })

  it('profile age and salary are set correctly', () => {
    expect(outProfile.age).toBe(33)
    expect(outProfile.grossSalaryYear).toBe(22_000)
  })

  it('visibleProducts includes riester, altersvorsorgedepot, etf', () => {
    expect(outAssumptions.visibleProducts).toContain('riester')
    expect(outAssumptions.visibleProducts).toContain('altersvorsorgedepot')
    expect(outAssumptions.visibleProducts).toContain('etf')
  })

  it('visibleProducts does NOT include bav or basisrente', () => {
    expect(outAssumptions.visibleProducts).not.toContain('bav')
    expect(outAssumptions.visibleProducts).not.toContain('basisrente')
  })

  it('riester.eligibility.directlyEligible is true (GRV employee)', () => {
    expect(outAssumptions.riester.eligibility.directlyEligible).toBe(true)
  })

  it('riester.monthlyOwnContribution is seeded from tightBudgetMonthly (clamped 10–200)', () => {
    // extras.tightBudgetMonthly = 100, so result should be 100
    expect(outAssumptions.riester.monthlyOwnContribution).toBe(100)
  })

  it('riester contribution clamped to 200 when budget exceeds 200', () => {
    const highBudgetExtras: PathSpecific = { ...extras, tightBudgetMonthly: 500 }
    const { assumptions } = applyLowIncomeParent(
      defaultProfile,
      defaultAssumptions,
      basics,
      highBudgetExtras,
    )
    expect(assumptions.riester.monthlyOwnContribution).toBe(200)
  })

  it('riester contribution clamped to 10 when budget is very low', () => {
    const lowBudgetExtras: PathSpecific = { ...extras, tightBudgetMonthly: 5 }
    const { assumptions } = applyLowIncomeParent(
      defaultProfile,
      defaultAssumptions,
      basics,
      lowBudgetExtras,
    )
    expect(assumptions.riester.monthlyOwnContribution).toBe(10)
  })

  it('pensionBaselineType remains grv (employee path)', () => {
    expect(outAssumptions.statutoryPension.pensionBaselineType).toBe('grv')
  })

  it('child birth year 3 being 0 means only 2 children in profile', () => {
    expect(outProfile.childBirthYears).toHaveLength(2)
  })
})
