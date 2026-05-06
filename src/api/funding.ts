/**
 * Salary-phase funding API — wraps engine funding calculations for bAV,
 * Basisrente, Altersvorsorgedepot, and Riester in the API envelope.
 *
 * Each function validates the profile, resolves rules, computes internal
 * SalaryResult where needed, and maps engine result types to API-owned DTOs.
 */

import type {
  BavAssumptions,
  BasisrenteAssumptions,
  AltersvorsorgedepotAssumptions,
  RiesterAssumptions,
  PersonalProfile,
} from '../domain'
import type {
  ApiProfile,
  ApiBavAssumptions,
  ApiBasisrenteAssumptions,
  ApiAltersvorsorgedepotAssumptions,
  ApiRiesterAssumptions,
} from './apiTypes'
import type { ApiResult } from './contracts'
import { API_VERSION, success, error, safeEngineCall, findNaN, requireObject } from './contracts'
import { resolveRuleYear } from './rules'
import { validateProfile } from './validation'
import { calculateBavFunding, solveBavGrossFromNet, calculateSalaryResult } from '../engine/salary'
import { calculateBasisrenteFunding } from '../engine/basisrente'
import { calculateAvdFunding } from '../engine/altersvorsorgedepot'
import { calculateRiesterFunding } from '../engine/riester'

// ---------------------------------------------------------------------------
// bAV Funding
// ---------------------------------------------------------------------------

export interface BavFundingRequest {
  ruleYear?: number
  profile: ApiProfile
  bav: ApiBavAssumptions
}

export interface BavFundingResponse {
  monthlyGrossConversion: number
  monthlyNetCost: number
  monthlyTaxAndSvSavings: number
  monthlyStatutoryEmployerSubsidy: number
  monthlyContractualEmployerContribution: number
  monthlyEmployerContribution: number
  estimatedMonthlyGrvReduction: number
  taxFreePortionAnnual: number
  svFreePortionAnnual: number
  taxableOverflowAnnual: number
}

export function calculateBavFundingApi(
  request: BavFundingRequest,
): ApiResult<BavFundingResponse> {
  // 1. Resolve rules
  const ruleResult = resolveRuleYear(request.ruleYear)
  if (!ruleResult.ok) return ruleResult
  const { rules, ruleYear } = ruleResult.data
  const meta = { apiVersion: API_VERSION, ruleYear }

  // 2. Validate profile
  const profileErrors = validateProfile(request.profile)
  const errors = profileErrors.filter((d) => d.severity === 'error')
  const warnings = profileErrors.filter((d) => d.severity === 'warning')
  if (errors.length > 0) return error(errors, meta, warnings)

  // 3. Validate product assumptions
  const bavCheck = requireObject(request.bav, 'bav')
  if (bavCheck) return error([bavCheck], meta, warnings)

  // 4. Call engine (wrapped)
  const engineResult = safeEngineCall(
    () => calculateBavFunding(
      request.profile as unknown as PersonalProfile,
      rules,
      request.bav as unknown as BavAssumptions,
    ),
    meta,
  )
  if (!engineResult.ok) return engineResult
  const result = engineResult.value

  // 5. Map to DTO
  const data: BavFundingResponse = {
    monthlyGrossConversion: result.monthlyGrossConversion,
    monthlyNetCost: result.monthlyNetCost,
    monthlyTaxAndSvSavings: result.monthlyTaxAndSvSavings,
    monthlyStatutoryEmployerSubsidy: result.monthlyStatutoryEmployerSubsidy,
    monthlyContractualEmployerContribution: result.monthlyContractualEmployerContribution,
    monthlyEmployerContribution: result.monthlyEmployerContribution,
    estimatedMonthlyGrvReduction: result.estimatedMonthlyGrvReduction,
    taxFreePortionAnnual: result.taxFreePortionAnnual,
    svFreePortionAnnual: result.svFreePortionAnnual,
    taxableOverflowAnnual: result.taxableOverflowAnnual,
  }

  const nanPath = findNaN(data)
  if (nanPath) {
    return error(
      [{ path: nanPath, code: 'COMPUTATION_NAN', severity: 'error', message: `Computation produced NaN at ${nanPath}.` }],
      meta,
    )
  }

  return success<BavFundingResponse>(data, meta, warnings)
}

// ---------------------------------------------------------------------------
// bAV Gross-from-Net Solve
// ---------------------------------------------------------------------------

export interface BavSolveRequest {
  ruleYear?: number
  profile: ApiProfile
  bav: ApiBavAssumptions
  targetMonthlyNet: number
}

export interface BavSolveResponse {
  monthlyGrossConversion: number
  targetMonthlyNet: number
}

export function solveBavGrossFromNetApi(
  request: BavSolveRequest,
): ApiResult<BavSolveResponse> {
  const ruleResult = resolveRuleYear(request.ruleYear)
  if (!ruleResult.ok) return ruleResult
  const { rules, ruleYear } = ruleResult.data
  const meta = { apiVersion: API_VERSION, ruleYear }

  const profileErrors = validateProfile(request.profile)
  const errors = profileErrors.filter((d) => d.severity === 'error')
  const warnings = profileErrors.filter((d) => d.severity === 'warning')
  if (errors.length > 0) return error(errors, meta, warnings)

  // Validate product assumptions
  const bavCheck = requireObject(request.bav, 'bav')
  if (bavCheck) return error([bavCheck], meta, warnings)

  // Validate targetMonthlyNet
  if (typeof request.targetMonthlyNet !== 'number' || !isFinite(request.targetMonthlyNet) || request.targetMonthlyNet <= 0) {
    return error(
      [{ path: 'targetMonthlyNet', code: 'INVALID_INPUT', severity: 'error', message: 'targetMonthlyNet must be a positive number.' }],
      meta,
      warnings,
    )
  }

  const engineResult = safeEngineCall(
    () => solveBavGrossFromNet(
      request.targetMonthlyNet,
      request.profile as unknown as PersonalProfile,
      rules,
      request.bav as unknown as BavAssumptions,
    ),
    meta,
  )
  if (!engineResult.ok) return engineResult
  const gross = engineResult.value

  const data: BavSolveResponse = {
    monthlyGrossConversion: gross,
    targetMonthlyNet: request.targetMonthlyNet,
  }

  const nanPath = findNaN(data)
  if (nanPath) {
    return error(
      [{ path: nanPath, code: 'COMPUTATION_NAN', severity: 'error', message: `Computation produced NaN at ${nanPath}.` }],
      meta,
    )
  }

  return success<BavSolveResponse>(data, meta, warnings)
}

// ---------------------------------------------------------------------------
// Basisrente Funding
// ---------------------------------------------------------------------------

export interface BasisrenteFundingRequest {
  ruleYear?: number
  profile: ApiProfile
  basisrente: ApiBasisrenteAssumptions
}

export interface BasisrenteFundingResponse {
  monthlyGrossContribution: number
  monthlyNetCost: number
  annualTaxSaving: number
  annualDeductible: number
  remainingSchicht1Cap: number
}

export function calculateBasisrenteFundingApi(
  request: BasisrenteFundingRequest,
): ApiResult<BasisrenteFundingResponse> {
  const ruleResult = resolveRuleYear(request.ruleYear)
  if (!ruleResult.ok) return ruleResult
  const { rules, ruleYear } = ruleResult.data
  const meta = { apiVersion: API_VERSION, ruleYear }

  const profileErrors = validateProfile(request.profile)
  const errors = profileErrors.filter((d) => d.severity === 'error')
  const warnings = profileErrors.filter((d) => d.severity === 'warning')
  if (errors.length > 0) return error(errors, meta, warnings)

  // Validate product assumptions
  const basisCheck = requireObject(request.basisrente, 'basisrente')
  if (basisCheck) return error([basisCheck], meta, warnings)

  // Basisrente funding needs a SalaryResult; compute it from the profile.
  const engineResult = safeEngineCall(
    () => {
      const salaryResult = calculateSalaryResult(request.profile as unknown as PersonalProfile, rules)
      return calculateBasisrenteFunding(rules, salaryResult, request.basisrente as unknown as BasisrenteAssumptions)
    },
    meta,
  )
  if (!engineResult.ok) return engineResult
  const result = engineResult.value

  const data: BasisrenteFundingResponse = {
    monthlyGrossContribution: result.monthlyGrossContribution,
    monthlyNetCost: result.monthlyNetCost,
    annualTaxSaving: result.annualTaxSaving,
    annualDeductible: result.annualDeductible,
    remainingSchicht1Cap: result.remainingSchicht1Cap,
  }

  const nanPath = findNaN(data)
  if (nanPath) {
    return error(
      [{ path: nanPath, code: 'COMPUTATION_NAN', severity: 'error', message: `Computation produced NaN at ${nanPath}.` }],
      meta,
    )
  }

  return success<BasisrenteFundingResponse>(data, meta, warnings)
}

// ---------------------------------------------------------------------------
// Altersvorsorgedepot (AVD) Funding
// ---------------------------------------------------------------------------

export interface AvdFundingRequest {
  ruleYear?: number
  profile: ApiProfile
  altersvorsorgedepot: ApiAltersvorsorgedepotAssumptions
}

export interface AvdFundingResponse {
  monthlyOwnContribution: number
  monthlyNetCost: number
  totalAllowanceAnnual: number
  basicAllowanceAnnual: number
  childAllowanceAnnual: number
  careerStarterBonusAnnual: number
  guenstigerpruefungBenefitAnnual: number
  cappedAtContractMax: boolean
}

export function calculateAvdFundingApi(
  request: AvdFundingRequest,
): ApiResult<AvdFundingResponse> {
  const ruleResult = resolveRuleYear(request.ruleYear)
  if (!ruleResult.ok) return ruleResult
  const { rules, ruleYear } = ruleResult.data
  const meta = { apiVersion: API_VERSION, ruleYear }

  const profileErrors = validateProfile(request.profile)
  const errors = profileErrors.filter((d) => d.severity === 'error')
  const warnings = profileErrors.filter((d) => d.severity === 'warning')
  if (errors.length > 0) return error(errors, meta, warnings)

  // Validate product assumptions
  const avdCheck = requireObject(request.altersvorsorgedepot, 'altersvorsorgedepot')
  if (avdCheck) return error([avdCheck], meta, warnings)

  const engineResult = safeEngineCall(
    () => {
      const salaryResult = calculateSalaryResult(request.profile as unknown as PersonalProfile, rules)
      return calculateAvdFunding(rules, salaryResult, request.altersvorsorgedepot as unknown as AltersvorsorgedepotAssumptions)
    },
    meta,
  )
  if (!engineResult.ok) return engineResult
  const result = engineResult.value

  const data: AvdFundingResponse = {
    monthlyOwnContribution: result.monthlyOwnContribution,
    monthlyNetCost: result.monthlyNetCost,
    totalAllowanceAnnual: result.totalAllowanceAnnual,
    basicAllowanceAnnual: result.basicAllowanceAnnual,
    childAllowanceAnnual: result.childAllowanceAnnual,
    careerStarterBonusAnnual: result.careerStarterBonusAnnual,
    guenstigerpruefungBenefitAnnual: result.guenstigerpruefungBenefitAnnual,
    cappedAtContractMax: result.cappedAtContractMax,
  }

  const nanPath = findNaN(data)
  if (nanPath) {
    return error(
      [{ path: nanPath, code: 'COMPUTATION_NAN', severity: 'error', message: `Computation produced NaN at ${nanPath}.` }],
      meta,
    )
  }

  return success<AvdFundingResponse>(data, meta, warnings)
}

// ---------------------------------------------------------------------------
// Riester Funding
// ---------------------------------------------------------------------------

export interface RiesterFundingRequest {
  ruleYear?: number
  profile: ApiProfile
  riester: ApiRiesterAssumptions
}

export interface RiesterFundingResponse {
  monthlyOwnContribution: number
  monthlyNetCost: number
  grundzulageAnnual: number
  childAllowanceAnnual: number
  totalAllowanceAnnual: number
  meetsMinContribution: boolean
  guenstigerpruefungBenefitAnnual: number
}

export function calculateRiesterFundingApi(
  request: RiesterFundingRequest,
): ApiResult<RiesterFundingResponse> {
  const ruleResult = resolveRuleYear(request.ruleYear)
  if (!ruleResult.ok) return ruleResult
  const { rules, ruleYear } = ruleResult.data
  const meta = { apiVersion: API_VERSION, ruleYear }

  const profileErrors = validateProfile(request.profile)
  const errors = profileErrors.filter((d) => d.severity === 'error')
  const warnings = profileErrors.filter((d) => d.severity === 'warning')
  if (errors.length > 0) return error(errors, meta, warnings)

  // Validate product assumptions
  const riesterCheck = requireObject(request.riester, 'riester')
  if (riesterCheck) return error([riesterCheck], meta, warnings)

  const engineResult = safeEngineCall(
    () => {
      const salaryResult = calculateSalaryResult(request.profile as unknown as PersonalProfile, rules)
      return calculateRiesterFunding(rules, salaryResult, request.riester as unknown as RiesterAssumptions, request.profile as unknown as PersonalProfile)
    },
    meta,
  )
  if (!engineResult.ok) return engineResult
  const result = engineResult.value

  const data: RiesterFundingResponse = {
    monthlyOwnContribution: result.monthlyOwnContribution,
    monthlyNetCost: result.monthlyNetCost,
    grundzulageAnnual: result.grundzulageAnnual,
    childAllowanceAnnual: result.childAllowanceAnnual,
    totalAllowanceAnnual: result.totalAllowanceAnnual,
    meetsMinContribution: result.meetsMinContribution,
    guenstigerpruefungBenefitAnnual: result.guenstigerpruefungBenefitAnnual,
  }

  const nanPath = findNaN(data)
  if (nanPath) {
    return error(
      [{ path: nanPath, code: 'COMPUTATION_NAN', severity: 'error', message: `Computation produced NaN at ${nanPath}.` }],
      meta,
    )
  }

  return success<RiesterFundingResponse>(data, meta, warnings)
}
