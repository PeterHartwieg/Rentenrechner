/**
 * Tax & salary API facade — wraps engine tax primitives and salary calculation
 * in the standard ApiResult envelope.
 *
 * All functions are pure, synchronous, and free of browser/React deps.
 */

import type { PersonalProfile } from '../domain'
import type { ApiProfile } from './apiTypes'
import type { ApiResult, ApiDiagnostic } from './contracts'
import { API_VERSION, success, error, safeEngineCall, findNaN } from './contracts'
import { resolveRuleYear } from './rules'
import { validateProfile } from './validation'
import { calculateIncomeTax2026, calculateSolidarityTax, calculateCapitalGainsTax } from '../engine/tax'
import { calculateSalaryResult } from '../engine/salary'

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

// ---------------------------------------------------------------------------
// Income tax
// ---------------------------------------------------------------------------

export interface IncomeTaxRequest {
  ruleYear?: number
  taxableIncome: number
}

export interface IncomeTaxResponse {
  taxableIncome: number
  incomeTax: number
}

export function calculateIncomeTax(
  request: IncomeTaxRequest,
): ApiResult<IncomeTaxResponse> {
  // 1. Resolve rules
  const ruleResult = resolveRuleYear(request.ruleYear)
  if (!ruleResult.ok) return ruleResult
  const { rules, ruleYear } = ruleResult.data
  const meta = { apiVersion: API_VERSION, ruleYear }

  // 2. Validate
  if (typeof request.taxableIncome !== 'number' || !Number.isFinite(request.taxableIncome) || request.taxableIncome < 0) {
    return error(
      [diag('taxableIncome', 'INVALID_RANGE', 'taxableIncome must be a non-negative finite number.')],
      meta,
    )
  }

  // 3. Compute (wrapped)
  const engineResult = safeEngineCall(
    () => calculateIncomeTax2026(request.taxableIncome, rules),
    meta,
  )
  if (!engineResult.ok) return engineResult

  return success(
    { taxableIncome: request.taxableIncome, incomeTax: engineResult.value },
    meta,
  )
}

// ---------------------------------------------------------------------------
// Solidarity tax
// ---------------------------------------------------------------------------

export interface SolidarityRequest {
  ruleYear?: number
  incomeTax: number
  filingStatus?: 'single' | 'married'
}

export interface SolidarityResponse {
  incomeTax: number
  filingStatus: 'single' | 'married'
  solidarityTax: number
}

export function calculateSolidarity(
  request: SolidarityRequest,
): ApiResult<SolidarityResponse> {
  const ruleResult = resolveRuleYear(request.ruleYear)
  if (!ruleResult.ok) return ruleResult
  const { rules, ruleYear } = ruleResult.data
  const meta = { apiVersion: API_VERSION, ruleYear }

  if (typeof request.incomeTax !== 'number' || !Number.isFinite(request.incomeTax) || request.incomeTax < 0) {
    return error(
      [diag('incomeTax', 'INVALID_RANGE', 'incomeTax must be a non-negative finite number.')],
      meta,
    )
  }

  const filingStatus = request.filingStatus ?? 'single'

  const engineResult = safeEngineCall(
    () => calculateSolidarityTax(request.incomeTax, rules, filingStatus),
    meta,
  )
  if (!engineResult.ok) return engineResult

  return success(
    { incomeTax: request.incomeTax, filingStatus, solidarityTax: engineResult.value },
    meta,
  )
}

// ---------------------------------------------------------------------------
// Capital gains tax
// ---------------------------------------------------------------------------

export interface CapitalGainsRequest {
  ruleYear?: number
  gain: number
  partialExemption?: number
  annualAllowance?: number
}

export interface CapitalGainsResponse {
  gain: number
  partialExemption: number
  annualAllowance: number
  capitalGainsTax: number
}

export function calculateCapitalGains(
  request: CapitalGainsRequest,
): ApiResult<CapitalGainsResponse> {
  const ruleResult = resolveRuleYear(request.ruleYear)
  if (!ruleResult.ok) return ruleResult
  const { rules, ruleYear } = ruleResult.data
  const meta = { apiVersion: API_VERSION, ruleYear }

  if (typeof request.gain !== 'number' || !Number.isFinite(request.gain)) {
    return error(
      [diag('gain', 'INVALID_TYPE', 'gain must be a finite number.')],
      meta,
    )
  }

  // partialExemption: optional; when present must be a finite number in [0, 1].
  if (request.partialExemption !== undefined) {
    if (
      typeof request.partialExemption !== 'number' ||
      !Number.isFinite(request.partialExemption) ||
      request.partialExemption < 0 ||
      request.partialExemption > 1
    ) {
      return error(
        [diag('partialExemption', 'INVALID_RANGE', 'partialExemption must be a finite number between 0 and 1.')],
        meta,
      )
    }
  }

  // annualAllowance: optional; when present must be a non-negative finite number.
  if (request.annualAllowance !== undefined) {
    if (
      typeof request.annualAllowance !== 'number' ||
      !Number.isFinite(request.annualAllowance) ||
      request.annualAllowance < 0
    ) {
      return error(
        [diag('annualAllowance', 'INVALID_RANGE', 'annualAllowance must be a non-negative finite number.')],
        meta,
      )
    }
  }

  const partialExemption = request.partialExemption ?? 0
  const annualAllowance = request.annualAllowance ?? rules.capitalGains.saverAllowance

  const engineResult = safeEngineCall(
    () => calculateCapitalGainsTax(request.gain, rules, partialExemption, annualAllowance),
    meta,
  )
  if (!engineResult.ok) return engineResult

  const data: CapitalGainsResponse = {
    gain: request.gain,
    partialExemption,
    annualAllowance,
    capitalGainsTax: engineResult.value,
  }

  const nanPath = findNaN(data)
  if (nanPath) {
    return error(
      [diag(nanPath, 'COMPUTATION_NAN', `Computation produced NaN at ${nanPath}.`)],
      meta,
    )
  }

  return success(data, meta)
}

// ---------------------------------------------------------------------------
// Salary
// ---------------------------------------------------------------------------

export interface SalaryRequest {
  ruleYear?: number
  profile: ApiProfile
}

export interface SalaryResponse {
  annualGross: number
  annualNet: number
  annualTaxableIncome: number
  annualIncomeTax: number
  annualSolidarity: number
  socialContributions: {
    healthInsurance: number
    pensionInsurance: number
    unemploymentInsurance: number
    nursingCareInsurance: number
    total: number
  }
  vorsorgepauschale: number
  monthlyNet: number
  pkvEmployerSubsidy?: number
}

export function calculateSalary(
  request: SalaryRequest,
): ApiResult<SalaryResponse> {
  const ruleResult = resolveRuleYear(request.ruleYear)
  if (!ruleResult.ok) return ruleResult
  const { rules, ruleYear } = ruleResult.data
  const meta = { apiVersion: API_VERSION, ruleYear }

  // Validate profile
  const diagnostics = validateProfile(request.profile)
  const errors = diagnostics.filter((d) => d.severity === 'error')
  const warnings = diagnostics.filter((d) => d.severity === 'warning')

  if (errors.length > 0) {
    return error(errors, meta, warnings)
  }

  // Compute (wrapped)
  const engineResult = safeEngineCall(
    () => calculateSalaryResult(request.profile as unknown as PersonalProfile, rules),
    meta,
  )
  if (!engineResult.ok) return engineResult
  const result = engineResult.value

  // Map engine SalaryResult to the API DTO
  const data: SalaryResponse = {
    annualGross: result.annualGross,
    annualNet: result.annualNet,
    annualTaxableIncome: result.taxableIncome,
    annualIncomeTax: result.incomeTax,
    annualSolidarity: result.solidarityTax,
    socialContributions: {
      healthInsurance: result.social.health,
      pensionInsurance: result.social.pension,
      unemploymentInsurance: result.social.unemployment,
      nursingCareInsurance: result.social.care,
      total: result.social.total,
    },
    vorsorgepauschale: result.vorsorgepauschale,
    monthlyNet: result.annualNet / 12,
  }

  // Include PKV employer subsidy only when relevant (PKV member)
  if (!request.profile.publicHealthInsurance) {
    data.pkvEmployerSubsidy = result.pkv257SubsidyMonthly
  }

  const nanPath = findNaN(data)
  if (nanPath) {
    return error(
      [diag(nanPath, 'COMPUTATION_NAN', `Computation produced NaN at ${nanPath}.`)],
      meta,
    )
  }

  return success(data, meta, warnings)
}
