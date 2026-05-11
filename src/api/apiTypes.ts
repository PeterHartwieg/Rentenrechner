/**
 * API-owned input/output types — structurally compatible with their domain
 * counterparts but declared locally so internal domain/schema changes do not
 * automatically become public API changes.
 *
 * v1 shapes are byte-identical to the domain originals.  Future API versions
 * can evolve these independently (rename, subset, add computed fields) without
 * touching the engine.
 */

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** API-owned profile shape (structurally identical to domain PersonalProfile). */
export interface ApiProfile {
  age: number
  retirementAge: number
  grossSalaryYear: number
  taxClass: 1 | 2 | 3 | 4 | 5 | 6
  childBirthYears: number[]
  churchTax: boolean
  publicHealthInsurance: boolean
  healthAdditionalContributionPct: number
  pkvMonthlyPremium: number
  pPVMonthlyPremium: number
  desiredNetMonthlyPension?: number
  /**
   * Marital status for tax calculation (§32a Abs. 5 EStG Splittingtarif).
   * 'married' triggers Ehegattensplitting for Günstigerprüfung (AVD, Riester).
   * 'divorced' and 'widowed' are treated as 'single' (Grundtarif).
   * Defaults to 'single' when omitted.
   */
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed'
}

// ---------------------------------------------------------------------------
// Assumptions (partial, for comparison request)
// ---------------------------------------------------------------------------

/**
 * API-owned scenario-assumptions shape.
 *
 * Callers pass a Partial<ApiAssumptions> — the comparison facade merges
 * unset fields from built-in defaults.  The full shape mirrors
 * `ScenarioAssumptions` but lives here so the public contract is stable.
 *
 * Only the fields the comparison facade explicitly branches on are declared;
 * all other fields pass through via the deep-merge as opaque data.
 */
export interface ApiAssumptions {
  visibleProducts?: string[]
  returnScenarios?: Array<{ id: string; label: string; annualReturn: number }>
  equalInputAmountEUR?: number
  /** Additional fields are passed through to the engine via deep-merge. */
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Product manifest
// ---------------------------------------------------------------------------

/** API-owned product manifest entry (mirrors engine ProductMetadata). */
export interface ApiProductManifestEntry {
  readonly id: string
  readonly label: string
  readonly shortLabel: string
  readonly color: string
  readonly order: number
  readonly lockedCapital: boolean
  readonly hasFees: boolean
  readonly hasEmployerContribution: boolean
}

// ---------------------------------------------------------------------------
// bAV types
// ---------------------------------------------------------------------------

/** API-owned bAV assumptions (structurally identical to domain BavAssumptions). */
export interface ApiBavAssumptions {
  monthlyGrossConversion: number
  statutoryMinimumSubsidyEnabled: boolean
  contractualMatchPercent: number
  contractualFixedMonthly: number
  fees: {
    wrapperAssetFee: number
    fundAssetFee: number
    pensionPayoutFeePct: number
    acquisitionCostPct: number
  }
  monthlyOtherRetirementIncome: number
  includeGrvReduction: boolean
  kvdrMember: boolean
  durchfuehrungsweg: string
  pre2005EligibleTaxFree: boolean
  payoutMode: string
  rentenfaktor: number
  rentenfaktorConfirmed: boolean
  zeitrenteYears: number
  annualContributionGrowthRate: number
}

/**
 * API-owned Basisrente assumptions.
 *
 * Intentionally loose (Record<string, unknown>) so domain interfaces are
 * assignable without an index signature.  The engine casts internally.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ApiBasisrenteAssumptions {}

/**
 * API-owned Altersvorsorgedepot assumptions.
 *
 * Intentionally loose — see ApiBasisrenteAssumptions rationale.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ApiAltersvorsorgedepotAssumptions {}

/**
 * API-owned Riester assumptions.
 *
 * Intentionally loose — see ApiBasisrenteAssumptions rationale.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ApiRiesterAssumptions {}

// ---------------------------------------------------------------------------
// Retirement-phase types
// ---------------------------------------------------------------------------

/** API-owned retirement income components (structurally identical to domain RetirementIncomeComponents). */
export interface ApiRetirementIncomeComponents {
  statutoryPensionAnnual: number
  bavPensionAnnual: number
  bavIsLumpSum: boolean
  privateInsuranceTaxableAnnual: number
  privateInsuranceTaxMode: string
  privateInsuranceContributions?: ReadonlyArray<{
    amount: number
    mode: string
  }>
  otherTaxableAnnual: number
  retirementYear: number
}

/** API-owned retirement KV/PV context (structurally identical to domain RetirementKvPvContext). */
export interface ApiRetirementKvPvContext {
  bavMonthlyVersorgungsbezuege: number
  otherMonthlyVersorgungsbezuege: number
  monthlyStatutoryPension: number
  freiwilligOtherMonthlyIncome: number
  isFreiwilligVersichert: boolean
  kvFreibetragVersorgungMonthly: number
  pvFreigrenzeVersorgungMonthly: number
  monthlyKvPvBbg: number
  healthRate: number
  careRate: number
}

/**
 * API-owned bAV Durchfuehrungsweg union.
 *
 * String union kept as `string` in the API surface so callers are not coupled
 * to the exact discriminants — the engine validates at runtime.
 */
export type ApiBavDurchfuehrungsweg = string
