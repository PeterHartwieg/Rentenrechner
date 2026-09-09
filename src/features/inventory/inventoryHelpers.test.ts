import { describe, expect, it } from 'vitest'
import type { PensionEntryMethod } from '../../domain/inputStatus'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import { legalConstants } from '../../rules/legalConstants'
import { detectLegacyEpSeed, estimateEpFromYears } from './inventoryHelpers'

describe('detectLegacyEpSeed', () => {
  const profile = { ...defaultProfile, age: 45, grossSalaryYear: 50_000 }
  const years = 20
  const oldSeed = years * profile.grossSalaryYear / legalConstants.legacyEpSeedDurchschnittsentgelt
  const freshEstimate = estimateEpFromYears(years, profile.grossSalaryYear, de2026Rules)
  const methods: PensionEntryMethod[] = [
    { kind: 'years', contributionYears: years },
    { kind: 'career', careerStartAge: 22, pauseYears: 3 },
  ]

  function detect(currentEntgeltpunkte: number, pensionEntryMethod: PensionEntryMethod | undefined = methods[0]) {
    return detectLegacyEpSeed({
      statutoryPension: { ...defaultAssumptions.statutoryPension, pensionEntryMethod, currentEntgeltpunkte },
      profile,
      rules: de2026Rules,
    })
  }

  it.each(methods)('detects an exact old seed for $kind', (method) => {
    expect(detect(oldSeed, method)).toEqual({ legacy: true, freshEstimate })
  })

  it.each(methods)('ignores a fresh seed for $kind', (method) => {
    expect(detect(freshEstimate, method)).toEqual({ legacy: false })
  })

  it('ignores manually entered points even when they match the old seed', () => {
    expect(detect(oldSeed, { kind: 'points', entgeltpunkte: oldSeed })).toEqual({ legacy: false })
  })

  it.each([0.996, 1.004])('accepts a seed within the relative tolerance (%s)', (factor) => {
    expect(detect(oldSeed * factor)).toEqual({ legacy: true, freshEstimate })
  })

  it.each([0.994, 1.006])('ignores a seed outside the relative tolerance (%s)', (factor) => {
    expect(detect(oldSeed * factor)).toEqual({ legacy: false })
  })

  it('caps salary at the active BBG for both estimates', () => {
    const cap = de2026Rules.socialSecurity.pensionCapYear
    const result = detectLegacyEpSeed({
      statutoryPension: {
        ...defaultAssumptions.statutoryPension,
        pensionEntryMethod: methods[0],
        currentEntgeltpunkte: years * cap / legalConstants.legacyEpSeedDurchschnittsentgelt,
      },
      profile: { ...profile, grossSalaryYear: cap * 2 },
      rules: de2026Rules,
    })
    expect(result).toEqual({
      legacy: true,
      freshEstimate: estimateEpFromYears(years, cap, de2026Rules),
    })
  })

  it('ignores a seed when the fresh estimate differs by less than the tolerance', () => {
    expect(detectLegacyEpSeed({
      statutoryPension: {
        ...defaultAssumptions.statutoryPension,
        pensionEntryMethod: methods[0],
        currentEntgeltpunkte: oldSeed,
      },
      profile,
      rules: {
        ...de2026Rules,
        socialSecurity: {
          ...de2026Rules.socialSecurity,
          durchschnittsentgelt: legalConstants.legacyEpSeedDurchschnittsentgelt * 1.004,
        },
      },
    })).toEqual({ legacy: false })
  })

  it('ignores a zero-year seed', () => {
    expect(detect(0, { kind: 'years', contributionYears: 0 })).toEqual({ legacy: false })
  })
})
