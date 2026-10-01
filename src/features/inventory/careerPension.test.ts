/**
 * Career-based pension estimate (state contract §7).
 *
 * Two things are pinned here: impossible ranges are rejected rather than
 * clipped, and the Entgeltpunkte come from the active rule set — the same
 * `durchschnittsentgelt` the engine divides by in `engine/grv.ts`.
 */

import { describe, expect, it } from 'vitest'
import { de2026Rules } from '../../rules/de2026'
import { estimateCareerPension, estimateEpFromYears } from './inventoryHelpers'

describe('estimateEpFromYears — rules-backed', () => {
  it('uses the active Durchschnittsentgelt, not the obsolete 47 079 literal', () => {
    const { durchschnittsentgelt } = de2026Rules.socialSecurity
    expect(durchschnittsentgelt).toBe(51_944)
    // 50 000 EUR/yr for 40 years, per the worked example in the state contract:
    // 0.962575 EP/yr → 38.5030 EP (the old literal produced 42.4818).
    const ep = estimateEpFromYears(40, 50_000)
    expect(ep).toBeCloseTo(40 * (50_000 / durchschnittsentgelt), 6)
    expect(ep).toBeCloseTo(38.503, 3)
  })

  it('caps the salary at the Beitragsbemessungsgrenze', () => {
    const cap = de2026Rules.socialSecurity.pensionCapYear
    expect(estimateEpFromYears(1, cap)).toBeCloseTo(estimateEpFromYears(1, cap * 2), 9)
  })

  it('honours an injected rule set', () => {
    const rules = {
      ...de2026Rules,
      socialSecurity: { ...de2026Rules.socialSecurity, durchschnittsentgelt: 40_000 },
    }
    expect(estimateEpFromYears(2, 40_000, rules)).toBeCloseTo(2, 9)
  })
})

describe('estimateCareerPension', () => {
  it('derives contribution years as age − start − pauses', () => {
    const r = estimateCareerPension({
      currentAge: 45,
      careerStartAge: 22,
      pauseYears: 3,
      grossSalaryYear: 50_000,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.contributionYears).toBe(20)
    expect(r.entgeltpunkte).toBeCloseTo(
      20 * (50_000 / de2026Rules.socialSecurity.durchschnittsentgelt),
      9,
    )
    expect(r.monthlyGrossEUR).toBeCloseTo(
      r.entgeltpunkte * de2026Rules.socialSecurity.aktuellerRentenwert,
      9,
    )
    expect(r.assumptions).toEqual({
      durchschnittsentgelt: de2026Rules.socialSecurity.durchschnittsentgelt,
      beitragsbemessungsgrenze: de2026Rules.socialSecurity.pensionCapYear,
      aktuellerRentenwert: de2026Rules.socialSecurity.aktuellerRentenwert,
    })
  })

  it('treats omitted pauses as zero', () => {
    const r = estimateCareerPension({ currentAge: 40, careerStartAge: 20, grossSalaryYear: 50_000 })
    expect(r.ok && r.contributionYears).toBe(20)
  })

  it('rejects a career start in the future — never clips it', () => {
    expect(
      estimateCareerPension({ currentAge: 30, careerStartAge: 35, grossSalaryYear: 50_000 }),
    ).toEqual({ ok: false, code: 'start-after-now' })
  })

  it('rejects an implausibly young career start', () => {
    expect(
      estimateCareerPension({ currentAge: 30, careerStartAge: 9, grossSalaryYear: 50_000 }),
    ).toEqual({ ok: false, code: 'start-after-now' })
  })

  it('rejects pauses longer than the career', () => {
    expect(
      estimateCareerPension({
        currentAge: 30,
        careerStartAge: 25,
        pauseYears: 6,
        grossSalaryYear: 50_000,
      }),
    ).toEqual({ ok: false, code: 'pauses-exceed-career' })
    expect(
      estimateCareerPension({
        currentAge: 30,
        careerStartAge: 25,
        pauseYears: -1,
        grossSalaryYear: 50_000,
      }),
    ).toEqual({ ok: false, code: 'pauses-exceed-career' })
  })

  it('rejects a missing salary', () => {
    expect(
      estimateCareerPension({ currentAge: 40, careerStartAge: 20, grossSalaryYear: 0 }),
    ).toEqual({ ok: false, code: 'no-salary' })
  })

  it('allows a zero-year career (started this year) without failing', () => {
    const r = estimateCareerPension({
      currentAge: 25,
      careerStartAge: 25,
      grossSalaryYear: 50_000,
    })
    expect(r.ok).toBe(true)
    expect(r.ok && r.contributionYears).toBe(0)
    expect(r.ok && r.entgeltpunkte).toBe(0)
  })
})
