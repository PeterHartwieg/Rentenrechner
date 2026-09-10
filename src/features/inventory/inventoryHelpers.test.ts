import { describe, expect, it } from 'vitest'
import type { StatutoryPensionAssumptions } from '../../domain'
import type { InputStatus, PensionEntryMethod } from '../../domain/inputStatus'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import { legacyEpSeedDurchschnittsentgelt, legacyEpSeedPensionCapYear } from '../../rules/legacyArtefacts'
import { detectLegacyEpSeed, estimateEpFromYears } from './inventoryHelpers'

describe('detectLegacyEpSeed', () => {
  const profile = { ...defaultProfile, age: 45, grossSalaryYear: 50_000 }
  const years = 20
  const oldSeed = years * profile.grossSalaryYear / legacyEpSeedDurchschnittsentgelt
  const freshEstimate = estimateEpFromYears(years, profile.grossSalaryYear, de2026Rules)
  const methods: PensionEntryMethod[] = [
    { kind: 'years', contributionYears: years },
    { kind: 'career', careerStartAge: 22, pauseYears: 3 },
  ]

  function detect(
    currentEntgeltpunkte: number,
    pensionEntryMethod: PensionEntryMethod | undefined = methods[0],
    overrides: Partial<StatutoryPensionAssumptions> = {},
  ) {
    return detectLegacyEpSeed({
      statutoryPension: {
        ...defaultAssumptions.statutoryPension,
        pensionEntryMethod,
        currentEntgeltpunkte,
        ...overrides,
      },
      profile,
      rules: de2026Rules,
    })
  }

  it.each(methods)('detects an exact old seed for $kind', (method) => {
    expect(detect(oldSeed, method)).toEqual({ legacy: true, freshEstimate })
  })

  it.each(methods)('ignores a seed behind a manual gross override for $kind', (method) => {
    // The projection ignores Entgeltpunkte while manualMonthlyGross is in
    // effect, so a re-estimate would change nothing the user sees.
    expect(detect(oldSeed, method, { manualMonthlyGross: 1500 })).toEqual({ legacy: false })
  })

  it.each(methods)('ignores a seed behind an explicit zero manual gross for $kind', (method) => {
    // Manual mode keys off `!== null`, not `> 0` — selecting "Manuell
    // eingegeben" stores 0, so the projection still ignores Entgeltpunkte.
    expect(detect(oldSeed, method, { manualMonthlyGross: 0 })).toEqual({ legacy: false })
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
        currentEntgeltpunkte: years * cap / legacyEpSeedDurchschnittsentgelt,
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
          durchschnittsentgelt: legacyEpSeedDurchschnittsentgelt * 1.004,
        },
      },
    })).toEqual({ legacy: false })
  })

  it('ignores a zero-year seed', () => {
    expect(detect(0, { kind: 'years', contributionYears: 0 })).toEqual({ legacy: false })
  })

  // Payloads saved before `pensionEntryMethod` existed: the wizard seeded EP
  // from an integer year count and persisted nothing else, so the year count
  // has to be recovered by inverting the defective estimator.
  describe('without a recorded pensionEntryMethod', () => {
    const years = 20

    interface LegacyOverrides {
      currentEntgeltpunkte?: number
      manualMonthlyGross?: number | null
      pensionBaselineType?: 'beamtenpension'
    }

    function legacyPayload(grossSalaryYear: number, overrides: LegacyOverrides = {}) {
      return {
        ...defaultAssumptions.statutoryPension,
        pensionEntryMethod: undefined,
        // Same operation order as the pre-#394 estimator — the seed is matched
        // bit-exactly now, so the order matters.
        currentEntgeltpunkte:
          years * (Math.min(grossSalaryYear, legacyEpSeedPensionCapYear) /
            legacyEpSeedDurchschnittsentgelt),
        ...overrides,
      }
    }

    function detectAbsent(
      grossSalaryYear: number,
      overrides?: LegacyOverrides,
      inputStatus?: Record<string, InputStatus>,
    ) {
      return detectLegacyEpSeed({
        statutoryPension: legacyPayload(grossSalaryYear, overrides),
        profile: { ...profile, grossSalaryYear },
        rules: de2026Rules,
        inputStatus,
      })
    }

    it('recognises a historical payload whose only trace is the seeded Entgeltpunkte', () => {
      expect(detectAbsent(50_000)).toEqual({
        legacy: true,
        freshEstimate: estimateEpFromYears(years, 50_000, de2026Rules),
      })
    })

    it('ignores a seed behind a manual gross override even without a recorded method', () => {
      // Same guard as the recorded-method branch: the manual figure wins in
      // the projection, so the stored seed cannot influence any shown number.
      expect(detectAbsent(50_000, { manualMonthlyGross: 1500 })).toEqual({ legacy: false })
    })

    it('ignores a seed behind an explicit zero manual gross even without a recorded method', () => {
      expect(detectAbsent(50_000, { manualMonthlyGross: 0 })).toEqual({ legacy: false })
    })

    it('recovers the year count for salaries above the legacy cap', () => {
      const result = detectAbsent(150_000)
      expect(result).toEqual({
        legacy: true,
        freshEstimate: estimateEpFromYears(years, 150_000, de2026Rules),
      })
    })

    it('detects a seed written from fractional contribution years (the old wizard never quantised)', () => {
      const seed = 12.5 * (Math.min(50_000, legacyEpSeedPensionCapYear) /
        legacyEpSeedDurchschnittsentgelt)
      const result = detectAbsent(50_000, { currentEntgeltpunkte: seed })
      expect(result).toEqual({
        legacy: true,
        freshEstimate: estimateEpFromYears(12.5, 50_000, de2026Rules),
      })
    })

    it('still detects a seed that has been through a JSON round-trip', () => {
      const stored = JSON.parse(JSON.stringify(
        years * (Math.min(50_000, legacyEpSeedPensionCapYear) /
          legacyEpSeedDurchschnittsentgelt),
      )) as number
      expect(detectAbsent(50_000, { currentEntgeltpunkte: stored })).toEqual({
        legacy: true,
        freshEstimate: estimateEpFromYears(years, 50_000, de2026Rules),
      })
    })

    it('accepts the exact value the old estimator wrote for the recovered year count', () => {
      const seedYears = 39
      const stored =
        seedYears * (Math.min(81_000, legacyEpSeedPensionCapYear) /
          legacyEpSeedDurchschnittsentgelt)
      expect(detectAbsent(81_000, { currentEntgeltpunkte: stored })).toEqual({
        legacy: true,
        freshEstimate: estimateEpFromYears(seedYears, 81_000, de2026Rules),
      })
    })

    it('ignores a hand-typed value that inverts to a near-integer year count', () => {
      // Reviewer counterexample against the former 1e-6 drift band: 67.1 is a
      // hand-typed Entgeltpunkte figure, yet it inverts to 39.0000111 years.
      // Only the exact old-estimator value may pass now.
      expect(detectAbsent(81_000, { currentEntgeltpunkte: 67.1 })).toEqual({ legacy: false })
    })

    it('ignores Entgeltpunkte the user entered', () => {
      expect(detectAbsent(50_000, undefined, {
        'statutoryPension.currentEntgeltpunkte': 'entered',
      })).toEqual({ legacy: false })
    })

    it('ignores Entgeltpunkte read off a document', () => {
      expect(detectAbsent(50_000, undefined, {
        'statutoryPension.currentEntgeltpunkte': 'document',
      })).toEqual({ legacy: false })
    })

    it('ignores a value whose implied year count is not an integer', () => {
      expect(detectAbsent(50_000, { currentEntgeltpunkte: 23.7 })).toEqual({ legacy: false })
    })

    it('ignores non-GRV baselines — they have no Entgeltpunkte equivalent', () => {
      expect(detectAbsent(50_000, { pensionBaselineType: 'beamtenpension' })).toEqual({ legacy: false })
    })

    it('goes quiet once the fresh estimate has been applied', () => {
      const result = detectAbsent(50_000)
      if (!result.legacy) throw new Error('expected the historical payload to be detected')
      expect(detectAbsent(50_000, { currentEntgeltpunkte: result.freshEstimate }))
        .toEqual({ legacy: false })
    })
  })
})
