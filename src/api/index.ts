/**
 * RentenWiki.de — Pure Front-End API (v1)
 *
 * Stable, versioned facade over the retirement comparison and tax engines.
 * This is a pure TypeScript/browser API — no HTTP, no backend, no network I/O,
 * no browser storage, no cookies, no React dependency.
 *
 * All outputs are exact (no display rounding). Callers own formatting.
 *
 * @example
 *   import { getManifest, runComparison, calculateIncomeTax } from '../api'
 *
 * @see src/api/api.examples.test.ts for executable usage examples.
 */

// -- Envelope & metadata -----------------------------------------------------
export { API_VERSION } from './contracts'
export type {
  ApiVersion,
  ApiMeta,
  ApiDiagnostic,
  ApiSuccess,
  ApiError,
  ApiResult,
} from './contracts'

// -- API-owned input/output types --------------------------------------------
export type {
  ApiProfile,
  ApiAssumptions,
  ApiProductManifestEntry,
  ApiBavAssumptions,
  ApiBasisrenteAssumptions,
  ApiAltersvorsorgedepotAssumptions,
  ApiRiesterAssumptions,
  ApiRetirementIncomeComponents,
  ApiRetirementKvPvContext,
  ApiBavDurchfuehrungsweg,
} from './apiTypes'

// -- Manifest ----------------------------------------------------------------
export { getManifest } from './manifest'
export type { ManifestData } from './manifest'

// -- Rule resolver -----------------------------------------------------------
// `resolveRuleYear` is intentionally internal — it returns the live GermanRules
// object. Public consumers discover rule years via `getManifest()`.

// -- Validation --------------------------------------------------------------
export {
  validateProfile,
  validateSharedAssumptions,
  validateProductAssumptions,
  validateComparisonRequest,
} from './validation'

// -- Tax primitives ----------------------------------------------------------
export {
  calculateIncomeTax,
  calculateSolidarity,
  calculateCapitalGains,
  calculateSalary,
} from './tax'
export type {
  IncomeTaxRequest,
  IncomeTaxResponse,
  SolidarityRequest,
  SolidarityResponse,
  CapitalGainsRequest,
  CapitalGainsResponse,
  SalaryRequest,
  SalaryResponse,
} from './tax'

// -- Salary-phase funding ----------------------------------------------------
export {
  calculateBavFundingApi,
  solveBavGrossFromNetApi,
  calculateBasisrenteFundingApi,
  calculateAvdFundingApi,
  calculateRiesterFundingApi,
} from './funding'
export type {
  BavFundingRequest,
  BavFundingResponse,
  BavSolveRequest,
  BavSolveResponse,
  BasisrenteFundingRequest,
  BasisrenteFundingResponse,
  AvdFundingRequest,
  AvdFundingResponse,
  RiesterFundingRequest,
  RiesterFundingResponse,
} from './funding'

// -- Retirement-phase tax & diagnostics --------------------------------------
export {
  calculateRetirementTaxApi,
  calculateRetirementKvPvApi,
  deriveInsuranceTaxModeApi,
  deriveBavLumpSumTaxModeApi,
} from './retirement'
export type {
  RetirementTaxRequest,
  RetirementTaxResponse,
  RetirementKvPvRequest,
  RetirementKvPvResponse,
  InsuranceTaxModeRequest,
  InsuranceTaxModeResponse,
  BavLumpSumTaxModeRequest,
  BavLumpSumTaxModeResponse,
} from './retirement'

// -- Comparison facade -------------------------------------------------------
export { runComparison } from './comparison'
export type {
  DetailLevel,
  ComparisonRequest,
  ComparisonResponse,
  TaxDiagnostics,
} from './comparison'

// -- Result summary DTOs -----------------------------------------------------
export type {
  ProductResultSummary,
  StatutoryPensionSummary,
  FundingSummaries,
  YearlyRowEntry,
  EtfPayoutRowEntry,
  MonteCarloPercentilesDto,
  MonteCarloProductSummaryDto,
  MonteCarloYearlyBandDto,
  MonteCarloSummaryResponse,
} from './resultSummaries'
