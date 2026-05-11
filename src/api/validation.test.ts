// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  validateProfile,
  validateSharedAssumptions,
  validateProductAssumptions,
  validateComparisonRequest,
} from './validation'
import { defaultProfile, defaultAssumptions } from '../data/defaultScenario'

describe('validateProfile', () => {
  it('valid defaults produce no errors', () => {
    expect(validateProfile(defaultProfile)).toHaveLength(0)
  })

  it('invalid age (5) produces error at profile.age', () => {
    const ds = validateProfile({ ...defaultProfile, age: 5 })
    expect(ds).toHaveLength(1)
    expect(ds[0].path).toBe('profile.age')
    expect(ds[0].severity).toBe('error')
  })

  it('invalid retirementAge (less than age) produces error', () => {
    const ds = validateProfile({ ...defaultProfile, age: 40, retirementAge: 35 })
    expect(ds).toHaveLength(1)
    expect(ds[0].path).toBe('profile.retirementAge')
  })

  it('retirementAge equal to age produces error', () => {
    const ds = validateProfile({ ...defaultProfile, age: 40, retirementAge: 40 })
    expect(ds.some(d => d.path === 'profile.retirementAge')).toBe(true)
  })

  it('invalid grossSalaryYear (negative) produces error', () => {
    const ds = validateProfile({ ...defaultProfile, grossSalaryYear: -1000 })
    expect(ds.some(d => d.path === 'profile.grossSalaryYear')).toBe(true)
  })

  it('non-object input produces error', () => {
    const ds = validateProfile('not an object')
    expect(ds).toHaveLength(1)
    expect(ds[0].path).toBe('profile')
  })

  it('accepts supported Steuerklasse values 1 through 6', () => {
    for (const taxClass of [1, 2, 3, 4, 5, 6]) {
      expect(validateProfile({ ...defaultProfile, taxClass })).toHaveLength(0)
    }
  })

  it('rejects Steuerklasse values outside 1 through 6', () => {
    const ds = validateProfile({ ...defaultProfile, taxClass: 7 })
    expect(ds.some((d) => d.path === 'profile.taxClass')).toBe(true)
  })
})

describe('validateSharedAssumptions', () => {
  it('valid defaults produce no errors', () => {
    expect(validateSharedAssumptions(defaultAssumptions)).toHaveLength(0)
  })

  it('invalid visibleProducts (unknown product ID) produces error', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      visibleProducts: ['etf', 'nonexistent_product'],
    })
    expect(ds.some(d => d.path === 'assumptions.visibleProducts')).toBe(true)
    expect(ds.some(d => d.code === 'UNKNOWN_PRODUCT_ID')).toBe(true)
  })

  it('empty visibleProducts [] is valid (no error)', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      visibleProducts: [],
    })
    const vpErrors = ds.filter(d => d.path === 'assumptions.visibleProducts')
    expect(vpErrors).toHaveLength(0)
  })

  it('empty returnScenarios [] produces error', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      returnScenarios: [],
    })
    expect(ds.some(d => d.path === 'assumptions.returnScenarios')).toBe(true)
  })

  it('invalid monteCarlo.runs (0) produces error', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, runs: 0 },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.runs')).toBe(true)
  })

  it('monteCarlo.runs at 5001 exceeds cap', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, runs: 5001 },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.runs')).toBe(true)
  })

  it('monteCarlo.runs at 5000 is valid', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, runs: 5000 },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.runs')).toBe(false)
  })

  it('invalid monteCarlo.annualVolatility (> 1) produces error', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, annualVolatility: 1.5 },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.annualVolatility')).toBe(true)
  })

  it('monteCarlo.enabled must be a boolean when present', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, enabled: 'yes' as unknown },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.enabled' && d.code === 'INVALID_TYPE')).toBe(true)
  })

  it('monteCarlo.enabled = true is valid', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, enabled: true },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.enabled')).toBe(false)
  })

  it('monteCarlo.seed must be an integer when present', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, seed: 'abc' as unknown },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.seed' && d.code === 'INVALID_RANGE')).toBe(true)
  })

  it('monteCarlo.seed = 42 is valid', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, seed: 42 },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.seed')).toBe(false)
  })

  it('returnScenarios entry missing id produces error', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      returnScenarios: [{ annualReturn: 0.05, label: 'Test' }],
    })
    expect(ds.some(d => d.path === 'assumptions.returnScenarios[0].id' && d.code === 'INVALID_TYPE')).toBe(true)
  })

  it('returnScenarios entry missing label produces error', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      returnScenarios: [{ annualReturn: 0.05, id: 'test' }],
    })
    expect(ds.some(d => d.path === 'assumptions.returnScenarios[0].label' && d.code === 'INVALID_TYPE')).toBe(true)
  })

  it('returnScenarios duplicate id produces error', () => {
    // Duplicate id must use a recognised scenario id; otherwise the
    // UNKNOWN_SCENARIO_ID check fires first and short-circuits dup detection.
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      returnScenarios: [
        { id: 'basis', label: 'A', annualReturn: 0.03 },
        { id: 'basis', label: 'B', annualReturn: 0.05 },
      ],
    })
    expect(ds.some(d => d.code === 'DUPLICATE_SCENARIO_ID')).toBe(true)
  })

  it('inflationRate (> 1) produces error', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      inflationRate: 2.0,
    })
    expect(ds.some(d => d.path === 'assumptions.inflationRate')).toBe(true)
  })

  it('invalid retirementEndAge (0) produces error', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      retirementEndAge: 0,
    })
    expect(ds.some(d => d.path === 'assumptions.retirementEndAge')).toBe(true)
  })
})

describe('validateProductAssumptions', () => {
  it('valid default assumptions produce no errors', () => {
    const ds = validateProductAssumptions(
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    expect(ds).toHaveLength(0)
  })

  it('product validation failure (bav with monthlyGrossConversion: -1) produces slot-root error', () => {
    const broken = {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: -1 },
    }
    const ds = validateProductAssumptions(broken as unknown as Record<string, unknown>)
    expect(ds.some(d => d.path === 'assumptions.bav' && d.code === 'PRODUCT_VALIDATION_FAILED')).toBe(true)
  })
})

describe('validateComparisonRequest', () => {
  it('fully valid request produces no diagnostics', () => {
    const ds = validateComparisonRequest({
      profile: defaultProfile,
      assumptions: defaultAssumptions,
      ruleYear: 2026,
    })
    expect(ds).toHaveLength(0)
  })

  it('unsupported rule year produces error at ruleYear', () => {
    const ds = validateComparisonRequest({ ruleYear: 9999 })
    expect(ds.some(d => d.path === 'ruleYear' && d.code === 'UNSUPPORTED_RULE_YEAR')).toBe(true)
  })

  it('omitted fields produce no errors', () => {
    const ds = validateComparisonRequest({})
    expect(ds).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Regression tests for review findings (NaN admission + missing field checks)
// ---------------------------------------------------------------------------

describe('validateProfile — finite-number and full-shape checks', () => {
  it('NaN age is rejected', () => {
    const ds = validateProfile({ ...defaultProfile, age: NaN })
    expect(ds.some(d => d.path === 'profile.age')).toBe(true)
  })

  it('Infinity grossSalaryYear is rejected', () => {
    const ds = validateProfile({ ...defaultProfile, grossSalaryYear: Infinity })
    expect(ds.some(d => d.path === 'profile.grossSalaryYear')).toBe(true)
  })

  it('non-array childBirthYears is rejected', () => {
    const ds = validateProfile({ ...defaultProfile, childBirthYears: 'bad' })
    expect(ds.some(d => d.path === 'profile.childBirthYears')).toBe(true)
  })

  it('non-numeric entry in childBirthYears is rejected', () => {
    const ds = validateProfile({ ...defaultProfile, childBirthYears: [2010, 'bad'] })
    expect(ds.some(d => d.path === 'profile.childBirthYears[1]')).toBe(true)
  })

  it('non-boolean churchTax is rejected', () => {
    const ds = validateProfile({ ...defaultProfile, churchTax: 'yes' })
    expect(ds.some(d => d.path === 'profile.churchTax')).toBe(true)
  })

  it('NaN healthAdditionalContributionPct is rejected', () => {
    const ds = validateProfile({ ...defaultProfile, healthAdditionalContributionPct: NaN })
    expect(ds.some(d => d.path === 'profile.healthAdditionalContributionPct')).toBe(true)
  })

  it('negative pkvMonthlyPremium is rejected', () => {
    const ds = validateProfile({ ...defaultProfile, pkvMonthlyPremium: -10 })
    expect(ds.some(d => d.path === 'profile.pkvMonthlyPremium')).toBe(true)
  })

  it('NaN pPVMonthlyPremium is rejected', () => {
    const ds = validateProfile({ ...defaultProfile, pPVMonthlyPremium: NaN })
    expect(ds.some(d => d.path === 'profile.pPVMonthlyPremium')).toBe(true)
  })

  it('negative desiredNetMonthlyPension is rejected when provided', () => {
    const ds = validateProfile({ ...defaultProfile, desiredNetMonthlyPension: -100 })
    expect(ds.some(d => d.path === 'profile.desiredNetMonthlyPension')).toBe(true)
  })

  it('omitted desiredNetMonthlyPension is accepted', () => {
    const { desiredNetMonthlyPension: _, ...rest } = defaultProfile
    void _
    const ds = validateProfile(rest)
    expect(ds).toHaveLength(0)
  })
})

describe('validateSharedAssumptions — finite-number checks', () => {
  it('NaN annualReturn in a return scenario is rejected', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      returnScenarios: [{ id: 'x', label: 'X', annualReturn: NaN }],
    })
    expect(ds.some(d => d.path === 'assumptions.returnScenarios[0].annualReturn')).toBe(true)
  })

  it('NaN retirementEndAge is rejected', () => {
    const ds = validateSharedAssumptions({ ...defaultAssumptions, retirementEndAge: NaN })
    expect(ds.some(d => d.path === 'assumptions.retirementEndAge')).toBe(true)
  })

  it('NaN inflationRate is rejected', () => {
    const ds = validateSharedAssumptions({ ...defaultAssumptions, inflationRate: NaN })
    expect(ds.some(d => d.path === 'assumptions.inflationRate')).toBe(true)
  })

  it('NaN monteCarlo.runs is rejected', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, runs: NaN },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.runs')).toBe(true)
  })

  it('NaN monteCarlo.annualVolatility is rejected', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, annualVolatility: NaN },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.annualVolatility')).toBe(true)
  })

  it('NaN monteCarlo.seed is rejected', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, seed: NaN },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.seed')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Canonical-schema bound regressions — must match scenarioSchema.ts
// ---------------------------------------------------------------------------

describe('validateSharedAssumptions — scenario bounds match canonical schema', () => {
  it('rejects unknown scenario id (only konservativ/basis/optimistisch/custom valid)', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      returnScenarios: [{ id: 'aggressiv', label: 'Aggressive', annualReturn: 0.08 }],
    })
    expect(ds.some(d => d.code === 'UNKNOWN_SCENARIO_ID')).toBe(true)
  })

  it('accepts custom as a valid scenario id', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      returnScenarios: [
        { id: 'basis', label: 'Basis', annualReturn: 0.05 },
        { id: 'custom', label: 'Custom', annualReturn: 0.04 },
      ],
    })
    expect(ds.filter(d => d.path.startsWith('assumptions.returnScenarios'))).toHaveLength(0)
  })

  it('rejects annualReturn above 0.5 (canonical max)', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      returnScenarios: [{ id: 'basis', label: 'B', annualReturn: 0.6 }],
    })
    expect(ds.some(d => d.path === 'assumptions.returnScenarios[0].annualReturn')).toBe(true)
  })

  it('rejects annualReturn below -0.5 (canonical min)', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      returnScenarios: [{ id: 'basis', label: 'B', annualReturn: -0.6 }],
    })
    expect(ds.some(d => d.path === 'assumptions.returnScenarios[0].annualReturn')).toBe(true)
  })

  it('accepts annualReturn at the 0.5 boundary', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      returnScenarios: [{ id: 'basis', label: 'B', annualReturn: 0.5 }],
    })
    expect(ds.filter(d => d.path.startsWith('assumptions.returnScenarios'))).toHaveLength(0)
  })

  it('rejects more than 10 return scenarios', () => {
    const scenarios = Array.from({ length: 11 }, (_, i) => ({
      id: 'basis',
      label: `S${i}`,
      annualReturn: 0.05,
    }))
    const ds = validateSharedAssumptions({ ...defaultAssumptions, returnScenarios: scenarios })
    expect(ds.some(d => d.code === 'TOO_MANY_SCENARIOS')).toBe(true)
  })
})

describe('validateSharedAssumptions — Monte Carlo bounds match canonical schema', () => {
  it('rejects runs below 100 (canonical min)', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, runs: 50 },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.runs')).toBe(true)
  })

  it('rejects non-integer runs (canonical requires integer)', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, runs: 500.5 },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.runs')).toBe(true)
  })

  it('accepts runs at the 100 boundary', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, runs: 100 },
    })
    expect(ds.filter(d => d.path === 'assumptions.monteCarlo.runs')).toHaveLength(0)
  })

  it('rejects volatility above 0.6 (canonical max)', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, annualVolatility: 0.7 },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.annualVolatility')).toBe(true)
  })

  it('accepts volatility at the 0.6 boundary', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, annualVolatility: 0.6 },
    })
    expect(ds.filter(d => d.path === 'assumptions.monteCarlo.annualVolatility')).toHaveLength(0)
  })

  it('rejects non-integer seed (canonical requires integer)', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, seed: 1.5 },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.seed')).toBe(true)
  })

  it('rejects seed below 1', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, seed: 0 },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.seed')).toBe(true)
  })

  it('rejects seed above 2^31 - 1', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, seed: 2_147_483_648 },
    })
    expect(ds.some(d => d.path === 'assumptions.monteCarlo.seed')).toBe(true)
  })

  it('accepts seed at the upper boundary 2^31 - 1', () => {
    const ds = validateSharedAssumptions({
      ...defaultAssumptions,
      monteCarlo: { ...defaultAssumptions.monteCarlo, seed: 2_147_483_647 },
    })
    expect(ds.filter(d => d.path === 'assumptions.monteCarlo.seed')).toHaveLength(0)
  })
})

describe('validateSharedAssumptions — inflation bounds match canonical schema', () => {
  it('rejects inflation above 0.2 (canonical max)', () => {
    const ds = validateSharedAssumptions({ ...defaultAssumptions, inflationRate: 0.3 })
    expect(ds.some(d => d.path === 'assumptions.inflationRate')).toBe(true)
  })

  it('accepts negative inflation down to -0.1 (deflation)', () => {
    const ds = validateSharedAssumptions({ ...defaultAssumptions, inflationRate: -0.05 })
    expect(ds.filter(d => d.path === 'assumptions.inflationRate')).toHaveLength(0)
  })

  it('rejects inflation below -0.1 (canonical min)', () => {
    const ds = validateSharedAssumptions({ ...defaultAssumptions, inflationRate: -0.2 })
    expect(ds.some(d => d.path === 'assumptions.inflationRate')).toBe(true)
  })
})
