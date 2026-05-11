// @vitest-environment node
/**
 * Tests for the tax & salary API facade.
 */
import { describe, it, expect } from 'vitest'
import {
  calculateIncomeTax,
  calculateSolidarity,
  calculateCapitalGains,
  calculateSalary,
} from './tax'
import type {
  IncomeTaxResponse,
  SolidarityResponse,
  CapitalGainsResponse,
  SalaryResponse,
} from './tax'
import { calculateIncomeTax2026, calculateSolidarityTax, calculateCapitalGainsTax } from '../engine/tax'
import { resolveRuleYear } from './rules'
import { defaultProfile } from '../data/defaultScenario'

// Helper: resolve rules once for direct engine comparisons
function getRules() {
  const r = resolveRuleYear()
  if (!r.ok) throw new Error('resolveRuleYear failed')
  return r.data.rules
}

// ---------------------------------------------------------------------------
// 1. Income tax — known value matches engine
// ---------------------------------------------------------------------------

describe('calculateIncomeTax', () => {
  it('produces non-zero tax for 50_000 taxable income matching the engine', () => {
    const result = calculateIncomeTax({ taxableIncome: 50_000 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const rules = getRules()
    const expected = calculateIncomeTax2026(50_000, rules)

    expect(result.data.taxableIncome).toBe(50_000)
    expect(result.data.incomeTax).toBe(expected)
    expect(result.data.incomeTax).toBeGreaterThan(0)
    expect(result.meta.apiVersion).toBe('v1')
  })

  // ---------------------------------------------------------------------------
  // 2. Income tax validation — non-numeric rejected
  // ---------------------------------------------------------------------------

  it('returns error for non-numeric taxableIncome', () => {
    const result = calculateIncomeTax({ taxableIncome: 'abc' as unknown as number })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].path).toBe('taxableIncome')
    expect(result.errors[0].code).toBe('INVALID_RANGE')
  })

  it('returns error for negative taxableIncome', () => {
    const result = calculateIncomeTax({ taxableIncome: -1000 })
    expect(result.ok).toBe(false)
  })

  it('returns zero tax for income below basic allowance', () => {
    const result = calculateIncomeTax({ taxableIncome: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.incomeTax).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 3. Solidarity tax — known values
// ---------------------------------------------------------------------------

describe('calculateSolidarity', () => {
  it('produces soli for known income tax amount', () => {
    const rules = getRules()
    const incomeTax = calculateIncomeTax2026(80_000, rules)

    const result = calculateSolidarity({ incomeTax })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const expectedSoli = calculateSolidarityTax(incomeTax, rules, 'single')
    expect(result.data.solidarityTax).toBe(expectedSoli)
    expect(result.data.filingStatus).toBe('single')
    expect(result.data.incomeTax).toBe(incomeTax)
  })

  it('returns zero soli for zero income tax', () => {
    const result = calculateSolidarity({ incomeTax: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.solidarityTax).toBe(0)
  })

  it('accepts married filing status', () => {
    const rules = getRules()
    const incomeTax = calculateIncomeTax2026(80_000, rules)

    const single = calculateSolidarity({ incomeTax, filingStatus: 'single' })
    const married = calculateSolidarity({ incomeTax, filingStatus: 'married' })

    expect(single.ok).toBe(true)
    expect(married.ok).toBe(true)
    if (!single.ok || !married.ok) return

    expect(married.data.filingStatus).toBe('married')
    // Married has a higher free threshold, so soli may differ
    expect(typeof married.data.solidarityTax).toBe('number')
  })

  it('returns error for non-numeric incomeTax', () => {
    const result = calculateSolidarity({ incomeTax: NaN })
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. Capital gains — default allowance
// ---------------------------------------------------------------------------

describe('calculateCapitalGains', () => {
  it('produces expected tax for 10_000 gain with default allowance', () => {
    const rules = getRules()
    const result = calculateCapitalGains({ gain: 10_000 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const expected = calculateCapitalGainsTax(10_000, rules)
    expect(result.data.capitalGainsTax).toBe(expected)
    expect(result.data.gain).toBe(10_000)
    expect(result.data.annualAllowance).toBe(rules.capitalGains.saverAllowance)
    expect(result.data.partialExemption).toBe(0)
    expect(result.data.capitalGainsTax).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // 5. Capital gains with partial exemption
  // ---------------------------------------------------------------------------

  it('reduces tax with 0.3 partial exemption', () => {
    const withoutExemption = calculateCapitalGains({ gain: 10_000 })
    const withExemption = calculateCapitalGains({ gain: 10_000, partialExemption: 0.3 })

    expect(withoutExemption.ok).toBe(true)
    expect(withExemption.ok).toBe(true)
    if (!withoutExemption.ok || !withExemption.ok) return

    expect(withExemption.data.partialExemption).toBe(0.3)
    expect(withExemption.data.capitalGainsTax).toBeLessThan(
      withoutExemption.data.capitalGainsTax,
    )
  })

  it('accepts negative gain (losses)', () => {
    const result = calculateCapitalGains({ gain: -5_000 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.capitalGainsTax).toBe(0)
  })

  it('returns error for non-numeric gain', () => {
    const result = calculateCapitalGains({ gain: 'bad' as unknown as number })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].path).toBe('gain')
  })

  it('returns error for NaN gain', () => {
    const result = calculateCapitalGains({ gain: NaN })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].path).toBe('gain')
  })

  it('returns error for NaN partialExemption (no NaN leak)', () => {
    const result = calculateCapitalGains({ gain: 10_000, partialExemption: NaN })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].path).toBe('partialExemption')
  })

  it('returns error for partialExemption out of [0,1] range', () => {
    const result = calculateCapitalGains({ gain: 10_000, partialExemption: 1.5 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].path).toBe('partialExemption')
  })

  it('returns error for negative annualAllowance', () => {
    const result = calculateCapitalGains({ gain: 10_000, annualAllowance: -100 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].path).toBe('annualAllowance')
  })

  it('returns error for NaN annualAllowance', () => {
    const result = calculateCapitalGains({ gain: 10_000, annualAllowance: NaN })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].path).toBe('annualAllowance')
  })
})

// ---------------------------------------------------------------------------
// 6. Salary — default profile shape
// ---------------------------------------------------------------------------

describe('calculateSalary', () => {
  it('produces expected salary shape with default profile', () => {
    const result = calculateSalary({ profile: defaultProfile })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data

    // Core fields present and in expected range
    expect(data.annualGross).toBe(defaultProfile.grossSalaryYear)
    expect(data.annualNet).toBeGreaterThan(0)
    expect(data.annualNet).toBeLessThan(data.annualGross)
    expect(data.annualTaxableIncome).toBeGreaterThan(0)
    expect(data.annualIncomeTax).toBeGreaterThan(0)
    expect(typeof data.annualSolidarity).toBe('number')
    expect(typeof data.vorsorgepauschale).toBe('number')
    expect(data.vorsorgepauschale).toBeGreaterThan(0)
    expect(data.monthlyNet).toBeCloseTo(data.annualNet / 12, 2)

    // Social contributions
    expect(data.socialContributions.healthInsurance).toBeGreaterThan(0)
    expect(data.socialContributions.pensionInsurance).toBeGreaterThan(0)
    expect(data.socialContributions.unemploymentInsurance).toBeGreaterThan(0)
    expect(data.socialContributions.nursingCareInsurance).toBeGreaterThan(0)
    expect(data.socialContributions.total).toBeCloseTo(
      data.socialContributions.healthInsurance +
        data.socialContributions.pensionInsurance +
        data.socialContributions.unemploymentInsurance +
        data.socialContributions.nursingCareInsurance,
      2,
    )

    // GKV member should not have pkvEmployerSubsidy
    expect(data.pkvEmployerSubsidy).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // 7. Salary validation — invalid profile
  // ---------------------------------------------------------------------------

  it('returns error for invalid profile (age: 5)', () => {
    const result = calculateSalary({
      profile: { ...defaultProfile, age: 5 },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some((e) => e.path.includes('age'))).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // 8. Salary PKV — employer subsidy present
  // ---------------------------------------------------------------------------

  it('includes pkvEmployerSubsidy for PKV profile', () => {
    const pkvProfile = {
      ...defaultProfile,
      publicHealthInsurance: false as const,
      pkvMonthlyPremium: 500,
      pPVMonthlyPremium: 50,
    }

    const result = calculateSalary({ profile: pkvProfile })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.pkvEmployerSubsidy).toBeDefined()
    expect(result.data.pkvEmployerSubsidy).toBeGreaterThan(0)
    // GKV social contributions should be zero for PKV member
    expect(result.data.socialContributions.healthInsurance).toBe(0)
    expect(result.data.socialContributions.nursingCareInsurance).toBe(0)
  })

  it('applies married-household tax class III/V payroll tables', () => {
    const classOne = calculateSalary({ profile: { ...defaultProfile, taxClass: 1 } })
    const classThree = calculateSalary({
      profile: { ...defaultProfile, taxClass: 3 as unknown as 1 },
    })
    const classFive = calculateSalary({
      profile: { ...defaultProfile, taxClass: 5 as unknown as 1 },
    })

    expect(classOne.ok).toBe(true)
    expect(classThree.ok).toBe(true)
    expect(classFive.ok).toBe(true)
    if (!classOne.ok || !classThree.ok || !classFive.ok) return

    expect(classThree.data.annualIncomeTax).toBeLessThan(classOne.data.annualIncomeTax)
    expect(classFive.data.annualIncomeTax).toBeGreaterThan(classOne.data.annualIncomeTax)
  })
})

// ---------------------------------------------------------------------------
// 9. JSON serializable — all responses round-trip
// ---------------------------------------------------------------------------

describe('JSON serializable', () => {
  it('IncomeTaxResponse round-trips through JSON', () => {
    const result = calculateIncomeTax({ taxableIncome: 50_000 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parsed = JSON.parse(JSON.stringify(result.data)) as IncomeTaxResponse
    expect(parsed.taxableIncome).toBe(result.data.taxableIncome)
    expect(parsed.incomeTax).toBe(result.data.incomeTax)
  })

  it('SolidarityResponse round-trips through JSON', () => {
    const result = calculateSolidarity({ incomeTax: 10_000 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parsed = JSON.parse(JSON.stringify(result.data)) as SolidarityResponse
    expect(parsed.solidarityTax).toBe(result.data.solidarityTax)
    expect(parsed.filingStatus).toBe(result.data.filingStatus)
  })

  it('CapitalGainsResponse round-trips through JSON', () => {
    const result = calculateCapitalGains({ gain: 10_000 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parsed = JSON.parse(JSON.stringify(result.data)) as CapitalGainsResponse
    expect(parsed.capitalGainsTax).toBe(result.data.capitalGainsTax)
    expect(parsed.annualAllowance).toBe(result.data.annualAllowance)
  })

  it('SalaryResponse round-trips through JSON', () => {
    const result = calculateSalary({ profile: defaultProfile })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parsed = JSON.parse(JSON.stringify(result.data)) as SalaryResponse
    expect(parsed.annualGross).toBe(result.data.annualGross)
    expect(parsed.annualNet).toBe(result.data.annualNet)
    expect(parsed.socialContributions.total).toBe(result.data.socialContributions.total)
    expect(parsed.monthlyNet).toBe(result.data.monthlyNet)
  })
})

// ---------------------------------------------------------------------------
// 10. Salary with NaN field returns structured error
// ---------------------------------------------------------------------------

describe('salary NaN field', () => {
  it('returns error when grossSalaryYear is NaN', () => {
    const result = calculateSalary({
      profile: { ...defaultProfile, grossSalaryYear: NaN },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 11. Unsupported rule year
// ---------------------------------------------------------------------------

describe('unsupported rule year', () => {
  it('calculateIncomeTax returns error for unsupported year', () => {
    const result = calculateIncomeTax({ ruleYear: 9999, taxableIncome: 50_000 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_RULE_YEAR')).toBe(true)
  })

  it('calculateSolidarity returns error for unsupported year', () => {
    const result = calculateSolidarity({ ruleYear: 9999, incomeTax: 10_000 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_RULE_YEAR')).toBe(true)
  })

  it('calculateCapitalGains returns error for unsupported year', () => {
    const result = calculateCapitalGains({ ruleYear: 9999, gain: 10_000 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_RULE_YEAR')).toBe(true)
  })

  it('calculateSalary returns error for unsupported year', () => {
    const result = calculateSalary({ ruleYear: 9999, profile: defaultProfile })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_RULE_YEAR')).toBe(true)
  })
})
