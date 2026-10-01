import { describe, it, expect } from 'vitest'
import type { Scenario } from '../../domain/workspace'
import { de2026Rules } from '../../rules/de2026'
import { estimateEpFromYears } from './inventoryHelpers'
import {
  activePensionFields,
  applyOnboardingToScenario,
  assumed,
  createFreshOnboardingScenario,
  defaultPensionSystemFor,
  documented,
  employmentChoosesPensionSystem,
  entered,
  estimateFromPensionDraft,
  fieldValue,
  markFieldUnknown,
  pensionDraftFromScenario,
  pensionMethodsForSystem,
  profileDraftFromScenario,
  setDraftFieldValue,
  setUnknown,
  setValue,
  unknownField,
  validatePensionDraft,
  validateProfileDraft,
  FRESH_ONBOARDING_INFLATION_RATE,
  REQUIRE_ENTERED_MESSAGE,
  type PensionDraft,
  type ProfileDraft,
} from './onboardingDraft'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function baseScenario(): Scenario {
  return createFreshOnboardingScenario(new Date('2026-01-01T00:00:00.000Z'))
}

function draftsOf(scenario: Scenario): { profile: ProfileDraft; pension: PensionDraft } {
  return {
    profile: profileDraftFromScenario(scenario),
    pension: pensionDraftFromScenario(scenario),
  }
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

describe('Field helpers', () => {
  it('entered / assumed / documented carry the value and their status', () => {
    expect(entered(42)).toEqual({ value: 42, status: 'entered' })
    expect(assumed(0)).toEqual({ value: 0, status: 'assumed' })
    expect(documented(1_800)).toEqual({ value: 1_800, status: 'document' })
  })

  it('a typed 0 is a real entered value, not an unknown', () => {
    const field = setValue(unknownField(500), 0)
    expect(field).toEqual({ value: 0, status: 'entered' })
    expect(fieldValue(field)).toBe(0)
  })

  it('setUnknown preserves the previous value', () => {
    expect(setUnknown(entered(500))).toEqual({
      value: null,
      status: 'unknown',
      previousValue: 500,
    })
  })

  it('setUnknown on an already-unknown field keeps the remembered value', () => {
    const once = setUnknown(entered(500))
    expect(setUnknown(once)).toEqual({ value: null, status: 'unknown', previousValue: 500 })
  })

  it('fieldValue is null exactly for an explicit unknown', () => {
    expect(fieldValue(entered(0))).toBe(0)
    expect(fieldValue(unknownField(7))).toBeNull()
  })

  it('marking one field unknown does not touch its neighbours', () => {
    const scenario = baseScenario()
    const { profile } = draftsOf(scenario)
    const withKnownSalary = setDraftFieldValue(profile, 'grossSalaryYear', 62_000)
    const next = markFieldUnknown(withKnownSalary, 'pkvMonthlyPremium')

    expect(next.pkvMonthlyPremium.status).toBe('unknown')
    expect(next.grossSalaryYear).toEqual({ value: 62_000, status: 'entered' })
    expect(next.age).toEqual(withKnownSalary.age)
    expect(next.retirementAge).toEqual(withKnownSalary.retirementAge)
    // The source draft is not mutated.
    expect(withKnownSalary.pkvMonthlyPremium.status).not.toBe('unknown')
  })

  it('setting a value back does not touch its neighbours either', () => {
    const { pension } = draftsOf(baseScenario())
    const withUnknownEp = markFieldUnknown(pension, 'entgeltpunkte')
    const next = setDraftFieldValue(withUnknownEp, 'contributionYears', 30)

    expect(next.contributionYears).toEqual({ value: 30, status: 'entered' })
    expect(next.entgeltpunkte.status).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// Employment → pension system
// ---------------------------------------------------------------------------

describe('employment → pension system defaults', () => {
  it('employees default to GRV and civil servants to Beamtenpension, with no choice', () => {
    expect(defaultPensionSystemFor('employee')).toBe('grv')
    expect(defaultPensionSystemFor('civil_servant')).toBe('beamtenpension')
    expect(employmentChoosesPensionSystem('employee')).toBe(false)
    expect(employmentChoosesPensionSystem('civil_servant')).toBe(false)
  })

  it('self-employed and "andere" pick their own system', () => {
    expect(employmentChoosesPensionSystem('self_employed')).toBe(true)
    expect(employmentChoosesPensionSystem('other')).toBe(true)
  })

  it('Entgeltpunkte methods exist only for the GRV', () => {
    expect(pensionMethodsForSystem('grv')).toContain('points')
    expect(pensionMethodsForSystem('versorgungswerk')).not.toContain('points')
    expect(pensionMethodsForSystem('beamtenpension')).not.toContain('career')
    expect(pensionMethodsForSystem('none')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Validation — reject, never clip
// ---------------------------------------------------------------------------

describe('validateProfileDraft', () => {
  it('accepts a plain, complete draft', () => {
    const { profile } = draftsOf(baseScenario())
    expect(validateProfileDraft(profile)).toEqual({})
  })

  it('rejects an out-of-range age instead of clipping it', () => {
    const { profile } = draftsOf(baseScenario())
    const tooYoung = setDraftFieldValue(profile, 'age', 12)
    const errors = validateProfileDraft(tooYoung)
    expect(errors.age).toMatch(/18/)
    // The draft still holds the rejected value, untouched.
    expect(fieldValue(tooYoung.age)).toBe(12)
  })

  it('rejects a retirement age at or before the current age', () => {
    const { profile } = draftsOf(baseScenario())
    const d = setDraftFieldValue(setDraftFieldValue(profile, 'age', 50), 'retirementAge', 50)
    expect(validateProfileDraft(d).retirementAge).toMatch(/nach deinem heutigen Alter/)
    expect(fieldValue(d.retirementAge)).toBe(50)
  })

  it('rejects a retirement age above 90', () => {
    const { profile } = draftsOf(baseScenario())
    const d = setDraftFieldValue(profile, 'retirementAge', 95)
    expect(validateProfileDraft(d).retirementAge).toMatch(/90/)
  })

  it('requires age and retirement age but allows an unknown PKV premium', () => {
    const { profile } = draftsOf(baseScenario())
    const noAge = markFieldUnknown(profile, 'age')
    expect(validateProfileDraft(noAge).age).toBeDefined()

    const pkv = markFieldUnknown(
      setDraftFieldValue(profile, 'publicHealthInsurance', false),
      'pkvMonthlyPremium',
    )
    expect(validateProfileDraft(pkv)).toEqual({})
  })
})

describe('validatePensionDraft', () => {
  it('rejects a career start below 14 or after today', () => {
    const scenario = baseScenario()
    const { profile, pension } = draftsOf(scenario)
    const p = setDraftFieldValue(profile, 'age', 40)
    const career: PensionDraft = { ...pension, method: 'career' as const }

    const tooEarly = setDraftFieldValue(career, 'careerStartAge', 10)
    expect(validatePensionDraft(tooEarly, p).careerStartAge).toMatch(/14/)
    expect(fieldValue(tooEarly.careerStartAge)).toBe(10)

    const tooLate = setDraftFieldValue(career, 'careerStartAge', 45)
    expect(validatePensionDraft(tooLate, p).careerStartAge).toBeDefined()
  })

  it('rejects pauses longer than the career span', () => {
    const { profile, pension } = draftsOf(baseScenario())
    const p = setDraftFieldValue(profile, 'age', 40)
    const d = setDraftFieldValue(
      setDraftFieldValue({ ...pension, method: 'career' as const }, 'careerStartAge', 25),
      'pauseYears',
      20,
    )
    expect(validatePensionDraft(d, p).pauseYears).toMatch(/15/)
    expect(fieldValue(d.pauseYears)).toBe(20)
  })

  it('accepts pauses exactly equal to the career span', () => {
    const { profile, pension } = draftsOf(baseScenario())
    const p = setDraftFieldValue(profile, 'age', 40)
    const d = setDraftFieldValue(
      setDraftFieldValue({ ...pension, method: 'career' as const }, 'careerStartAge', 25),
      'pauseYears',
      15,
    )
    expect(validatePensionDraft(d, p).pauseYears).toBeUndefined()
  })

  it('requires each method its own primary input', () => {
    const { profile, pension } = draftsOf(baseScenario())
    const doc = markFieldUnknown({ ...pension, method: 'document' as const }, 'monthlyGrossEUR')
    expect(validatePensionDraft(doc, profile).monthlyGrossEUR).toBeDefined()

    const skipped: PensionDraft = { ...doc, method: 'skipped' as const }
    expect(validatePensionDraft(skipped, profile)).toEqual({})
  })

  it('rejects a method the pension system does not support', () => {
    const { profile, pension } = draftsOf(baseScenario())
    const d: PensionDraft = { ...pension, system: 'beamtenpension', method: 'career' as const }
    expect(validatePensionDraft(d, profile).method).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Only the active method is validated
//
// The draft keeps every method's raw inputs simultaneously so switching back
// and forth loses nothing. A stale value left behind in a field the active
// method never reads must not block saving — the bug this section pins.
// ---------------------------------------------------------------------------

describe('validatePensionDraft — active method only', () => {
  /** A draft with something impossible in every single input field. */
  function garbageEverywhere(pension: PensionDraft): PensionDraft {
    let d = pension
    d = setDraftFieldValue(d, 'monthlyGrossEUR', 999_999)
    d = setDraftFieldValue(d, 'careerStartAge', 3)
    d = setDraftFieldValue(d, 'pauseYears', -5)
    d = setDraftFieldValue(d, 'contributionYears', 400)
    d = setDraftFieldValue(d, 'entgeltpunkte', 9_999)
    return d
  }

  it('„Später ergänzen“ validates clean with garbage in every inactive field', () => {
    const { profile, pension } = draftsOf(baseScenario())
    const p = setDraftFieldValue(profile, 'age', 40)
    const skipped: PensionDraft = { ...garbageEverywhere(pension), system: 'grv', method: 'skipped' }
    expect(validatePensionDraft(skipped, p)).toEqual({})
  })

  it('system „none“ validates clean with garbage in every field', () => {
    const { profile, pension } = draftsOf(baseScenario())
    const p = setDraftFieldValue(profile, 'age', 40)
    const none: PensionDraft = { ...garbageEverywhere(pension), system: 'none', method: 'skipped' }
    expect(validatePensionDraft(none, p)).toEqual({})
  })

  it('an active career method ignores an invalid contributionYears left in the years field', () => {
    const { profile, pension } = draftsOf(baseScenario())
    const p = setDraftFieldValue(profile, 'age', 40)
    let d: PensionDraft = { ...pension, system: 'grv', method: 'career' }
    d = setDraftFieldValue(d, 'careerStartAge', 25)
    d = setDraftFieldValue(d, 'pauseYears', 2)
    // The user typed this while on "Beitragsjahre" and then switched away.
    d = setDraftFieldValue(d, 'contributionYears', 400)

    const errors = validatePensionDraft(d, p)
    expect(errors.contributionYears).toBeUndefined()
    expect(errors).toEqual({})
  })

  it('switching the method surfaces only that method’s errors', () => {
    const { profile, pension } = draftsOf(baseScenario())
    const p = setDraftFieldValue(profile, 'age', 40)
    const base: PensionDraft = { ...garbageEverywhere(pension), system: 'grv' }

    const years = validatePensionDraft({ ...base, method: 'years' }, p)
    expect(Object.keys(years)).toEqual(['contributionYears'])

    const points = validatePensionDraft({ ...base, method: 'points' }, p)
    expect(Object.keys(points)).toEqual(['entgeltpunkte'])

    const doc = validatePensionDraft({ ...base, method: 'document' }, p)
    expect(Object.keys(doc)).toEqual(['monthlyGrossEUR'])

    const career = validatePensionDraft({ ...base, method: 'career' }, p)
    expect(Object.keys(career).sort()).toEqual(['careerStartAge', 'pauseYears'])
  })

  it('keeps the Versorgungswerk contributions active for every method it supports', () => {
    const { profile, pension } = draftsOf(baseScenario())
    const p = setDraftFieldValue(profile, 'age', 40)
    let d: PensionDraft = { ...pension, system: 'versorgungswerk', method: 'skipped' }
    d = setDraftFieldValue(d, 'versorgungswerkMonthlyContribution', 99_999)

    expect(validatePensionDraft(d, p).versorgungswerkMonthlyContribution).toBeDefined()
  })

  it('activePensionFields lists nothing for a complete non-answer', () => {
    expect(activePensionFields('none', 'skipped')).toEqual([])
    expect(activePensionFields('grv', 'skipped')).toEqual([])
    expect(activePensionFields('grv', 'career')).toEqual(['careerStartAge', 'pauseYears'])
  })
})

// ---------------------------------------------------------------------------
// Estimation
// ---------------------------------------------------------------------------

describe('estimateFromPensionDraft', () => {
  it('uses the rules-backed helper for the career method', () => {
    const { profile, pension } = draftsOf(baseScenario())
    const p = setDraftFieldValue(setDraftFieldValue(profile, 'age', 45), 'grossSalaryYear', 50_000)
    const d = setDraftFieldValue({ ...pension, method: 'career' as const }, 'careerStartAge', 25)

    const result = estimateFromPensionDraft(d, p)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.contributionYears).toBe(20)
    expect(result.entgeltpunkte).toBeCloseTo(estimateEpFromYears(20, 50_000), 10)
    // The corrected helper reads the active Durchschnittsentgelt, not the old 47_079 literal.
    expect(result.assumptions.durchschnittsentgelt).toBe(
      de2026Rules.socialSecurity.durchschnittsentgelt,
    )
    expect(result.monthlyGrossEUR).toBeCloseTo(
      result.entgeltpunkte! * de2026Rules.socialSecurity.aktuellerRentenwert,
      10,
    )
    expect(result.note).toMatch(/Renteninformation/)
  })

  it('rejects impossible career input with a code, not a clipped number', () => {
    const { profile, pension } = draftsOf(baseScenario())
    const p = setDraftFieldValue(setDraftFieldValue(profile, 'age', 30), 'grossSalaryYear', 50_000)
    const d = setDraftFieldValue(
      setDraftFieldValue({ ...pension, method: 'career' as const }, 'careerStartAge', 20),
      'pauseYears',
      25,
    )
    const result = estimateFromPensionDraft(d, p)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('pauses-exceed-career')
  })

  it('values direct Entgeltpunkte at the current Rentenwert without deriving years', () => {
    const { profile, pension } = draftsOf(baseScenario())
    const d = setDraftFieldValue({ ...pension, method: 'points' as const }, 'entgeltpunkte', 30)
    const result = estimateFromPensionDraft(d, profile)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.contributionYears).toBeNull()
    expect(result.monthlyGrossEUR).toBeCloseTo(
      30 * de2026Rules.socialSecurity.aktuellerRentenwert,
      10,
    )
  })

  it('is not estimable for a skipped step or for "keine Pflichtversorgung"', () => {
    const { profile, pension } = draftsOf(baseScenario())
    expect(estimateFromPensionDraft({ ...pension, method: 'skipped' as const }, profile).ok).toBe(false)
    expect(estimateFromPensionDraft({ ...pension, system: 'none' }, profile).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

describe('adapters — legacy scenario without metadata', () => {
  it('resolves every field to "assumed" and preserves the stored values', () => {
    const legacy: Scenario = baseScenario()
    legacy.profile = { ...legacy.profile, age: 41, grossSalaryYear: 63_000 }
    legacy.assumptions.statutoryPension = {
      ...legacy.assumptions.statutoryPension,
      currentEntgeltpunkte: 22.5,
      manualMonthlyGross: null,
    }
    delete legacy.assumptions.inputStatus

    const profile = profileDraftFromScenario(legacy)
    expect(profile.age).toEqual({ value: 41, status: 'assumed' })
    expect(profile.grossSalaryYear).toEqual({ value: 63_000, status: 'assumed' })
    expect(profile.pkvMonthlyPremium.status).toBe('assumed')

    const pension = pensionDraftFromScenario(legacy)
    // No pensionEntryMethod and no manual gross → the points path, conservatively assumed.
    expect(pension.method).toBe('points')
    expect(pension.entgeltpunkte).toEqual({ value: 22.5, status: 'assumed' })
  })

  it('infers projected-gross for a legacy manual override', () => {
    const legacy = baseScenario()
    legacy.assumptions.statutoryPension = {
      ...legacy.assumptions.statutoryPension,
      manualMonthlyGross: 1_450,
    }
    const pension = pensionDraftFromScenario(legacy)
    expect(pension.method).toBe('projected-gross')
    expect(pension.monthlyGrossEUR).toEqual({ value: 1_450, status: 'assumed' })
  })

  it('round-trips a legacy scenario without changing what it means', () => {
    const legacy = baseScenario()
    legacy.profile = { ...legacy.profile, age: 41, grossSalaryYear: 63_000 }
    legacy.assumptions.statutoryPension = {
      ...legacy.assumptions.statutoryPension,
      currentEntgeltpunkte: 22.5,
    }
    delete legacy.assumptions.inputStatus

    const { profile, pension } = draftsOf(legacy)
    const next = applyOnboardingToScenario(legacy, profile, pension)

    expect(next.profile.age).toBe(41)
    expect(next.profile.grossSalaryYear).toBe(63_000)
    expect(next.assumptions.statutoryPension.currentEntgeltpunkte).toBe(22.5)
    expect(next.assumptions.inputStatus?.['profile.age']).toBe('assumed')
    // The source scenario is untouched.
    expect(legacy.assumptions.inputStatus).toBeUndefined()
  })
})

describe('adapters — a fully entered scenario', () => {
  it('round-trips values and statuses', () => {
    const scenario = baseScenario()
    let { profile, pension } = draftsOf(scenario)
    profile = setDraftFieldValue(profile, 'age', 35)
    profile = setDraftFieldValue(profile, 'retirementAge', 67)
    profile = setDraftFieldValue(profile, 'grossSalaryYear', 58_000)
    profile = setDraftFieldValue(profile, 'desiredNetMonthlyPension', 2_100)
    pension = { ...pension, method: 'document' as const }
    pension = setDraftFieldValue(pension, 'monthlyGrossEUR', 1_820, 'document')

    const next = applyOnboardingToScenario(scenario, profile, pension)
    expect(next.profile.age).toBe(35)
    expect(next.profile.desiredNetMonthlyPension).toBe(2_100)
    expect(next.assumptions.statutoryPension.manualMonthlyGross).toBe(1_820)
    expect(next.assumptions.statutoryPension.pensionEntryMethod).toEqual({
      kind: 'document',
      monthlyGrossEUR: 1_820,
    })
    expect(next.assumptions.inputStatus).toMatchObject({
      'profile.age': 'entered',
      'profile.grossSalaryYear': 'entered',
      'statutoryPension.manualMonthlyGross': 'document',
      'statutoryPension.pensionBaselineType': 'entered',
    })

    // Re-reading the committed scenario reproduces the same drafts.
    const back = draftsOf(next)
    expect(back.profile.age).toEqual({ value: 35, status: 'entered' })
    expect(back.pension.method).toBe('document')
    expect(back.pension.monthlyGrossEUR).toEqual({ value: 1_820, status: 'document' })
  })

  it('carries the pass-through profile fields so editing never loses them', () => {
    const scenario = baseScenario()
    scenario.profile = {
      ...scenario.profile,
      taxClass: 3,
      churchTax: true,
      childBirthYears: [2015, 2019],
      healthAdditionalContributionPct: 3.4,
    }
    const { profile, pension } = draftsOf(scenario)
    const next = applyOnboardingToScenario(scenario, profile, pension)
    expect(next.profile.taxClass).toBe(3)
    expect(next.profile.churchTax).toBe(true)
    expect(next.profile.childBirthYears).toEqual([2015, 2019])
    expect(next.profile.healthAdditionalContributionPct).toBe(3.4)
  })
})

describe('adapters — unknown never becomes zero', () => {
  it('leaves the PKV engine value alone and records the status', () => {
    const scenario = baseScenario()
    scenario.profile = {
      ...scenario.profile,
      publicHealthInsurance: false,
      pkvMonthlyPremium: 520,
      pPVMonthlyPremium: 55,
    }
    let { profile } = draftsOf(scenario)
    const { pension } = draftsOf(scenario)
    profile = markFieldUnknown(profile, 'pkvMonthlyPremium')

    const next = applyOnboardingToScenario(scenario, profile, pension)
    expect(next.profile.pkvMonthlyPremium).toBe(520)
    expect(next.profile.pPVMonthlyPremium).toBe(55)
    expect(next.assumptions.inputStatus?.['profile.pkvMonthlyPremium']).toBe('unknown')
    expect(next.assumptions.inputStatus?.['profile.pPVMonthlyPremium']).not.toBe('unknown')
  })

  it('keeps the statutory engine values when the pension step is skipped', () => {
    const scenario = baseScenario()
    scenario.assumptions.statutoryPension = {
      ...scenario.assumptions.statutoryPension,
      currentEntgeltpunkte: 14,
    }
    const { profile, pension } = draftsOf(scenario)
    const next = applyOnboardingToScenario(scenario, profile, { ...pension, method: 'skipped' as const })

    expect(next.assumptions.statutoryPension.currentEntgeltpunkte).toBe(14)
    expect(next.assumptions.statutoryPension.pensionEntryMethod).toEqual({ kind: 'skipped' })
    expect(next.assumptions.inputStatus?.['statutoryPension.currentEntgeltpunkte']).toBe('unknown')
    expect(next.assumptions.inputStatus?.['statutoryPension.manualMonthlyGross']).toBe('unknown')
  })
})

describe('adapters — "none" and "skipped" are different answers', () => {
  it('"none" is an entered, complete answer with no entry method', () => {
    const scenario = baseScenario()
    const { profile, pension } = draftsOf(scenario)
    const next = applyOnboardingToScenario(scenario, profile, { ...pension, system: 'none' })

    expect(next.assumptions.statutoryPension.pensionBaselineType).toBe('none')
    expect(next.assumptions.statutoryPension.pensionEntryMethod).toBeUndefined()
    expect(next.assumptions.inputStatus?.['statutoryPension.pensionBaselineType']).toBe('entered')
    expect(next.assumptions.inputStatus?.['statutoryPension.currentEntgeltpunkte']).toBeUndefined()
  })

  it('a later "none" clears the stale unknown left by an earlier skip', () => {
    const scenario = baseScenario()
    const { profile, pension } = draftsOf(scenario)
    const skipped = applyOnboardingToScenario(scenario, profile, { ...pension, method: 'skipped' as const })
    expect(skipped.assumptions.inputStatus?.['statutoryPension.currentEntgeltpunkte']).toBe(
      'unknown',
    )

    const drafts = draftsOf(skipped)
    const none = applyOnboardingToScenario(skipped, drafts.profile, {
      ...drafts.pension,
      system: 'none',
    })
    expect(none.assumptions.inputStatus?.['statutoryPension.currentEntgeltpunkte']).toBeUndefined()
    expect(none.assumptions.inputStatus?.['statutoryPension.manualMonthlyGross']).toBeUndefined()
  })
})

describe('adapters — method semantics', () => {
  it('career seeds currentEntgeltpunkte as an assumption and records its inputs', () => {
    const scenario = baseScenario()
    let { profile, pension } = draftsOf(scenario)
    profile = setDraftFieldValue(profile, 'age', 45)
    profile = setDraftFieldValue(profile, 'grossSalaryYear', 50_000)
    pension = setDraftFieldValue({ ...pension, method: 'career' as const }, 'careerStartAge', 25)
    pension = setDraftFieldValue(pension, 'pauseYears', 2)

    const next = applyOnboardingToScenario(scenario, profile, pension)
    expect(next.assumptions.statutoryPension.currentEntgeltpunkte).toBeCloseTo(
      estimateEpFromYears(18, 50_000),
      10,
    )
    expect(next.assumptions.statutoryPension.manualMonthlyGross).toBeNull()
    expect(next.assumptions.statutoryPension.pensionEntryMethod).toEqual({
      kind: 'career',
      careerStartAge: 25,
      pauseYears: 2,
    })
    expect(next.assumptions.inputStatus?.['statutoryPension.currentEntgeltpunkte']).toBe('assumed')

    // Re-reading reproduces the career inputs, not just the resulting points.
    const back = pensionDraftFromScenario(next)
    expect(back.method).toBe('career')
    expect(fieldValue(back.careerStartAge)).toBe(25)
    expect(fieldValue(back.pauseYears)).toBe(2)
  })

  it('years and points stay distinct entry methods', () => {
    const scenario = baseScenario()
    let { profile, pension } = draftsOf(scenario)
    profile = setDraftFieldValue(profile, 'grossSalaryYear', 50_000)

    const years = applyOnboardingToScenario(
      scenario,
      profile,
      setDraftFieldValue({ ...pension, method: 'years' as const }, 'contributionYears', 20),
    )
    expect(years.assumptions.statutoryPension.pensionEntryMethod).toEqual({
      kind: 'years',
      contributionYears: 20,
    })
    expect(years.assumptions.statutoryPension.currentEntgeltpunkte).toBeCloseTo(
      estimateEpFromYears(20, 50_000),
      10,
    )

    pension = setDraftFieldValue({ ...pension, method: 'points' as const }, 'entgeltpunkte', 20)
    const points = applyOnboardingToScenario(scenario, profile, pension)
    expect(points.assumptions.statutoryPension.pensionEntryMethod).toEqual({
      kind: 'points',
      entgeltpunkte: 20,
    })
    // Points are the Entgeltpunkte themselves — not 20 years' worth of them.
    expect(points.assumptions.statutoryPension.currentEntgeltpunkte).toBe(20)
    expect(points.assumptions.inputStatus?.['statutoryPension.currentEntgeltpunkte']).toBe(
      'entered',
    )
  })

  it('writes the Versorgungswerk contributions only for that system', () => {
    const scenario = baseScenario()
    const { profile, pension } = draftsOf(scenario)
    const vw = setDraftFieldValue(
      { ...pension, system: 'versorgungswerk' as const, method: 'document' as const },
      'versorgungswerkMonthlyContribution',
      780,
    )
    const withGross = setDraftFieldValue(vw, 'monthlyGrossEUR', 2_400, 'document')
    const next = applyOnboardingToScenario(scenario, profile, withGross)

    expect(next.assumptions.statutoryPension.pensionBaselineType).toBe('versorgungswerk')
    expect(next.assumptions.statutoryPension.versorgungswerkMonthlyContribution).toBe(780)
    expect(next.assumptions.statutoryPension.manualMonthlyGross).toBe(2_400)
  })
})

// ---------------------------------------------------------------------------
// Fresh scenario
// ---------------------------------------------------------------------------

describe('createFreshOnboardingScenario', () => {
  it('marks nothing as entered and carries no contracts', () => {
    const scenario = createFreshOnboardingScenario()
    // The only seeded status is the inflation assumption — never an answer.
    expect(scenario.assumptions.inputStatus).toEqual({ 'assumptions.inflationRate': 'assumed' })
    expect(scenario.assumptions.bav).toEqual([])
    expect(scenario.assumptions.etf).toEqual([])
    expect(scenario.assumptions.visibleProducts).toEqual([])
    expect(scenario.origin).toBe('baseline')

    const { profile, pension } = draftsOf(scenario)
    for (const field of [profile.age, profile.grossSalaryYear, profile.retirementAge]) {
      expect(field.status).toBe('assumed')
    }
    expect(pension.entgeltpunkte.status).toBe('assumed')
  })

  it('does not share mutable structures between two fresh scenarios', () => {
    const a = createFreshOnboardingScenario()
    const b = createFreshOnboardingScenario()
    expect(a.id).not.toBe(b.id)
    a.profile.childBirthYears.push(2020)
    expect(b.profile.childBirthYears).toEqual([])
    a.assumptions.statutoryPension.currentEntgeltpunkte = 99
    expect(b.assumptions.statutoryPension.currentEntgeltpunkte).not.toBe(99)
  })
})

// ---------------------------------------------------------------------------
// requireEntered — onboarding mode rejects untouched defaults
// ---------------------------------------------------------------------------

describe('requireEntered', () => {
  it('rejects an assumed age and income, and clears once they are typed', () => {
    const { profile } = draftsOf(baseScenario())
    expect(profile.age.status).toBe('assumed')

    const errors = validateProfileDraft(profile, { requireEntered: true })
    expect(errors.age).toBe(REQUIRE_ENTERED_MESSAGE)
    expect(errors.grossSalaryYear).toBe(REQUIRE_ENTERED_MESSAGE)

    const answered = setDraftFieldValue(
      setDraftFieldValue(profile, 'age', 35),
      'grossSalaryYear',
      58_000,
    )
    expect(validateProfileDraft(answered, { requireEntered: true })).toEqual({})
  })

  it('leaves edit mode untouched — the same assumed draft still validates', () => {
    const { profile } = draftsOf(baseScenario())
    expect(validateProfileDraft(profile)).toEqual({})
    expect(validateProfileDraft(profile, { requireEntered: false })).toEqual({})
  })

  it('keeps the more specific range message instead of "Bitte eintragen."', () => {
    const { profile } = draftsOf(baseScenario())
    const tooYoung = setDraftFieldValue(profile, 'age', 12)
    expect(validateProfileDraft(tooYoung, { requireEntered: true }).age).not.toBe(
      REQUIRE_ENTERED_MESSAGE,
    )
  })

  it('does not require the optional profile fields', () => {
    const { profile } = draftsOf(baseScenario())
    const answered = setDraftFieldValue(
      setDraftFieldValue(profile, 'age', 35),
      'grossSalaryYear',
      58_000,
    )
    const errors = validateProfileDraft(answered, { requireEntered: true })
    expect(errors.retirementAge).toBeUndefined()
    expect(errors.desiredNetMonthlyPension).toBeUndefined()
    expect(errors.pkvMonthlyPremium).toBeUndefined()
  })

  it('rejects an explicit unknown on a required field too', () => {
    const { profile } = draftsOf(baseScenario())
    const declined = markFieldUnknown(setDraftFieldValue(profile, 'age', 35), 'grossSalaryYear')
    expect(validateProfileDraft(declined, { requireEntered: true }).grossSalaryYear).toBe(
      REQUIRE_ENTERED_MESSAGE,
    )
  })

  it('rejects the assumed career start, per method', () => {
    const scenario = baseScenario()
    const profile = setDraftFieldValue(profileDraftFromScenario(scenario), 'age', 35)
    const pension: PensionDraft = { ...pensionDraftFromScenario(scenario), method: 'career' }
    expect(pension.careerStartAge.status).toBe('assumed')

    expect(validatePensionDraft(pension, profile, { requireEntered: true }).careerStartAge).toBe(
      REQUIRE_ENTERED_MESSAGE,
    )
    // Edit mode keeps accepting the stored default.
    expect(validatePensionDraft(pension, profile).careerStartAge).toBeUndefined()

    const typed = setDraftFieldValue(pension, 'careerStartAge', 22)
    expect(validatePensionDraft(typed, profile, { requireEntered: true })).toEqual({})
    // Pauses are optional even in onboarding mode.
    expect(typed.pauseYears.status).toBe('assumed')
  })

  it('requires the active method\'s own input for years, points and gross', () => {
    const scenario = baseScenario()
    const profile = setDraftFieldValue(profileDraftFromScenario(scenario), 'age', 40)
    const base = pensionDraftFromScenario(scenario)

    const years: PensionDraft = { ...base, method: 'years' }
    expect(validatePensionDraft(years, profile, { requireEntered: true }).contributionYears).toBe(
      REQUIRE_ENTERED_MESSAGE,
    )

    const points: PensionDraft = { ...base, method: 'points' }
    expect(validatePensionDraft(points, profile, { requireEntered: true }).entgeltpunkte).toBe(
      REQUIRE_ENTERED_MESSAGE,
    )

    const document: PensionDraft = { ...base, method: 'document' }
    expect(validatePensionDraft(document, profile, { requireEntered: true }).monthlyGrossEUR).toBe(
      REQUIRE_ENTERED_MESSAGE,
    )
    // A figure read off the Renteninformation is an answer, not a default.
    const fromDocument = setDraftFieldValue(document, 'monthlyGrossEUR', 1_450, 'document')
    expect(validatePensionDraft(fromDocument, profile, { requireEntered: true })).toEqual({})
  })

  it('never requires anything for "Später ergänzen" or "keine Pflichtversorgung"', () => {
    const scenario = baseScenario()
    const profile = setDraftFieldValue(profileDraftFromScenario(scenario), 'age', 40)
    const base = pensionDraftFromScenario(scenario)

    const skipped: PensionDraft = { ...base, method: 'skipped' }
    expect(validatePensionDraft(skipped, profile, { requireEntered: true })).toEqual({})

    const none: PensionDraft = { ...base, system: 'none', method: 'points' }
    expect(validatePensionDraft(none, profile, { requireEntered: true })).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// Fresh-scenario inflation assumption
// ---------------------------------------------------------------------------

describe('fresh-scenario inflation assumption', () => {
  it('seeds 2 % and marks it assumed', () => {
    const scenario = createFreshOnboardingScenario()
    expect(FRESH_ONBOARDING_INFLATION_RATE).toBe(0.02)
    expect(scenario.assumptions.inflationRate).toBe(0.02)
    expect(scenario.assumptions.inputStatus?.['assumptions.inflationRate']).toBe('assumed')
  })

  it('committing does not touch the stored inflation rate', () => {
    const scenario = baseScenario()
    // A user who already set their own inflation assumption.
    const stored: Scenario = {
      ...scenario,
      assumptions: {
        ...scenario.assumptions,
        inflationRate: 0.035,
        inputStatus: { ...scenario.assumptions.inputStatus, 'assumptions.inflationRate': 'entered' },
      },
    }
    const { profile, pension } = draftsOf(stored)
    const next = applyOnboardingToScenario(
      stored,
      setDraftFieldValue(profile, 'age', 36),
      pension,
      de2026Rules,
    )

    expect(next.assumptions.inflationRate).toBe(0.035)
    expect(next.assumptions.inputStatus?.['assumptions.inflationRate']).toBe('entered')
    expect(next.profile.age).toBe(36)
  })
})
