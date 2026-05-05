import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { buildStateJson, parseStateFromJson } from '../storage'
import {
  validateAssumptions,
  validateProfile,
  validateReturnScenarios,
  validateState,
} from './scenarioSchema'

describe('validateProfile', () => {
  it('accepts the default profile', () => {
    expect(validateProfile(defaultProfile)).not.toBeNull()
  })

  it('rejects null/non-objects', () => {
    expect(validateProfile(null)).toBeNull()
    expect(validateProfile(42)).toBeNull()
    expect(validateProfile('x')).toBeNull()
  })

  it('rejects NaN/Infinity in numeric fields', () => {
    expect(validateProfile({ ...defaultProfile, age: Number.NaN })).toBeNull()
    expect(validateProfile({ ...defaultProfile, age: Number.POSITIVE_INFINITY })).toBeNull()
    expect(validateProfile({ ...defaultProfile, grossSalaryYear: Number.NaN })).toBeNull()
    expect(validateProfile({ ...defaultProfile, retirementAge: Number.NaN })).toBeNull()
    expect(validateProfile({ ...defaultProfile, healthAdditionalContributionPct: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('rejects negative age and negative salary', () => {
    expect(validateProfile({ ...defaultProfile, age: -1 })).toBeNull()
    expect(validateProfile({ ...defaultProfile, grossSalaryYear: -1 })).toBeNull()
  })

  it('rejects retirementAge < age', () => {
    expect(validateProfile({ ...defaultProfile, age: 70, retirementAge: 65 })).toBeNull()
  })

  it('rejects retirementAge > 120', () => {
    expect(validateProfile({ ...defaultProfile, retirementAge: 121 })).toBeNull()
  })

  it('rejects invalid childBirthYears', () => {
    // not an array
    expect(validateProfile({ ...defaultProfile, childBirthYears: 2 as unknown as number[] })).toBeNull()
    // birth year out of valid range
    expect(validateProfile({ ...defaultProfile, childBirthYears: [1800] })).toBeNull()
    // non-integer birth year
    expect(validateProfile({ ...defaultProfile, childBirthYears: [2005.5] })).toBeNull()
    // more than 20 children
    expect(validateProfile({ ...defaultProfile, childBirthYears: Array(21).fill(2000) })).toBeNull()
  })

  it('accepts valid childBirthYears including over-25 children', () => {
    expect(validateProfile({ ...defaultProfile, childBirthYears: [] })).not.toBeNull()
    expect(validateProfile({ ...defaultProfile, childBirthYears: [1990, 2010] })).not.toBeNull()
  })

  it('rejects taxClass !== 1', () => {
    expect(validateProfile({ ...defaultProfile, taxClass: 3 as unknown as 1 })).toBeNull()
  })

  it('rejects healthAdditionalContributionPct out of [0,10]', () => {
    expect(validateProfile({ ...defaultProfile, healthAdditionalContributionPct: -0.1 })).toBeNull()
    expect(validateProfile({ ...defaultProfile, healthAdditionalContributionPct: 10.5 })).toBeNull()
  })
})

describe('validateReturnScenarios', () => {
  it('accepts the default array', () => {
    expect(validateReturnScenarios(defaultAssumptions.returnScenarios)).not.toBeNull()
  })

  it('rejects non-arrays', () => {
    expect(validateReturnScenarios({})).toBeNull()
    expect(validateReturnScenarios(null)).toBeNull()
  })

  it('rejects empty arrays', () => {
    expect(validateReturnScenarios([])).toBeNull()
  })

  it('rejects arrays > 10', () => {
    const big = Array.from({ length: 11 }, (_, i) => ({
      id: 'basis',
      label: `s${i}`,
      annualReturn: 0.05,
    }))
    expect(validateReturnScenarios(big)).toBeNull()
  })

  it('rejects duplicate ids', () => {
    expect(
      validateReturnScenarios([
        { id: 'basis', label: 'a', annualReturn: 0.04 },
        { id: 'basis', label: 'b', annualReturn: 0.05 },
      ]),
    ).toBeNull()
  })

  it('rejects unknown ids', () => {
    expect(
      validateReturnScenarios([{ id: 'aggressiv', label: 'x', annualReturn: 0.05 }]),
    ).toBeNull()
  })

  it('rejects non-finite annualReturn', () => {
    expect(
      validateReturnScenarios([{ id: 'basis', label: 'b', annualReturn: Number.NaN }]),
    ).toBeNull()
    expect(
      validateReturnScenarios([{ id: 'basis', label: 'b', annualReturn: Number.POSITIVE_INFINITY }]),
    ).toBeNull()
  })

  it('rejects annualReturn out of [-0.5, 0.5]', () => {
    expect(
      validateReturnScenarios([{ id: 'basis', label: 'b', annualReturn: 0.51 }]),
    ).toBeNull()
    expect(
      validateReturnScenarios([{ id: 'basis', label: 'b', annualReturn: -0.51 }]),
    ).toBeNull()
  })

  it('rejects empty label', () => {
    expect(
      validateReturnScenarios([{ id: 'basis', label: '', annualReturn: 0.05 }]),
    ).toBeNull()
  })
})

describe('validateAssumptions', () => {
  it('accepts the default assumptions', () => {
    expect(validateAssumptions(defaultAssumptions)).not.toBeNull()
  })

  it('rejects inflationRate out of [-0.10, 0.20]', () => {
    expect(validateAssumptions({ ...defaultAssumptions, inflationRate: 0.21 })).toBeNull()
    expect(validateAssumptions({ ...defaultAssumptions, inflationRate: -0.11 })).toBeNull()
    expect(validateAssumptions({ ...defaultAssumptions, inflationRate: Number.NaN })).toBeNull()
  })

  it('rejects retirementEndAge > 120', () => {
    expect(validateAssumptions({ ...defaultAssumptions, retirementEndAge: 121 })).toBeNull()
  })

  it('rejects invalid Monte Carlo settings', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        monteCarlo: { ...defaultAssumptions.monteCarlo, runs: 99 },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        monteCarlo: { ...defaultAssumptions.monteCarlo, runs: 5001 },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        monteCarlo: { ...defaultAssumptions.monteCarlo, annualVolatility: 0.61 },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        monteCarlo: { ...defaultAssumptions.monteCarlo, seed: 0 },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        monteCarlo: { ...defaultAssumptions.monteCarlo, enabled: 'yes' as never },
      }),
    ).toBeNull()
  })

  it('rejects invalid capital guarantee settings', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        insurance: {
          ...defaultAssumptions.insurance,
          capitalGuarantee: {
            ...defaultAssumptions.insurance.capitalGuarantee,
            floorPctOfContributions: 1.01,
          },
        },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        riester: {
          ...defaultAssumptions.riester,
          capitalGuarantee: {
            ...defaultAssumptions.riester.capitalGuarantee,
            enabled: 'yes' as never,
          },
        },
      }),
    ).toBeNull()
  })

  it('rejects unknown equityPartialExemption', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        etf: { ...defaultAssumptions.etf, equityPartialExemption: 0.5 },
      }),
    ).toBeNull()
  })

  it('accepts each allowed equityPartialExemption', () => {
    for (const v of [0, 0.15, 0.3, 0.6, 0.8]) {
      expect(
        validateAssumptions({
          ...defaultAssumptions,
          etf: { ...defaultAssumptions.etf, equityPartialExemption: v },
        }),
      ).not.toBeNull()
    }
  })

  it('rejects fee > 0.5', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: {
          ...defaultAssumptions.bav,
          fees: { ...defaultAssumptions.bav.fees, wrapperAssetFee: 0.51 },
        },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        insurance: {
          ...defaultAssumptions.insurance,
          fees: { ...defaultAssumptions.insurance.fees, contributionFee: 0.51 },
        },
      }),
    ).toBeNull()
  })

  it('rejects negative fee', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: {
          ...defaultAssumptions.bav,
          fees: { ...defaultAssumptions.bav.fees, acquisitionCostPct: -0.01 },
        },
      }),
    ).toBeNull()
  })

  it('rejects acquisitionCostSpreadYears out of [1, 50] or non-integer', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: {
          ...defaultAssumptions.bav,
          fees: { ...defaultAssumptions.bav.fees, acquisitionCostSpreadYears: 0 },
        },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: {
          ...defaultAssumptions.bav,
          fees: { ...defaultAssumptions.bav.fees, acquisitionCostSpreadYears: 51 },
        },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: {
          ...defaultAssumptions.bav,
          fees: { ...defaultAssumptions.bav.fees, acquisitionCostSpreadYears: 5.5 },
        },
      }),
    ).toBeNull()
  })

  it('rejects unknown durchfuehrungsweg', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, durchfuehrungsweg: 'bogus' as never },
      }),
    ).toBeNull()
  })

  it('rejects contractualMatchPercent out of [0,1]', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, contractualMatchPercent: 1.01 },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, contractualMatchPercent: -0.01 },
      }),
    ).toBeNull()
  })

  it('rejects negative monthlyGrossConversion / contractualFixedMonthly / monthlyOtherRetirementIncome', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, monthlyGrossConversion: -1 },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, contractualFixedMonthly: -1 },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        insurance: { ...defaultAssumptions.insurance, monthlyOtherRetirementIncome: -1 },
      }),
    ).toBeNull()
  })

  it('#54: rejects unknown payoutMode for bAV or pAV', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, payoutMode: 'bogus' as never },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        insurance: { ...defaultAssumptions.insurance, payoutMode: 'bogus' as never },
      }),
    ).toBeNull()
  })

  it('#54: rejects rentenfaktor out of [0, 100]', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, rentenfaktor: -0.01 },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        insurance: { ...defaultAssumptions.insurance, rentenfaktor: 100.01 },
      }),
    ).toBeNull()
  })

  it('#54: rejects zeitrenteYears non-integer or out of [1, 50]', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, zeitrenteYears: 0 },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        insurance: { ...defaultAssumptions.insurance, zeitrenteYears: 51 },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, zeitrenteYears: 12.5 },
      }),
    ).toBeNull()
  })

  it('#51: rejects non-boolean statutoryMinimumSubsidyEnabled', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, statutoryMinimumSubsidyEnabled: 'yes' as never },
      }),
    ).toBeNull()
  })

  it('rejects contractStartYear out of [1900, 2100] or non-integer', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        insurance: { ...defaultAssumptions.insurance, contractStartYear: 1899 },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        insurance: { ...defaultAssumptions.insurance, contractStartYear: 2101 },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        insurance: { ...defaultAssumptions.insurance, contractStartYear: 2024.5 },
      }),
    ).toBeNull()
  })

  it('rejects NaN/Infinity in any nested numeric field', () => {
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        etf: { ...defaultAssumptions.etf, annualAssetFee: Number.NaN },
      }),
    ).toBeNull()
    expect(
      validateAssumptions({
        ...defaultAssumptions,
        bav: {
          ...defaultAssumptions.bav,
          fees: { ...defaultAssumptions.bav.fees, fixedMonthlyFee: Number.POSITIVE_INFINITY },
        },
      }),
    ).toBeNull()
  })
})

describe('validateState', () => {
  it('accepts default profile + default assumptions', () => {
    expect(validateState(defaultProfile, defaultAssumptions)).not.toBeNull()
  })

  it('rejects retirementEndAge <= retirementAge', () => {
    expect(
      validateState(
        { ...defaultProfile, retirementAge: 67 },
        { ...defaultAssumptions, retirementEndAge: 67 },
      ),
    ).toBeNull()
    expect(
      validateState(
        { ...defaultProfile, retirementAge: 67 },
        { ...defaultAssumptions, retirementEndAge: 60 },
      ),
    ).toBeNull()
  })

  it('rejects when either side is invalid', () => {
    expect(validateState({ ...defaultProfile, age: -1 }, defaultAssumptions)).toBeNull()
    expect(
      validateState(defaultProfile, { ...defaultAssumptions, inflationRate: Number.NaN }),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Storage / URL share integration: validation runs after mergeDeep
// ---------------------------------------------------------------------------

describe('parseStateFromJson + validation (#49)', () => {
  it('round-trips defaults non-null', () => {
    const raw = buildStateJson(defaultProfile, defaultAssumptions)
    const result = parseStateFromJson(raw)
    expect(result).not.toBeNull()
    expect(result!.profile).toEqual(defaultProfile)
    expect(result!.assumptions).toEqual(defaultAssumptions)
  })

  it('returns null for poisoned numeric (NaN serialises as null but bypassing JSON)', () => {
    // JSON.stringify converts NaN/Infinity to null. Build the string manually.
    const raw = `{"version":1,"profile":${JSON.stringify({ ...defaultProfile, age: 200 })},"assumptions":${JSON.stringify(defaultAssumptions)}}`
    expect(parseStateFromJson(raw)).toBeNull()
  })

  it('returns null when retirementEndAge <= retirementAge', () => {
    const raw = buildStateJson(
      { ...defaultProfile, retirementAge: 90 },
      { ...defaultAssumptions, retirementEndAge: 80 },
    )
    expect(parseStateFromJson(raw)).toBeNull()
  })

  it('returns null when fee is out of range', () => {
    const raw = buildStateJson(defaultProfile, {
      ...defaultAssumptions,
      bav: {
        ...defaultAssumptions.bav,
        fees: { ...defaultAssumptions.bav.fees, wrapperAssetFee: 0.6 },
      },
    })
    expect(parseStateFromJson(raw)).toBeNull()
  })

  it('returns null for unknown equityPartialExemption', () => {
    const raw = buildStateJson(defaultProfile, {
      ...defaultAssumptions,
      etf: { ...defaultAssumptions.etf, equityPartialExemption: 0.42 },
    })
    expect(parseStateFromJson(raw)).toBeNull()
  })

  it('normalizes saved returnScenarios back to the canonical three baseline rows', () => {
    // The editor no longer exposes the baseline rates; storage forces them to the
    // canonical rates/labels on load so legacy tweaks don't survive.
    const raw = buildStateJson(defaultProfile, {
      ...defaultAssumptions,
      returnScenarios: [
        { id: 'basis', label: 'a', annualReturn: 0.04 },
        { id: 'basis', label: 'b', annualReturn: 0.05 },
      ],
    })
    const parsed = parseStateFromJson(raw)
    expect(parsed).not.toBeNull()
    expect(parsed?.assumptions.returnScenarios).toEqual(defaultAssumptions.returnScenarios)
  })

  it('preserves legacy equal-cash saves as bAV-net anchored instead of injecting the default 200 EUR anchor', () => {
    const legacyAssumptions = {
      ...defaultAssumptions,
      compareSubMode: 'equal_cash',
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 500 },
    } as Record<string, unknown>
    delete legacyAssumptions.equalInputAmountEUR
    const raw = JSON.stringify({
      version: 1,
      profile: defaultProfile,
      assumptions: legacyAssumptions,
    })

    const parsed = parseStateFromJson(raw)

    expect(parsed).not.toBeNull()
    expect(parsed?.assumptions.compareSubMode).toBe('equal_cash')
    expect(parsed?.assumptions.equalInputAmountEUR).toBeUndefined()
  })

  it('preserves a saved custom return scenario alongside the canonical baselines', () => {
    const raw = buildStateJson(defaultProfile, {
      ...defaultAssumptions,
      returnScenarios: [
        ...defaultAssumptions.returnScenarios,
        { id: 'custom', label: 'Eigene Annahme', annualReturn: 0.045 },
      ],
    })
    const parsed = parseStateFromJson(raw)
    expect(parsed?.assumptions.returnScenarios).toEqual([
      ...defaultAssumptions.returnScenarios,
      { id: 'custom', label: 'Eigene Annahme', annualReturn: 0.045 },
    ])
  })

  it('returns null for unknown durchfuehrungsweg in saved state', () => {
    const raw = `{"version":1,"profile":${JSON.stringify(defaultProfile)},"assumptions":${JSON.stringify({
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, durchfuehrungsweg: 'bogus' },
    })}}`
    expect(parseStateFromJson(raw)).toBeNull()
  })
})

describe('URL share round-trip parity (#49)', () => {
  // urlShare.ts is a thin base64url wrapper around parseStateFromJson.
  // Replicate the encoding here so tests don't need a window/DOM.
  function toBase64Url(json: string): string {
    const bytes = new TextEncoder().encode(json)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  }
  function fromBase64Url(encoded: string): string {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  }

  it('clean URL → defaults', () => {
    const encoded = toBase64Url(buildStateJson(defaultProfile, defaultAssumptions))
    const result = parseStateFromJson(fromBase64Url(encoded))
    expect(result).not.toBeNull()
    expect(result!.profile).toEqual(defaultProfile)
  })

  it('URL with poisoned numeric → null', () => {
    const poisoned = `{"version":1,"profile":${JSON.stringify({ ...defaultProfile, age: -5 })},"assumptions":${JSON.stringify(defaultAssumptions)}}`
    const encoded = toBase64Url(poisoned)
    const result = parseStateFromJson(fromBase64Url(encoded))
    expect(result).toBeNull()
  })
})
