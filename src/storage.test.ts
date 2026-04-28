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
    // Simulate a saved state where bav.fees is missing fixedMonthlyFee and pensionPayoutFeePct
    const partial = {
      ...defaultAssumptions.bav,
      fees: { wrapperAssetFee: 0.008, fundAssetFee: 0.002, contributionFee: 0.02, acquisitionCostPct: 0.03, acquisitionCostSpreadYears: 5 },
    } as unknown as typeof defaultAssumptions.bav
    const raw = buildStateJson(defaultProfile, { ...defaultAssumptions, bav: partial })
    const result = parseStateFromJson(raw)
    expect(result).not.toBeNull()
    // Missing fixedMonthlyFee should fall back to the default value
    expect(result!.assumptions.bav.fees.fixedMonthlyFee).toBe(defaultAssumptions.bav.fees.fixedMonthlyFee)
    // Present fields are preserved
    expect(result!.assumptions.bav.fees.wrapperAssetFee).toBe(0.008)
    expect(result!.assumptions.bav.fees.fundAssetFee).toBe(0.002)
  })

  it('preserves user-customized values in a valid saved state', () => {
    const modified = { ...defaultProfile, age: 35, childBirthYears: [2005, 2008], grossSalaryYear: 90_000 }
    const raw = buildStateJson(modified, defaultAssumptions)
    const result = parseStateFromJson(raw)
    expect(result!.profile.age).toBe(35)
    expect(result!.profile.childBirthYears).toEqual([2005, 2008])
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

  it('#48 migration: old saved state missing durchfuehrungsweg defaults to direktversicherung_3_63', () => {
    // Simulate a pre-#48 saved state where bav lacks the new fields
    const oldBav = {
      monthlyGrossConversion: 300,
      extraEmployerContributionPct: 0,
      extraEmployerContributionMonthly: 0,
      monthlyOtherRetirementIncome: 0,
      includeGrvReduction: false,
      kvdrMember: true,
      fees: defaultAssumptions.bav.fees,
      // durchfuehrungsweg and pre2005EligibleTaxFree are absent (old state)
    }
    const raw = JSON.stringify({ version: 1, profile: defaultProfile, assumptions: { ...defaultAssumptions, bav: oldBav } })
    const result = parseStateFromJson(raw)
    expect(result).not.toBeNull()
    // Missing fields should default to the defaultAssumptions values
    expect(result!.assumptions.bav.durchfuehrungsweg).toBe('direktversicherung_3_63')
    expect(result!.assumptions.bav.pre2005EligibleTaxFree).toBe(false)
  })

  it('#51 migration: legacy extraEmployerContribution* fields map to contractualMatchPercent / contractualFixedMonthly', () => {
    const oldBav = {
      monthlyGrossConversion: 300,
      extraEmployerContributionPct: 0.2,
      extraEmployerContributionMonthly: 25,
      monthlyOtherRetirementIncome: 0,
      includeGrvReduction: false,
      kvdrMember: true,
      durchfuehrungsweg: 'direktversicherung_3_63',
      pre2005EligibleTaxFree: false,
      fees: defaultAssumptions.bav.fees,
    }
    const raw = JSON.stringify({ version: 1, profile: defaultProfile, assumptions: { ...defaultAssumptions, bav: oldBav } })
    const result = parseStateFromJson(raw)
    expect(result).not.toBeNull()
    expect(result!.assumptions.bav.contractualMatchPercent).toBe(0.2)
    expect(result!.assumptions.bav.contractualFixedMonthly).toBe(25)
    expect(result!.assumptions.bav.statutoryMinimumSubsidyEnabled).toBe(true)
  })

  it('#55 migration: old annualAssetFee is moved to wrapperAssetFee, fundAssetFee defaults to 0', () => {
    // Simulate a pre-#55 saved state where fees use the old single annualAssetFee field
    const oldFees = {
      annualAssetFee: 0.008,
      contributionFee: 0.04,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
    }
    const oldBav = { ...defaultAssumptions.bav, fees: oldFees }
    const raw = JSON.stringify({ version: 1, profile: defaultProfile, assumptions: { ...defaultAssumptions, bav: oldBav } })
    const result = parseStateFromJson(raw)
    expect(result).not.toBeNull()
    // Old annualAssetFee value is preserved in wrapperAssetFee
    expect(result!.assumptions.bav.fees.wrapperAssetFee).toBe(0.008)
    // fundAssetFee defaults to 0 (not split automatically — user sets it explicitly)
    expect(result!.assumptions.bav.fees.fundAssetFee).toBe(0)
    // Other fields are preserved
    expect(result!.assumptions.bav.fees.contributionFee).toBe(0.04)
  })

  it('#55 migration: old annualAssetFee on insurance also migrates correctly', () => {
    const oldFees = {
      annualAssetFee: 0.014,
      contributionFee: 0.03,
      fixedMonthlyFee: 5,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
    }
    const oldInsurance = { ...defaultAssumptions.insurance, fees: oldFees }
    const raw = JSON.stringify({ version: 1, profile: defaultProfile, assumptions: { ...defaultAssumptions, insurance: oldInsurance } })
    const result = parseStateFromJson(raw)
    expect(result).not.toBeNull()
    expect(result!.assumptions.insurance.fees.wrapperAssetFee).toBe(0.014)
    expect(result!.assumptions.insurance.fees.fundAssetFee).toBe(0)
    expect(result!.assumptions.insurance.fees.fixedMonthlyFee).toBe(5)
  })
})
