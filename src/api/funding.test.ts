// @vitest-environment node
/**
 * Tests for the salary-phase funding API facade.
 */
import { describe, it, expect } from 'vitest'
import {
  calculateBavFundingApi,
  solveBavGrossFromNetApi,
  calculateBasisrenteFundingApi,
  calculateAvdFundingApi,
  calculateRiesterFundingApi,
} from './funding'
import type {
  BavFundingResponse,
  BasisrenteFundingResponse,
  AvdFundingResponse,
  RiesterFundingResponse,
} from './funding'
import { defaultProfile, defaultAssumptions, defaultAvdAssumptions, defaultRiesterAssumptions } from '../data/defaultScenario'

// ---------------------------------------------------------------------------
// 1. bAV funding with default profile produces expected structure
// ---------------------------------------------------------------------------

describe('calculateBavFundingApi', () => {
  it('succeeds with default profile and returns expected shape', () => {
    const result = calculateBavFundingApi({
      profile: defaultProfile,
      bav: defaultAssumptions.bav,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.meta.apiVersion).toBe('v1')
    expect(typeof result.meta.ruleYear).toBe('number')

    const d = result.data
    expect(typeof d.monthlyGrossConversion).toBe('number')
    expect(typeof d.monthlyNetCost).toBe('number')
    expect(typeof d.monthlyTaxAndSvSavings).toBe('number')
    expect(typeof d.monthlyStatutoryEmployerSubsidy).toBe('number')
    expect(typeof d.monthlyContractualEmployerContribution).toBe('number')
    expect(typeof d.monthlyEmployerContribution).toBe('number')
    expect(typeof d.estimatedMonthlyGrvReduction).toBe('number')
    expect(typeof d.taxFreePortionAnnual).toBe('number')
    expect(typeof d.svFreePortionAnnual).toBe('number')
    expect(typeof d.taxableOverflowAnnual).toBe('number')

    // Sanity: net cost should be positive and less than gross
    expect(d.monthlyNetCost).toBeGreaterThan(0)
    expect(d.monthlyNetCost).toBeLessThan(d.monthlyGrossConversion)
  })

  it('uses the profile tax class when calculating bAV net cost', () => {
    const classThree = calculateBavFundingApi({
      profile: { ...defaultProfile, taxClass: 3 as unknown as 1 },
      bav: defaultAssumptions.bav,
    })
    const classFive = calculateBavFundingApi({
      profile: { ...defaultProfile, taxClass: 5 as unknown as 1 },
      bav: defaultAssumptions.bav,
    })

    expect(classThree.ok).toBe(true)
    expect(classFive.ok).toBe(true)
    if (!classThree.ok || !classFive.ok) return

    expect(classFive.data.monthlyTaxAndSvSavings).toBeGreaterThan(
      classThree.data.monthlyTaxAndSvSavings,
    )
    expect(classFive.data.monthlyNetCost).toBeLessThan(classThree.data.monthlyNetCost)
  })

  it('exposes statutory employer subsidy uncapped amount, cap, and cap flag', () => {
    const result = calculateBavFundingApi({
      profile: { ...defaultProfile, grossSalaryYear: 150_000 },
      bav: {
        ...defaultAssumptions.bav,
        monthlyGrossConversion: 200,
        statutoryMinimumSubsidyEnabled: true,
        contractualMatchPercent: 0,
        contractualFixedMonthly: 0,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const d = result.data
    expect(d.monthlyStatutoryEmployerSubsidyUncapped).toBeCloseTo(30, 2)
    expect(d.monthlyStatutoryEmployerSubsidyCap).toBeCloseTo(0, 2)
    expect(d.monthlyStatutoryEmployerSubsidyCapApplied).toBe(true)
    expect(d.monthlyStatutoryEmployerSubsidy).toBeCloseTo(0, 2)
  })
})

// ---------------------------------------------------------------------------
// 2. bAV gross-from-net solve returns positive gross for positive net target
// ---------------------------------------------------------------------------

describe('solveBavGrossFromNetApi', () => {
  it('returns positive gross for positive net target', () => {
    const result = solveBavGrossFromNetApi({
      profile: defaultProfile,
      bav: defaultAssumptions.bav,
      targetMonthlyNet: 100,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.monthlyGrossConversion).toBeGreaterThan(0)
    expect(result.data.targetMonthlyNet).toBe(100)
    // Gross should be larger than net (tax savings make net < gross)
    expect(result.data.monthlyGrossConversion).toBeGreaterThan(result.data.targetMonthlyNet)
  })
})

// ---------------------------------------------------------------------------
// 3. Basisrente funding produces non-zero tax saving
// ---------------------------------------------------------------------------

describe('calculateBasisrenteFundingApi', () => {
  it('produces non-zero tax saving', () => {
    const result = calculateBasisrenteFundingApi({
      profile: defaultProfile,
      basisrente: defaultAssumptions.basisrente,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const d = result.data
    expect(typeof d.monthlyGrossContribution).toBe('number')
    expect(typeof d.monthlyNetCost).toBe('number')
    expect(typeof d.annualTaxSaving).toBe('number')
    expect(typeof d.annualDeductible).toBe('number')
    expect(typeof d.remainingSchicht1Cap).toBe('number')

    // With a 75k salary, Basisrente contributions should produce a tax saving
    expect(d.annualTaxSaving).toBeGreaterThan(0)
    expect(d.monthlyNetCost).toBeLessThan(d.monthlyGrossContribution)
  })
})

// ---------------------------------------------------------------------------
// 4. AVD funding includes allowances
// ---------------------------------------------------------------------------

describe('calculateAvdFundingApi', () => {
  it('includes allowances', () => {
    const result = calculateAvdFundingApi({
      profile: defaultProfile,
      altersvorsorgedepot: defaultAvdAssumptions,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const d = result.data
    expect(typeof d.monthlyOwnContribution).toBe('number')
    expect(typeof d.monthlyNetCost).toBe('number')
    expect(typeof d.totalAllowanceAnnual).toBe('number')
    expect(typeof d.basicAllowanceAnnual).toBe('number')
    expect(typeof d.childAllowanceAnnual).toBe('number')
    expect(typeof d.careerStarterBonusAnnual).toBe('number')
    expect(typeof d.guenstigerpruefungBenefitAnnual).toBe('number')
    expect(typeof d.cappedAtContractMax).toBe('boolean')

    // Default profile is directly eligible with 200 EUR/month own contribution
    // → basic allowance should be positive
    expect(d.basicAllowanceAnnual).toBeGreaterThan(0)
    expect(d.totalAllowanceAnnual).toBeGreaterThan(0)
  })

  it('uses maritalStatus for AVD Guenstigerpruefung', () => {
    const single = calculateAvdFundingApi({
      profile: { ...defaultProfile, maritalStatus: 'single' } as never,
      altersvorsorgedepot: defaultAvdAssumptions,
    })
    const married = calculateAvdFundingApi({
      profile: { ...defaultProfile, maritalStatus: 'married' } as never,
      altersvorsorgedepot: defaultAvdAssumptions,
    })

    expect(single.ok).toBe(true)
    expect(married.ok).toBe(true)
    if (!single.ok || !married.ok) return

    expect(married.data.guenstigerpruefungBenefitAnnual).not.toBe(
      single.data.guenstigerpruefungBenefitAnnual,
    )
  })
})

// ---------------------------------------------------------------------------
// 5. Riester funding includes Grundzulage
// ---------------------------------------------------------------------------

describe('calculateRiesterFundingApi', () => {
  it('includes Grundzulage', () => {
    const result = calculateRiesterFundingApi({
      profile: defaultProfile,
      riester: defaultRiesterAssumptions,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const d = result.data
    expect(typeof d.monthlyOwnContribution).toBe('number')
    expect(typeof d.monthlyNetCost).toBe('number')
    expect(typeof d.grundzulageAnnual).toBe('number')
    expect(typeof d.childAllowanceAnnual).toBe('number')
    expect(typeof d.totalAllowanceAnnual).toBe('number')
    expect(typeof d.meetsMinContribution).toBe('boolean')
    expect(typeof d.guenstigerpruefungBenefitAnnual).toBe('number')

    // Default profile is directly eligible → Grundzulage should be positive
    expect(d.grundzulageAnnual).toBeGreaterThan(0)
    expect(d.totalAllowanceAnnual).toBeGreaterThan(0)
  })

  it('uses maritalStatus for Riester Guenstigerpruefung', () => {
    const single = calculateRiesterFundingApi({
      profile: { ...defaultProfile, maritalStatus: 'single' } as never,
      riester: defaultRiesterAssumptions,
    })
    const married = calculateRiesterFundingApi({
      profile: { ...defaultProfile, maritalStatus: 'married' } as never,
      riester: defaultRiesterAssumptions,
    })

    expect(single.ok).toBe(true)
    expect(married.ok).toBe(true)
    if (!single.ok || !married.ok) return

    expect(married.data.guenstigerpruefungBenefitAnnual).not.toBe(
      single.data.guenstigerpruefungBenefitAnnual,
    )
  })
})

// ---------------------------------------------------------------------------
// 6. Invalid profile returns error for all funding operations
// ---------------------------------------------------------------------------

describe('invalid profile', () => {
  const badProfile = { age: 5 } as never

  it('bAV funding returns error', () => {
    const result = calculateBavFundingApi({ profile: badProfile, bav: defaultAssumptions.bav })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('bAV solve returns error', () => {
    const result = solveBavGrossFromNetApi({ profile: badProfile, bav: defaultAssumptions.bav, targetMonthlyNet: 100 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('Basisrente funding returns error', () => {
    const result = calculateBasisrenteFundingApi({ profile: badProfile, basisrente: defaultAssumptions.basisrente })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('AVD funding returns error', () => {
    const result = calculateAvdFundingApi({ profile: badProfile, altersvorsorgedepot: defaultAvdAssumptions })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('Riester funding returns error', () => {
    const result = calculateRiesterFundingApi({ profile: badProfile, riester: defaultRiesterAssumptions })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 6b. Null/undefined product assumptions return INVALID_INPUT
// ---------------------------------------------------------------------------

describe('null/undefined product assumptions', () => {
  it('bAV funding returns error when bav is undefined', () => {
    const result = calculateBavFundingApi({ profile: defaultProfile, bav: undefined as never })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
  })

  it('bAV funding returns error when bav is null', () => {
    const result = calculateBavFundingApi({ profile: defaultProfile, bav: null as never })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
  })

  it('bAV solve returns error when bav is undefined', () => {
    const result = solveBavGrossFromNetApi({ profile: defaultProfile, bav: undefined as never, targetMonthlyNet: 100 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
  })

  it('bAV solve returns error when targetMonthlyNet is negative', () => {
    const result = solveBavGrossFromNetApi({ profile: defaultProfile, bav: defaultAssumptions.bav, targetMonthlyNet: -50 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
  })

  it('Basisrente funding returns error when basisrente is null', () => {
    const result = calculateBasisrenteFundingApi({ profile: defaultProfile, basisrente: null as never })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
  })

  it('AVD funding returns error when altersvorsorgedepot is undefined', () => {
    const result = calculateAvdFundingApi({ profile: defaultProfile, altersvorsorgedepot: undefined as never })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
  })

  it('Riester funding returns error when riester is undefined', () => {
    const result = calculateRiesterFundingApi({ profile: defaultProfile, riester: undefined as never })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 7. JSON serializable responses
// ---------------------------------------------------------------------------

describe('JSON serializable', () => {
  it('bAV funding round-trips through JSON', () => {
    const result = calculateBavFundingApi({ profile: defaultProfile, bav: defaultAssumptions.bav })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parsed = JSON.parse(JSON.stringify(result.data)) as BavFundingResponse
    expect(parsed.monthlyGrossConversion).toBe(result.data.monthlyGrossConversion)
    expect(parsed.monthlyNetCost).toBe(result.data.monthlyNetCost)
  })

  it('Basisrente funding round-trips through JSON', () => {
    const result = calculateBasisrenteFundingApi({ profile: defaultProfile, basisrente: defaultAssumptions.basisrente })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parsed = JSON.parse(JSON.stringify(result.data)) as BasisrenteFundingResponse
    expect(parsed.annualTaxSaving).toBe(result.data.annualTaxSaving)
  })

  it('AVD funding round-trips through JSON', () => {
    const result = calculateAvdFundingApi({ profile: defaultProfile, altersvorsorgedepot: defaultAvdAssumptions })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parsed = JSON.parse(JSON.stringify(result.data)) as AvdFundingResponse
    expect(parsed.totalAllowanceAnnual).toBe(result.data.totalAllowanceAnnual)
  })

  it('Riester funding round-trips through JSON', () => {
    const result = calculateRiesterFundingApi({ profile: defaultProfile, riester: defaultRiesterAssumptions })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parsed = JSON.parse(JSON.stringify(result.data)) as RiesterFundingResponse
    expect(parsed.grundzulageAnnual).toBe(result.data.grundzulageAnnual)
  })
})
