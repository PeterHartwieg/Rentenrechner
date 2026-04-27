import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import { buildStateJson, parseStateFromJson } from './storage'

describe('parseStateFromJson (#40)', () => {
  it('returns null for non-JSON input', () => {
    expect(parseStateFromJson('not json')).toBeNull()
    expect(parseStateFromJson('')).toBeNull()
    expect(parseStateFromJson('{bad}')).toBeNull()
  })

  it('returns null for JSON null / primitives / arrays', () => {
    expect(parseStateFromJson('null')).toBeNull()
    expect(parseStateFromJson('42')).toBeNull()
    expect(parseStateFromJson('[]')).toBeNull()
  })

  it('returns null when version field is missing', () => {
    const raw = JSON.stringify({ profile: defaultProfile, assumptions: defaultAssumptions })
    expect(parseStateFromJson(raw)).toBeNull()
  })

  it('returns null for unknown future version', () => {
    const raw = JSON.stringify({ version: 999, profile: defaultProfile, assumptions: defaultAssumptions })
    expect(parseStateFromJson(raw)).toBeNull()
  })

  it('returns null when profile is missing', () => {
    const raw = JSON.stringify({ version: 1, assumptions: defaultAssumptions })
    expect(parseStateFromJson(raw)).toBeNull()
  })

  it('returns null when assumptions is missing', () => {
    const raw = JSON.stringify({ version: 1, profile: defaultProfile })
    expect(parseStateFromJson(raw)).toBeNull()
  })

  it('round-trips a valid state through buildStateJson → parseStateFromJson', () => {
    const raw = buildStateJson(defaultProfile, defaultAssumptions)
    const result = parseStateFromJson(raw)
    expect(result).not.toBeNull()
    expect(result!.profile).toEqual(defaultProfile)
    expect(result!.assumptions).toEqual(defaultAssumptions)
  })

  it('fills missing nested fee fields from defaults', () => {
    // Simulate a saved state where bav.fees is missing fixedMonthlyFee
    // Cast to unknown then BavAssumptions to represent intentionally incomplete saved data
    const partial = {
      ...defaultAssumptions.bav,
      fees: { annualAssetFee: 0.01, contributionFee: 0.02, acquisitionCostPct: 0.03, acquisitionCostSpreadYears: 5 },
    } as unknown as typeof defaultAssumptions.bav
    const raw = buildStateJson(defaultProfile, { ...defaultAssumptions, bav: partial })
    const result = parseStateFromJson(raw)
    expect(result).not.toBeNull()
    // Missing fixedMonthlyFee should fall back to the default value
    expect(result!.assumptions.bav.fees.fixedMonthlyFee).toBe(defaultAssumptions.bav.fees.fixedMonthlyFee)
    // Present fields are preserved
    expect(result!.assumptions.bav.fees.annualAssetFee).toBe(0.01)
  })

  it('preserves user-customized values in a valid saved state', () => {
    const modified = { ...defaultProfile, age: 35, children: 2, grossSalaryYear: 90_000 }
    const raw = buildStateJson(modified, defaultAssumptions)
    const result = parseStateFromJson(raw)
    expect(result!.profile.age).toBe(35)
    expect(result!.profile.children).toBe(2)
    expect(result!.profile.grossSalaryYear).toBe(90_000)
  })

  it('falls back to default when a field has the wrong type', () => {
    // grossSalaryYear saved as string instead of number
    const badProfile = { ...defaultProfile, grossSalaryYear: 'oops' }
    const raw = JSON.stringify({ version: 1, profile: badProfile, assumptions: defaultAssumptions })
    const result = parseStateFromJson(raw)
    expect(result).not.toBeNull()
    expect(result!.profile.grossSalaryYear).toBe(defaultProfile.grossSalaryYear)
  })
})
