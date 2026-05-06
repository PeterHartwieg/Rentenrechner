/**
 * Structured validation for API inputs.
 *
 * All validators accept `unknown` and return ApiDiagnostic arrays.
 * Validation is lenient — it checks structural shape and domain ranges,
 * not deep product-specific business rules (those live in the product
 * registry validators).
 */

import type { ApiDiagnostic } from './contracts'
import { PRODUCT_REGISTRY, PRODUCT_IDS } from '../engine/productRegistry'
import { resolveRuleYear } from './rules'
import { isFiniteNumber, isInt } from '../domain/validation/primitives'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function diag(
  path: string,
  code: string,
  message: string,
  severity: 'error' | 'warning' = 'error',
): ApiDiagnostic {
  return { path, code, severity, message }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ---------------------------------------------------------------------------
// Canonical bounds — must stay in sync with `src/utils/scenarioSchema.ts`
// (the storage/share-URL schema validator). The API enforces the same envelope
// so a request that round-trips through storage cannot succeed at the API
// boundary but fail later at load time.
// ---------------------------------------------------------------------------

/** Valid return-scenario ids (matches `VALID_SCENARIO_IDS` in scenarioSchema). */
const VALID_SCENARIO_IDS = ['konservativ', 'basis', 'optimistisch', 'custom'] as const
/** Max number of return scenarios in a request (scenarioSchema bound). */
const MAX_RETURN_SCENARIOS = 10
/** annualReturn bounds per scenario (scenarioSchema bound). */
const SCENARIO_ANNUAL_RETURN_MIN = -0.5
const SCENARIO_ANNUAL_RETURN_MAX = 0.5
/** Monte Carlo bounds (scenarioSchema bounds). */
const MC_RUNS_MIN = 100
const MC_RUNS_MAX = 5_000
const MC_VOLATILITY_MIN = 0
const MC_VOLATILITY_MAX = 0.6
const MC_SEED_MIN = 1
const MC_SEED_MAX = 2_147_483_647
/** Inflation bounds (scenarioSchema bound). */
const INFLATION_MIN = -0.1
const INFLATION_MAX = 0.2

// ---------------------------------------------------------------------------
// Profile validation
// ---------------------------------------------------------------------------

export function validateProfile(profile: unknown): ApiDiagnostic[] {
  const ds: ApiDiagnostic[] = []
  if (!isRecord(profile)) {
    ds.push(diag('profile', 'INVALID_TYPE', 'profile must be an object.'))
    return ds
  }

  const {
    age,
    retirementAge,
    grossSalaryYear,
    taxClass,
    childBirthYears,
    churchTax,
    publicHealthInsurance,
    healthAdditionalContributionPct,
    pkvMonthlyPremium,
    pPVMonthlyPremium,
    desiredNetMonthlyPension,
  } = profile

  if (!isFiniteNumber(age) || age < 18 || age > 99) {
    ds.push(diag('profile.age', 'INVALID_RANGE', 'age must be a finite number between 18 and 99.'))
  }

  if (
    !isFiniteNumber(retirementAge) ||
    (isFiniteNumber(age) && retirementAge <= age) ||
    retirementAge > 100
  ) {
    ds.push(diag('profile.retirementAge', 'INVALID_RANGE', 'retirementAge must be a finite number greater than age and at most 100.'))
  }

  if (!isFiniteNumber(grossSalaryYear) || grossSalaryYear < 0) {
    ds.push(diag('profile.grossSalaryYear', 'INVALID_RANGE', 'grossSalaryYear must be a non-negative finite number.'))
  }

  if (taxClass !== 1) {
    ds.push(diag('profile.taxClass', 'INVALID_VALUE', 'taxClass must be 1.'))
  }

  // childBirthYears — required: array of finite year numbers.
  if (!Array.isArray(childBirthYears)) {
    ds.push(diag('profile.childBirthYears', 'INVALID_TYPE', 'childBirthYears must be an array of numbers.'))
  } else {
    for (let i = 0; i < childBirthYears.length; i++) {
      const year = childBirthYears[i]
      if (!isFiniteNumber(year) || year < 1900 || year > 2200) {
        ds.push(diag(
          `profile.childBirthYears[${i}]`,
          'INVALID_RANGE',
          `childBirthYears[${i}] must be a finite year between 1900 and 2200.`,
        ))
      }
    }
  }

  if (typeof churchTax !== 'boolean') {
    ds.push(diag('profile.churchTax', 'INVALID_TYPE', 'churchTax must be a boolean.'))
  }

  if (typeof publicHealthInsurance !== 'boolean') {
    ds.push(diag('profile.publicHealthInsurance', 'INVALID_TYPE', 'publicHealthInsurance must be a boolean.'))
  }

  if (
    !isFiniteNumber(healthAdditionalContributionPct) ||
    healthAdditionalContributionPct < 0 ||
    healthAdditionalContributionPct > 10
  ) {
    ds.push(diag('profile.healthAdditionalContributionPct', 'INVALID_RANGE', 'healthAdditionalContributionPct must be a finite number between 0 and 10.'))
  }

  if (!isFiniteNumber(pkvMonthlyPremium) || pkvMonthlyPremium < 0) {
    ds.push(diag('profile.pkvMonthlyPremium', 'INVALID_RANGE', 'pkvMonthlyPremium must be a non-negative finite number.'))
  }

  if (!isFiniteNumber(pPVMonthlyPremium) || pPVMonthlyPremium < 0) {
    ds.push(diag('profile.pPVMonthlyPremium', 'INVALID_RANGE', 'pPVMonthlyPremium must be a non-negative finite number.'))
  }

  // desiredNetMonthlyPension is optional — only validate when present.
  if (desiredNetMonthlyPension !== undefined) {
    if (!isFiniteNumber(desiredNetMonthlyPension) || desiredNetMonthlyPension < 0) {
      ds.push(diag('profile.desiredNetMonthlyPension', 'INVALID_RANGE', 'desiredNetMonthlyPension must be a non-negative finite number when provided.'))
    }
  }

  return ds
}

// ---------------------------------------------------------------------------
// Shared assumptions validation
// ---------------------------------------------------------------------------

export function validateSharedAssumptions(
  assumptions: unknown,
  productIds: readonly string[] = PRODUCT_IDS as readonly string[],
): ApiDiagnostic[] {
  const ds: ApiDiagnostic[] = []
  if (!isRecord(assumptions)) {
    ds.push(diag('assumptions', 'INVALID_TYPE', 'assumptions must be an object.'))
    return ds
  }

  // visibleProducts — explicit empty array is valid
  const { visibleProducts } = assumptions
  if (Array.isArray(visibleProducts)) {
    for (let i = 0; i < visibleProducts.length; i++) {
      if (!productIds.includes(visibleProducts[i] as string)) {
        ds.push(diag(
          'assumptions.visibleProducts',
          'UNKNOWN_PRODUCT_ID',
          `Unknown product id "${visibleProducts[i]}" at index ${i}. Valid: [${productIds.join(', ')}].`,
        ))
      }
    }
  } else if (visibleProducts !== undefined) {
    ds.push(diag('assumptions.visibleProducts', 'INVALID_TYPE', 'visibleProducts must be an array.'))
  }

  // returnScenarios
  const { returnScenarios } = assumptions
  if (!Array.isArray(returnScenarios) || returnScenarios.length === 0) {
    ds.push(diag('assumptions.returnScenarios', 'INVALID_VALUE', 'returnScenarios must be a non-empty array.'))
  } else if (returnScenarios.length > MAX_RETURN_SCENARIOS) {
    ds.push(diag(
      'assumptions.returnScenarios',
      'TOO_MANY_SCENARIOS',
      `returnScenarios must contain at most ${MAX_RETURN_SCENARIOS} entries.`,
    ))
  } else {
    const seenIds = new Set<string>()
    for (let i = 0; i < returnScenarios.length; i++) {
      const s = returnScenarios[i]
      if (!isRecord(s)) {
        ds.push(diag(
          `assumptions.returnScenarios[${i}]`,
          'INVALID_TYPE',
          `returnScenarios[${i}] must be an object.`,
        ))
        continue
      }
      if (
        !isFiniteNumber(s.annualReturn) ||
        s.annualReturn < SCENARIO_ANNUAL_RETURN_MIN ||
        s.annualReturn > SCENARIO_ANNUAL_RETURN_MAX
      ) {
        ds.push(diag(
          `assumptions.returnScenarios[${i}].annualReturn`,
          'INVALID_RANGE',
          `returnScenarios[${i}].annualReturn must be a finite number between ${SCENARIO_ANNUAL_RETURN_MIN} and ${SCENARIO_ANNUAL_RETURN_MAX}.`,
        ))
      }
      if (typeof s.id !== 'string' || s.id === '') {
        ds.push(diag(
          `assumptions.returnScenarios[${i}].id`,
          'INVALID_TYPE',
          `returnScenarios[${i}].id must be a non-empty string.`,
        ))
      } else if (!(VALID_SCENARIO_IDS as readonly string[]).includes(s.id)) {
        ds.push(diag(
          `assumptions.returnScenarios[${i}].id`,
          'UNKNOWN_SCENARIO_ID',
          `Unknown scenario id "${s.id}" at index ${i}. Valid: [${VALID_SCENARIO_IDS.join(', ')}].`,
        ))
      } else {
        if (seenIds.has(s.id)) {
          ds.push(diag(
            `assumptions.returnScenarios[${i}].id`,
            'DUPLICATE_SCENARIO_ID',
            `Duplicate returnScenarios id "${s.id}" at index ${i}.`,
          ))
        }
        seenIds.add(s.id)
      }
      if (typeof s.label !== 'string' || s.label === '') {
        ds.push(diag(
          `assumptions.returnScenarios[${i}].label`,
          'INVALID_TYPE',
          `returnScenarios[${i}].label must be a non-empty string.`,
        ))
      }
    }
  }

  // retirementEndAge
  const { retirementEndAge } = assumptions
  if (!isFiniteNumber(retirementEndAge) || retirementEndAge <= 0 || retirementEndAge > 120) {
    ds.push(diag('assumptions.retirementEndAge', 'INVALID_RANGE', 'retirementEndAge must be a finite positive number at most 120.'))
  }

  // inflationRate (canonical bounds: -0.1 .. 0.2 — matches storage schema)
  const { inflationRate } = assumptions
  if (!isFiniteNumber(inflationRate) || inflationRate < INFLATION_MIN || inflationRate > INFLATION_MAX) {
    ds.push(diag(
      'assumptions.inflationRate',
      'INVALID_RANGE',
      `inflationRate must be a finite number between ${INFLATION_MIN} and ${INFLATION_MAX}.`,
    ))
  }

  // monteCarlo (canonical bounds — matches storage schema)
  const { monteCarlo } = assumptions
  if (isRecord(monteCarlo)) {
    // runs must be an integer in [100, 5000]
    if (!isInt(monteCarlo.runs) || monteCarlo.runs < MC_RUNS_MIN || monteCarlo.runs > MC_RUNS_MAX) {
      ds.push(diag(
        'assumptions.monteCarlo.runs',
        'INVALID_RANGE',
        `monteCarlo.runs must be an integer between ${MC_RUNS_MIN} and ${MC_RUNS_MAX}.`,
      ))
    }
    // annualVolatility in [0, 0.6]
    if (
      !isFiniteNumber(monteCarlo.annualVolatility) ||
      monteCarlo.annualVolatility < MC_VOLATILITY_MIN ||
      monteCarlo.annualVolatility > MC_VOLATILITY_MAX
    ) {
      ds.push(diag(
        'assumptions.monteCarlo.annualVolatility',
        'INVALID_RANGE',
        `monteCarlo.annualVolatility must be a finite number between ${MC_VOLATILITY_MIN} and ${MC_VOLATILITY_MAX}.`,
      ))
    }
    if (monteCarlo.enabled !== undefined && typeof monteCarlo.enabled !== 'boolean') {
      ds.push(diag('assumptions.monteCarlo.enabled', 'INVALID_TYPE', 'monteCarlo.enabled must be a boolean.'))
    }
    // seed must be an integer in [1, 2^31 - 1] when provided
    if (monteCarlo.seed !== undefined) {
      if (
        !isInt(monteCarlo.seed) ||
        monteCarlo.seed < MC_SEED_MIN ||
        monteCarlo.seed > MC_SEED_MAX
      ) {
        ds.push(diag(
          'assumptions.monteCarlo.seed',
          'INVALID_RANGE',
          `monteCarlo.seed must be an integer between ${MC_SEED_MIN} and ${MC_SEED_MAX}.`,
        ))
      }
    }
  }

  return ds
}

// ---------------------------------------------------------------------------
// Product-specific assumptions validation
// ---------------------------------------------------------------------------

export function validateProductAssumptions(
  assumptions: Record<string, unknown>,
): ApiDiagnostic[] {
  const ds: ApiDiagnostic[] = []

  for (const entry of PRODUCT_REGISTRY) {
    const key = entry.assumptionsKey
    const value = assumptions[key]
    if (value === undefined) continue

    if (!entry.validate(value)) {
      ds.push(diag(
        `assumptions.${key}`,
        'PRODUCT_VALIDATION_FAILED',
        `Product validation failed for "${key}".`,
      ))
    }
  }

  return ds
}

// ---------------------------------------------------------------------------
// Top-level orchestrator
// ---------------------------------------------------------------------------

export function validateComparisonRequest(request: {
  profile?: unknown
  assumptions?: unknown
  ruleYear?: number
}): ApiDiagnostic[] {
  const ds: ApiDiagnostic[] = []

  // Rule year
  if (request.ruleYear !== undefined) {
    const ruleResult = resolveRuleYear(request.ruleYear)
    if (!ruleResult.ok) {
      ds.push(...ruleResult.errors)
    }
  }

  // Profile
  if (request.profile !== undefined) {
    ds.push(...validateProfile(request.profile))
  }

  // Shared + product assumptions
  if (request.assumptions !== undefined) {
    ds.push(...validateSharedAssumptions(request.assumptions))

    if (isRecord(request.assumptions)) {
      ds.push(...validateProductAssumptions(request.assumptions as Record<string, unknown>))
    }
  }

  return ds
}
