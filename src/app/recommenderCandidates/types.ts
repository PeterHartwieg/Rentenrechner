/**
 * Shared types and pure helper functions for per-product candidate generators.
 *
 * Pure module — no React imports, no DOM access.
 *
 * Exports:
 *   - `GeneratorContext` — read-only inputs every generator receives.
 *   - `CandidateDraft` — the intermediate shape before scoring/ranking.
 *   - `CandidateGenerator` — the function contract every generator must satisfy.
 *   - `synthesizeProductResult` — minimal ProductResult for combine calls.
 *   - `projectMonthlyContributionFV` — simple geometric FV for candidate sizing.
 *   - `basisInstanceResults` — extract basis-scenario rows from a per-instance bundle.
 */

import type {
  BavDurchfuehrungsweg,
  GermanRules,
  PayoutMode,
  ProductId,
  ProductResult,
} from '../../domain'
import type { Workspace } from '../../domain/workspace'
import type {
  BavInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
} from '../../domain/instances'
import type { CombineContext } from '../../engine/combineContext'
import type { CombinedResult } from '../../engine/portfolioCombine'

// ---------------------------------------------------------------------------
// bAV offer types — defined here (not in recommender.ts) to avoid circularity
// ---------------------------------------------------------------------------

export interface BavEmployerOfferInput {
  /** True when the user entered actual employer-offer data in the modal. */
  hasOffer: boolean
  /** Decimal, e.g. 0.15 = 15 %. Percent and fixed contribution are additive. */
  employerMatchPercent: number
  /** Fixed employer contribution in EUR/month, additive with percent. */
  fixedMonthlyEUR: number
  /** Optional cap on total employer contribution in EUR/month. Undefined/0 = no offer cap. */
  monthlyCapEUR?: number
  /** Total effective accumulation costs, decimal p.a.; 0.012 = 1.2 %. */
  effectiveCostAnnual: number
  durchfuehrungsweg?: BavDurchfuehrungsweg
  payoutMode?: PayoutMode
  rentenfaktor?: number
}

export interface ResolvedBavOffer {
  hasOffer: boolean
  standardAssumption: boolean
  employerMatchPercent: number
  fixedMonthlyEUR: number
  monthlyCapEUR?: number
  effectiveCostAnnual: number
  durchfuehrungsweg: BavDurchfuehrungsweg
  payoutMode: PayoutMode
  rentenfaktor: number
}

// ---------------------------------------------------------------------------
// GeneratorContext — inputs passed to every candidate generator
// ---------------------------------------------------------------------------

export interface GeneratorContext {
  workspace: Workspace
  rules: GermanRules
  marginalMonthlyEUR: number
  basis: BasisScenarioInfo
  yearsToRetirement: number
  baselinePerInstance: Record<string, ProductResult[]>
  baselineCombined: CombinedResult
  combineCtx: CombineContext
  bavOffer: ResolvedBavOffer
}

export interface BasisScenarioInfo {
  scenarioId: string
  annualReturn: number
}

// ---------------------------------------------------------------------------
// CandidateDraft — the intermediate shape before scoring/ranking
// ---------------------------------------------------------------------------

export interface CandidateDraft {
  id: string
  label: string
  productId: ProductId
  isNewInstance: boolean
  targetInstanceId?: string
  grossMonthlyEUR: number
  netCashOutEUR: number
  cappedToRemaining: boolean
  /** ProductResult representing the candidate's contribution in the basis scenario. */
  candidateResult: ProductResult
  /**
   * Optional helper instance to slot into the cloned workspace for
   * `combinePortfolio` lookups. When the candidate adds to an EXISTING instance
   * we reuse that id and append no new instance; when it's a NEW instance we
   * include the synthesized instance metadata so the combine lookup map
   * resolves the new instance id.
   */
  newInstance?: BavInstance | BasisrenteInstance | AltersvorsorgedepotInstance | RiesterInstance
  /**
   * Inputs needed to re-run a stochastic accumulation for this candidate
   * (used for the P10 risk score). Mirrors the deterministic FV inputs:
   * the monthly TOTAL contribution that compounds (own + employer / allowance
   * share) and the combined accumulation fee in decimal form.
   */
  mcInputs: {
    monthlyContribution: number
    totalFeeDecimal: number
  }
  usesStandardAssumptions?: boolean
  bavOffer?: ResolvedBavOffer
  monthlyEmployerContributionEUR?: number
}

// ---------------------------------------------------------------------------
// CandidateGenerator — the function contract every generator must satisfy
// ---------------------------------------------------------------------------

export type CandidateGenerator = (g: GeneratorContext) => CandidateDraft | null

// ---------------------------------------------------------------------------
// Shared pure helpers
// ---------------------------------------------------------------------------

/**
 * Compound monthly contribution with simple geometric accumulation.
 * Future-value of an ordinary annuity at monthly rate r over n months:
 *   FV = c × ((1 + r)^n − 1) / r
 *
 * Deliberately ignores Vorabpauschale (ETF/AVD) and Beitragsdynamik — the
 * recommender uses this only for candidate-ranking estimates; the engine's
 * `projectAccumulation` is the source of truth when the candidate is
 * materialised into a what-if and re-simulated.
 */
export function projectMonthlyContributionFV(
  monthlyContribution: number,
  annualReturn: number,
  years: number,
): number {
  if (monthlyContribution <= 0 || years <= 0) return 0
  const months = Math.round(years * 12)
  const r = Math.pow(1 + annualReturn, 1 / 12) - 1
  if (Math.abs(r) < 1e-9) return monthlyContribution * months
  return monthlyContribution * (Math.pow(1 + r, months) - 1) / r
}

/**
 * Build a per-instance result list by extracting the basis-scenario rows from
 * an existing per-instance bundle. Mirrors `useCombineSimulation`'s scenario
 * selection so the recommender consumes the same shape as the dashboard.
 */
export function basisInstanceResults(
  perInstance: Record<string, ProductResult[]>,
  scenarioId: string,
): ProductResult[] {
  return Object.values(perInstance)
    .map((arr) => arr.find((r) => r.scenarioId === scenarioId))
    .filter((r): r is ProductResult => Boolean(r))
}

/**
 * Synthesize a minimal ProductResult for a candidate. `combinePortfolio` only
 * reads `productId`, `instanceId`, `grossMonthlyPayout`, `netMonthlyPayout`
 * (ETF), `capitalAtRetirement`, `totalProductContributions`. Other fields are
 * filled with zeros / safe placeholders.
 */
export function synthesizeProductResult(args: {
  productId: ProductId
  instanceId: string
  scenarioId: string
  scenarioLabel: string
  annualReturn: number
  grossMonthlyPayout: number
  netMonthlyPayoutForEtf?: number
  capitalAtRetirement: number
  totalProductContributions: number
  afterTaxLumpSum: number | null
  label: string
}): ProductResult {
  return {
    productId: args.productId,
    label: args.label,
    scenarioId: args.scenarioId as ProductResult['scenarioId'],
    scenarioLabel: args.scenarioLabel,
    annualReturn: args.annualReturn,
    monthlyUserCost: 0,
    monthlyProductContribution: 0,
    monthlyEmployerContribution: 0,
    totalUserCost: args.totalProductContributions,
    totalProductContributions: args.totalProductContributions,
    totalContributionsBeforeFees: args.totalProductContributions,
    totalEmployerContributions: 0,
    totalFees: 0,
    capitalAtRetirement: args.capitalAtRetirement,
    realCapitalAtRetirement: args.capitalAtRetirement,
    afterTaxLumpSum: args.afterTaxLumpSum,
    grossMonthlyPayout: args.grossMonthlyPayout,
    netMonthlyPayout: args.netMonthlyPayoutForEtf ?? args.grossMonthlyPayout,
    taxAndSvSavings: 0,
    valueMultipleOnUserCost: args.totalProductContributions > 0
      ? (args.afterTaxLumpSum ?? args.capitalAtRetirement) / args.totalProductContributions
      : 0,
    capitalMultipleAnnualized: 1 + args.annualReturn,
    accumulationRiy: 0,
    rows: [],
    etfPayoutRows: [],
    instanceId: args.instanceId,
  } as ProductResult
}
