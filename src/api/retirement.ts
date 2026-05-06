/**
 * Retirement-phase tax, KV/PV, and diagnostic API — wraps the retirement-tax
 * pipeline and payout-mode derivation helpers in the API envelope.
 */

import type {
  RetirementIncomeComponents,
  RetirementKvPvContext,
  RetirementTaxBreakdown,
  RetirementKvPvBreakdown,
  BavDurchfuehrungsweg,
} from '../domain'
import type {
  ApiRetirementIncomeComponents,
  ApiRetirementKvPvContext,
  ApiBavDurchfuehrungsweg,
} from './apiTypes'
import type { ApiResult } from './contracts'
import { API_VERSION, success, error, safeEngineCall, findNaN, requireNumericFields } from './contracts'
import { resolveRuleYear } from './rules'
import { calculateRetirementTax, calculateRetirementKvPv } from '../engine/retirementTax'
import { deriveInsuranceTaxMode } from '../engine/insurancePayout'
import { deriveBavLumpSumTaxMode } from '../engine/bavPayout'

// ---------------------------------------------------------------------------
// Retirement Tax
// ---------------------------------------------------------------------------

export interface RetirementTaxRequest {
  ruleYear?: number
  components: ApiRetirementIncomeComponents
  filingStatus?: 'single' | 'married'
}

export interface RetirementTaxResponse {
  statutoryPensionTaxable: number
  bavPensionTaxable: number
  privateInsuranceTaxable: number
  otherTaxable: number
  werbungskostenVersorgung: number
  werbungskostenRenten: number
  sonderausgaben: number
  zuVersteuerndesEinkommen: number
  einkommensteuer: number
  solidaritaetszuschlag: number
  abgeltungsteuerOnPrivateInsurance: number
  totalTaxAnnual: number
  netRetirementIncomeAnnual: number
}

export function calculateRetirementTaxApi(
  request: RetirementTaxRequest,
): ApiResult<RetirementTaxResponse> {
  const ruleResult = resolveRuleYear(request.ruleYear)
  if (!ruleResult.ok) return ruleResult
  const { rules, ruleYear } = ruleResult.data
  const meta = { apiVersion: API_VERSION, ruleYear }

  // Structural validation: components must be an object with expected numeric fields
  const compCheck = requireNumericFields(request.components, 'components', [
    'statutoryPensionAnnual',
    'bavPensionAnnual',
    'privateInsuranceTaxableAnnual',
    'otherTaxableAnnual',
    'retirementYear',
  ])
  if (compCheck) return error([compCheck], meta)

  const engineResult = safeEngineCall(
    () => calculateRetirementTax(request.components as unknown as RetirementIncomeComponents, rules, request.filingStatus),
    meta,
  )
  if (!engineResult.ok) return engineResult

  const result: RetirementTaxBreakdown = engineResult.value

  const data: RetirementTaxResponse = {
    statutoryPensionTaxable: result.statutoryPensionTaxable,
    bavPensionTaxable: result.bavPensionTaxable,
    privateInsuranceTaxable: result.privateInsuranceTaxable,
    otherTaxable: result.otherTaxable,
    werbungskostenVersorgung: result.werbungskostenVersorgung,
    werbungskostenRenten: result.werbungskostenRenten,
    sonderausgaben: result.sonderausgaben,
    zuVersteuerndesEinkommen: result.zuVersteuerndesEinkommen,
    einkommensteuer: result.einkommensteuer,
    solidaritaetszuschlag: result.solidaritaetszuschlag,
    abgeltungsteuerOnPrivateInsurance: result.abgeltungsteuerOnPrivateInsurance,
    totalTaxAnnual: result.totalTaxAnnual,
    netRetirementIncomeAnnual: result.netRetirementIncomeAnnual,
  }

  const nanPath = findNaN(data)
  if (nanPath) {
    return error(
      [{ path: nanPath, code: 'COMPUTATION_NAN', severity: 'error', message: `Computation produced NaN at ${nanPath}.` }],
      meta,
    )
  }

  return success<RetirementTaxResponse>(data, meta)
}

// ---------------------------------------------------------------------------
// Retirement KV/PV
// ---------------------------------------------------------------------------

export interface RetirementKvPvRequest {
  ruleYear?: number
  context: ApiRetirementKvPvContext
}

export interface RetirementKvPvResponse {
  bavKvMonthly: number
  bavPvMonthly: number
  otherVersorgungsbezuegeKvMonthly: number
  otherVersorgungsbezuegePvMonthly: number
  statutoryPensionKvMonthly: number
  statutoryPensionPvMonthly: number
  freiwilligOtherKvMonthly: number
  freiwilligOtherPvMonthly: number
  totalKvMonthly: number
  totalPvMonthly: number
  uncappedKvMonthly: number
  uncappedPvMonthly: number
}

export function calculateRetirementKvPvApi(
  request: RetirementKvPvRequest,
): ApiResult<RetirementKvPvResponse> {
  const ruleResult = resolveRuleYear(request.ruleYear)
  if (!ruleResult.ok) return ruleResult
  const { rules, ruleYear } = ruleResult.data
  const meta = { apiVersion: API_VERSION, ruleYear }

  // Structural validation: context must be an object with expected numeric fields
  const ctxCheck = requireNumericFields(request.context, 'context', [
    'bavMonthlyVersorgungsbezuege',
    'otherMonthlyVersorgungsbezuege',
    'monthlyStatutoryPension',
    'freiwilligOtherMonthlyIncome',
    'kvFreibetragVersorgungMonthly',
    'pvFreigrenzeVersorgungMonthly',
    'monthlyKvPvBbg',
    'healthRate',
    'careRate',
  ])
  if (ctxCheck) return error([ctxCheck], meta)

  const engineResult = safeEngineCall(() => calculateRetirementKvPv(request.context as unknown as RetirementKvPvContext), meta)
  if (!engineResult.ok) return engineResult

  const result: RetirementKvPvBreakdown = engineResult.value

  // rules is resolved for the meta envelope; the engine function uses the
  // context's own rate fields, not rules directly.
  void rules

  const data: RetirementKvPvResponse = {
    bavKvMonthly: result.bavKvMonthly,
    bavPvMonthly: result.bavPvMonthly,
    otherVersorgungsbezuegeKvMonthly: result.otherVersorgungsbezuegeKvMonthly,
    otherVersorgungsbezuegePvMonthly: result.otherVersorgungsbezuegePvMonthly,
    statutoryPensionKvMonthly: result.statutoryPensionKvMonthly,
    statutoryPensionPvMonthly: result.statutoryPensionPvMonthly,
    freiwilligOtherKvMonthly: result.freiwilligOtherKvMonthly,
    freiwilligOtherPvMonthly: result.freiwilligOtherPvMonthly,
    totalKvMonthly: result.totalKvMonthly,
    totalPvMonthly: result.totalPvMonthly,
    uncappedKvMonthly: result.uncappedKvMonthly,
    uncappedPvMonthly: result.uncappedPvMonthly,
  }

  const nanPath = findNaN(data)
  if (nanPath) {
    return error(
      [{ path: nanPath, code: 'COMPUTATION_NAN', severity: 'error', message: `Computation produced NaN at ${nanPath}.` }],
      meta,
    )
  }

  return success<RetirementKvPvResponse>(data, meta)
}

// ---------------------------------------------------------------------------
// Insurance Tax Mode Derivation
// ---------------------------------------------------------------------------

export interface InsuranceTaxModeRequest {
  contractStartYear: number
  contractRuntimeYears: number
  retirementAge: number
  oldContractTaxFreeEligible?: boolean
}

export interface InsuranceTaxModeResponse {
  taxMode: string
  contractStartYear: number
  contractRuntimeYears: number
  retirementAge: number
}

export function deriveInsuranceTaxModeApi(
  request: InsuranceTaxModeRequest,
): ApiResult<InsuranceTaxModeResponse> {
  const meta = null // diagnostic helpers have no rule-year dependency

  // Validate numeric inputs
  for (const [field, val] of [
    ['contractStartYear', request.contractStartYear],
    ['contractRuntimeYears', request.contractRuntimeYears],
    ['retirementAge', request.retirementAge],
  ] as const) {
    if (typeof val !== 'number' || !isFinite(val)) {
      return error(
        [{ path: field, code: 'INVALID_INPUT', severity: 'error', message: `${field} must be a finite number.` }],
        meta,
      )
    }
  }

  const engineResult = safeEngineCall(
    () =>
      deriveInsuranceTaxMode(
        request.contractStartYear,
        request.contractRuntimeYears,
        request.retirementAge,
        request.oldContractTaxFreeEligible,
      ),
    meta,
  )
  if (!engineResult.ok) return engineResult

  return success<InsuranceTaxModeResponse>(
    {
      taxMode: engineResult.value,
      contractStartYear: request.contractStartYear,
      contractRuntimeYears: request.contractRuntimeYears,
      retirementAge: request.retirementAge,
    },
    // Use a synthetic meta for the success envelope since this helper has no rule year
    { apiVersion: API_VERSION, ruleYear: 0 },
  )
}

// ---------------------------------------------------------------------------
// bAV Lump-Sum Tax Mode Derivation
// ---------------------------------------------------------------------------

export interface BavLumpSumTaxModeRequest {
  durchfuehrungsweg: ApiBavDurchfuehrungsweg
  pre2005EligibleTaxFree?: boolean
}

export interface BavLumpSumTaxModeResponse {
  taxMode: string
  durchfuehrungsweg: string
}

export function deriveBavLumpSumTaxModeApi(
  request: BavLumpSumTaxModeRequest,
): ApiResult<BavLumpSumTaxModeResponse> {
  const meta = null // diagnostic helper — no rule-year dependency

  if (typeof request.durchfuehrungsweg !== 'string' || request.durchfuehrungsweg === '') {
    return error(
      [{ path: 'durchfuehrungsweg', code: 'INVALID_INPUT', severity: 'error', message: 'durchfuehrungsweg must be a non-empty string.' }],
      meta,
    )
  }

  const engineResult = safeEngineCall(
    () => deriveBavLumpSumTaxMode(request.durchfuehrungsweg as BavDurchfuehrungsweg, request.pre2005EligibleTaxFree ?? false),
    meta,
  )
  if (!engineResult.ok) return engineResult

  return success<BavLumpSumTaxModeResponse>(
    {
      taxMode: engineResult.value,
      durchfuehrungsweg: request.durchfuehrungsweg,
    },
    { apiVersion: API_VERSION, ruleYear: 0 },
  )
}
