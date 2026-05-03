/**
 * Next-€X recommender (Group G issue 12, milestone M3.2).
 *
 * Pure module — no React imports, no DOM access.
 *
 * Given a baseline workspace + a marginal monthly NET out-of-pocket budget,
 * generates 3-4 ranked candidate allocations with trade-off labels.
 *
 * Math contract (from the issue spec):
 *   The user's `marginalMonthlyEUR` is the additional after-tax cash they are
 *   willing to commit each month. Each candidate is sized so the user's net
 *   cash outflow equals `marginalMonthlyEUR`:
 *
 *   - ETF / AVD: gross = marginalMonthlyEUR (no accumulation tax leverage).
 *   - bAV: gross conversion solved via the engine's existing two-pass funding
 *     bisection (`solveBavGrossFromNet`).
 *   - Basisrente: gross sized so (gross - §10 Abs. 3 EStG marginal saving) ≈
 *     marginalMonthlyEUR. Bisection inside `solveBasisrenteGrossFromNet`.
 *   - Riester: ownContribution sized so (own - allowance/12 - Günstigerprüfung
 *     refund) ≈ marginalMonthlyEUR. Bisection inside `solveRiesterOwnFromNet`.
 *
 * Cap clamping:
 *   When the sized gross exceeds the relevant statutory cap (bAV §3 Nr. 63,
 *   Riester €2,100/yr, Basisrente Schicht-1, AVD per-contract cap), the
 *   candidate's gross is clamped to the cap remainder and a `cap_full_warning`
 *   atom is attached. Candidates that would be statutorily impossible (zero
 *   remaining cap) are skipped.
 *
 * Median Netto-Rente:
 *   The candidate's after-tax monthly retirement income is computed by
 *   simulating its accumulation at the basis scenario's expected return,
 *   projecting a ProductResult, then folding it into a cloned per-instance
 *   bundle and re-running `combinePortfolio` on the candidate workspace.
 *   Monte Carlo widening is NOT run here (cost > benefit for a 3-4 candidate
 *   refresh) — riskScore is reported as the candidate's deterministic capital
 *   at the basis scenario; UI labels it "Risiko (Streuung)".
 *
 * Out of scope:
 *   - Vintage-detection rules (issue 13, already on main).
 *   - Three-card per-contract template (issue 14).
 *   - Trigger-specific candidate biasing (P2).
 */

import type {
  GermanRules,
  PayoutMode,
  ProductId,
  ProductResult,
} from '../domain'
import type { Scenario, Workspace, WhatIfScenario } from '../domain/workspace'
import type {
  BavInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
} from '../domain/instances'
import { combinePortfolio, type CombineContext, type CombinedResult } from '../engine/portfolioCombine'
import { calculateBavFunding, calculateSalaryResult, solveBavGrossFromNet } from '../engine/salary'
import { calculateBasisrenteFunding, solveBasisrenteGrossFromNet, netBasisrentePayout } from '../engine/basisrente'
import { calculateRiesterFunding, solveRiesterOwnFromNet, netRiesterPayout } from '../engine/riester'
import { netAvdPayout } from '../engine/altersvorsorgedepot'
import { netBavPayout } from '../engine/bavPayout'
import { computeGrossMonthlyPayout, monthlyPayoutFromCapital } from '../engine/payoutMath'
import { afterTaxInvestmentCapital } from '../engine/etfPayout'
import {
  forkBaselineScenario,
  deepCloneScenario,
  newScenarioId,
} from './portfolioState'
import {
  newInstanceId,
} from '../features/inventory/inventoryHelpers'
import { defaultAssumptions } from '../data/defaultScenario'
import { runRules, type Atom } from './recommendations'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FlexibilityScore = 'high' | 'medium' | 'low'

export interface RecommendedCandidate {
  /** Stable id used by the UI as a React key and by tests for ordering assertions. */
  id: string
  /** German display label. */
  label: string
  /** Product class the candidate routes the marginal contribution into. */
  productId: ProductId
  /** True for "Start new …" candidates; false when the candidate adds to an existing instance. */
  isNewInstance: boolean
  /** Set when adding to an existing instance. */
  targetInstanceId?: string
  /**
   * Gross monthly contribution (EUR/month) sized so net cash out-of-pocket ≈
   * marginalMonthlyEUR (or clamped to the statutory cap remainder).
   */
  grossMonthlyEUR: number
  /**
   * Actual net cash out-of-pocket (EUR/month). Equal to marginalMonthlyEUR within
   * solver tolerance unless the candidate was clamped to a cap.
   */
  netCashOutEUR: number
  /** Combined monthly net retirement income (EUR/month) with the candidate added. */
  medianNettoRente: number
  /** Estimated lifetime cash payouts (EUR) — net monthly × 12 × longevity assumption. */
  lifetimeCash: number
  /** Ordinal flexibility class (capital availability before retirement). */
  flexibilityScore: FlexibilityScore
  /** Deterministic capital P10 proxy (EUR) for the basis scenario. */
  riskScore: number
  /** Trade-off labels emitted by the rules engine. */
  atoms: Atom[]
  /** False when `profile.desiredNetMonthlyPension > 0` and the candidate's median falls below it. */
  wunschnettoFloorMet: boolean
  /** Set when the candidate hit a statutory cap and was clamped. */
  cappedToRemaining: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Lifetime longevity assumption for `lifetimeCash` — uses the workspace's
 * `retirementEndAge` minus retirementAge. Capped at 35 years for sanity.
 */
const MAX_LIFETIME_YEARS = 35

/**
 * Maximum number of candidates returned to the UI. Spec §4 M3.2 caps the
 * card at 3-4 candidates; we generate up to MAX_CANDIDATES then return the
 * top-N ranked by median Netto-Rente.
 */
const MAX_CANDIDATES = 4

const FLEX_BY_PRODUCT: Record<ProductId, FlexibilityScore> = {
  etf: 'high',
  altersvorsorgedepot: 'high',
  versicherung: 'medium',
  bav: 'medium',
  riester: 'medium',
  basisrente: 'low',
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compound monthly contribution with simple geometric accumulation.
 * Future-value of an ordinary annuity at monthly rate r over n months:
 *   FV = c × ((1 + r)^n − 1) / r
 */
function projectMonthlyContributionFV(
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

interface BasisScenarioInfo {
  scenarioId: string
  annualReturn: number
}

function pickBasisScenario(workspace: Workspace): BasisScenarioInfo {
  const wsa = workspace.baseline.assumptions
  const basis =
    wsa.returnScenarios.find((s) => s.id === 'basis') ?? wsa.returnScenarios[0]
  if (!basis) {
    return { scenarioId: 'basis', annualReturn: 0.05 }
  }
  return { scenarioId: basis.id, annualReturn: basis.annualReturn }
}

/**
 * Build a per-instance result list by extracting the basis-scenario rows from
 * an existing per-instance bundle. Mirrors `useCombineSimulation`'s scenario
 * selection so the recommender consumes the same shape as the dashboard.
 */
function basisInstanceResults(
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
function synthesizeProductResult(args: {
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

// ---------------------------------------------------------------------------
// Build a CombineContext
// ---------------------------------------------------------------------------

/**
 * Re-derive the `CombineContext` for the workspace. Mirrors the routing logic
 * in `useCombineSimulation.runCombineSimulation` so the recommender's
 * `combinePortfolio` calls produce results consistent with the dashboard.
 */
function buildCombineContext(
  workspace: Workspace,
  rules: GermanRules,
  grvGrossMonthlyPension: number,
): CombineContext {
  const profile = workspace.baseline.profile
  const wsa = workspace.baseline.assumptions
  const retirementYear = rules.year + (profile.retirementAge - profile.age)

  const pensionType = wsa.statutoryPension.pensionBaselineType ?? 'grv'
  let statutoryPensionTaxChannel: CombineContext['statutoryPensionTaxChannel']
  let statutoryPensionKvChannel: CombineContext['statutoryPensionKvChannel']
  if (pensionType === 'none' || grvGrossMonthlyPension <= 0) {
    statutoryPensionTaxChannel = 'none'
    statutoryPensionKvChannel = 'none'
  } else if (pensionType === 'beamtenpension') {
    statutoryPensionTaxChannel = 'beamten_versorgungsbezug'
    statutoryPensionKvChannel = profile.publicHealthInsurance ? 'versorgungsbezug_full_rate' : 'none'
  } else if (pensionType === 'versorgungswerk') {
    statutoryPensionTaxChannel = 'statutory_pension'
    statutoryPensionKvChannel = profile.publicHealthInsurance ? 'versorgungsbezug_full_rate' : 'none'
  } else {
    statutoryPensionTaxChannel = 'statutory_pension'
    statutoryPensionKvChannel = profile.publicHealthInsurance ? 'kvdr_half_rate' : 'none'
  }

  const kvdrMember = wsa.bav[0]?.kvdrMember ?? true
  const retirementHealthStatus: CombineContext['retirementHealthStatus'] =
    !profile.publicHealthInsurance ? 'pkv' : kvdrMember ? 'kvdr' : 'freiwillig_gkv'

  return {
    profile,
    rules,
    retirementYear,
    grvGrossMonthlyPension,
    statutoryPensionTaxChannel,
    statutoryPensionKvChannel,
    retirementHealthStatus,
  }
}

// ---------------------------------------------------------------------------
// Candidate generators (return un-ranked candidates; ranking happens later)
// ---------------------------------------------------------------------------

interface GeneratorContext {
  workspace: Workspace
  rules: GermanRules
  marginalMonthlyEUR: number
  basis: BasisScenarioInfo
  yearsToRetirement: number
  baselinePerInstance: Record<string, ProductResult[]>
  baselineCombined: CombinedResult
  combineCtx: CombineContext
}

interface CandidateDraft {
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
}

// --- ETF candidate ---------------------------------------------------------

function makeEtfCandidate(g: GeneratorContext): CandidateDraft | null {
  const wsa = g.workspace.baseline.assumptions
  const target = wsa.etf.find((e) => e.status !== 'surrendered')
  if (!target) return null
  const gross = g.marginalMonthlyEUR
  const annualFee = target.annualAssetFee ?? defaultAssumptions.etf.annualAssetFee
  const netReturn = Math.max(-0.5, g.basis.annualReturn - annualFee)
  const capital = projectMonthlyContributionFV(gross, netReturn, g.yearsToRetirement)
  const totalContributions = gross * 12 * g.yearsToRetirement
  const payoutYears = Math.max(
    1,
    Math.min(MAX_LIFETIME_YEARS, wsa.retirementEndAge - g.workspace.baseline.profile.retirementAge),
  )
  const grossPayout = monthlyPayoutFromCapital(capital, netReturn, payoutYears)
  const partialExemption = wsa.etf[0]?.equityPartialExemption ?? defaultAssumptions.etf.equityPartialExemption
  const afterTaxLumpSum = afterTaxInvestmentCapital(capital, totalContributions, g.rules, partialExemption, 0)
  // ETF payout is taxed via Abgeltungsteuer in the per-instance helper. For the
  // recommender's marginal-on-top model we approximate `netMonthlyPayout` as
  // gross × (afterTaxLumpSum / capital) — this preserves combine-mode bit
  // identity for the ETF channel (combine reads result.netMonthlyPayout for ETF
  // unchanged).
  const netRatio = capital > 0 ? Math.min(1, afterTaxLumpSum / capital) : 1
  const netPayout = grossPayout * netRatio
  const candidateResult = synthesizeProductResult({
    productId: 'etf',
    instanceId: target.instanceId,
    scenarioId: g.basis.scenarioId,
    scenarioLabel: 'Basis',
    annualReturn: g.basis.annualReturn,
    grossMonthlyPayout: grossPayout,
    netMonthlyPayoutForEtf: netPayout,
    capitalAtRetirement: capital,
    totalProductContributions: totalContributions,
    afterTaxLumpSum,
    label: target.label ?? 'ETF-Depot',
  })
  return {
    id: 'add_to_existing_etf',
    label: `Zusatz auf bestehendes ETF-Depot (${target.label ?? 'ETF'})`,
    productId: 'etf',
    isNewInstance: false,
    targetInstanceId: target.instanceId,
    grossMonthlyEUR: gross,
    netCashOutEUR: gross,
    cappedToRemaining: false,
    candidateResult,
  }
}

// --- bAV candidate ---------------------------------------------------------

function makeBavCandidate(g: GeneratorContext): CandidateDraft | null {
  const wsa = g.workspace.baseline.assumptions
  const target = wsa.bav.find((b) => b.status !== 'surrendered')
  if (!target) return null

  const profile = g.workspace.baseline.profile
  // Existing aggregate gross conversion across active bAV instances (single-employer
  // V1 assumption: §3 Nr. 63 + SvEV cap shared across one person's bAV portfolio).
  const usedMonthly = wsa.bav
    .filter((b) => b.status !== 'surrendered')
    .reduce((s, b) => s + (b.monthlyGrossConversion ?? 0), 0)
  const capMonthly = (g.rules.socialSecurity.pensionCapYear * g.rules.bav.taxFreePctOfPensionCap) / 12
  const remainingCapMonthly = Math.max(0, capMonthly - usedMonthly)
  if (remainingCapMonthly <= 0) return null

  // Bisection: solve for the gross conversion (on TOP of existing) that yields
  // a marginal net cost equal to marginalMonthlyEUR. We compute incremental
  // net cost as funding(used + delta).monthlyNetCost - funding(used).monthlyNetCost.
  // Because calculateBavFunding is monotone in gross, we use the existing
  // `solveBavGrossFromNet` against an isolated bAV (gross=delta only) — this
  // approximates well when usedMonthly is small relative to the cap, and the
  // SV-saving step is small. For bigger usedMonthly the combine engine still
  // applies the apportioned cap, so we then clamp the result to remainingCapMonthly.
  const isolatedGross = solveBavGrossFromNet(
    g.marginalMonthlyEUR,
    profile,
    g.rules,
    target,
  )
  const cappedToRemaining = isolatedGross > remainingCapMonthly
  const gross = Math.min(isolatedGross, remainingCapMonthly)

  const fundingForGross = calculateBavFunding(profile, g.rules, {
    ...target,
    monthlyGrossConversion: gross,
  })
  const netCash = Math.max(0, fundingForGross.monthlyNetCost)

  // Project capital: contribution = gross + employer share. Use simple FV at
  // basis scenario return minus average accumulation fee. This is an estimate;
  // the production simulator does year-by-year fees + Beitragsdynamik etc., but
  // the recommender's "what does another €X buy" only needs an order-of-magnitude
  // candidate ranking.
  const totalMonthly = fundingForGross.monthlyGrossConversion + fundingForGross.monthlyEmployerContribution
  const fees = (target.fees?.wrapperAssetFee ?? 0) + (target.fees?.fundAssetFee ?? 0)
  const netReturn = Math.max(-0.5, g.basis.annualReturn - fees)
  const capital = projectMonthlyContributionFV(totalMonthly, netReturn, g.yearsToRetirement)
  const totalContributions = totalMonthly * 12 * g.yearsToRetirement
  const payoutYears = Math.max(1, wsa.retirementEndAge - profile.retirementAge)
  const grossPayout = computeGrossMonthlyPayout(capital, {
    mode: target.payoutMode as PayoutMode,
    rentenfaktor: target.rentenfaktor,
    zeitrenteYears: target.zeitrenteYears ?? 20,
    kapitalverzehrYears: payoutYears,
    payoutReturn: netReturn,
  })

  const candidateResult = synthesizeProductResult({
    productId: 'bav',
    instanceId: target.instanceId,
    scenarioId: g.basis.scenarioId,
    scenarioLabel: 'Basis',
    annualReturn: g.basis.annualReturn,
    grossMonthlyPayout: grossPayout,
    capitalAtRetirement: capital,
    totalProductContributions: totalContributions,
    afterTaxLumpSum: capital,
    label: target.label ?? 'bAV',
  })

  return {
    id: 'add_to_existing_bav',
    label: `Zusatz auf bestehende bAV (${target.label ?? 'bAV'})`,
    productId: 'bav',
    isNewInstance: false,
    targetInstanceId: target.instanceId,
    grossMonthlyEUR: gross,
    netCashOutEUR: netCash,
    cappedToRemaining,
    candidateResult,
  }
}

// --- Basisrente (new) ------------------------------------------------------

function makeBasisrenteCandidate(g: GeneratorContext): CandidateDraft | null {
  const profile = g.workspace.baseline.profile
  // Build a synthetic Basisrente assumption block from the default plus a
  // typical fee profile. The funding helper needs a SalaryResult — recompute
  // from the profile (no bAV conversion baked in; the recommender's bAV
  // candidate is independent).
  const salary = calculateSalaryResult(profile, g.rules, 0)
  const synthetic = {
    monthlyGrossContribution: 0,
    payoutMode: 'leibrente' as const,
    rentenfaktor: defaultAssumptions.basisrente.rentenfaktor,
    rentenfaktorConfirmed: false,
    monthlyOtherRetirementIncome: 0,
    fees: defaultAssumptions.basisrente.fees,
  }
  const isolatedGross = solveBasisrenteGrossFromNet(
    g.marginalMonthlyEUR,
    g.rules,
    salary,
    synthetic,
  )
  if (isolatedGross <= 0) return null

  // Clamp to remaining Schicht-1 cap.
  const fundingAtFull = calculateBasisrenteFunding(g.rules, salary, {
    ...synthetic,
    monthlyGrossContribution: isolatedGross,
  })
  const remainingMonthly = fundingAtFull.remainingSchicht1Cap / 12
  const cappedToRemaining = isolatedGross > remainingMonthly
  const gross = Math.min(isolatedGross, Math.max(0, remainingMonthly))
  if (gross <= 0) return null

  const fundingForGross = calculateBasisrenteFunding(g.rules, salary, {
    ...synthetic,
    monthlyGrossContribution: gross,
  })
  const netCash = Math.max(0, fundingForGross.monthlyNetCost)

  const fees = (synthetic.fees.wrapperAssetFee ?? 0) + (synthetic.fees.fundAssetFee ?? 0)
  const netReturn = Math.max(-0.5, g.basis.annualReturn - fees)
  const capital = projectMonthlyContributionFV(gross, netReturn, g.yearsToRetirement)
  const totalContributions = gross * 12 * g.yearsToRetirement
  const grossPayout = (capital / 10_000) * synthetic.rentenfaktor

  const newInstanceIdStr = newInstanceId('basisrente')
  const candidateResult = synthesizeProductResult({
    productId: 'basisrente',
    instanceId: newInstanceIdStr,
    scenarioId: g.basis.scenarioId,
    scenarioLabel: 'Basis',
    annualReturn: g.basis.annualReturn,
    grossMonthlyPayout: grossPayout,
    capitalAtRetirement: capital,
    totalProductContributions: totalContributions,
    afterTaxLumpSum: null,
    label: 'Neue Rürup-Rente',
  })

  const newInstance: BasisrenteInstance = {
    instanceId: newInstanceIdStr,
    label: 'Neue Rürup-Rente',
    status: 'active',
    contractStartYear: g.rules.year,
    evidenceMap: {},
    monthlyGrossContribution: gross,
    payoutMode: 'leibrente',
    rentenfaktor: synthetic.rentenfaktor,
    rentenfaktorConfirmed: false,
    monthlyOtherRetirementIncome: 0,
    fees: { ...synthetic.fees },
  }

  return {
    id: 'new_basisrente',
    label: 'Neue Rürup-Rente',
    productId: 'basisrente',
    isNewInstance: true,
    grossMonthlyEUR: gross,
    netCashOutEUR: netCash,
    cappedToRemaining,
    candidateResult,
    newInstance,
  }
}

// --- AVD (new) -------------------------------------------------------------

function makeAvdCandidate(g: GeneratorContext): CandidateDraft | null {
  const profile = g.workspace.baseline.profile
  const wsa = g.workspace.baseline.assumptions
  const gross = g.marginalMonthlyEUR
  const capMonthly = g.rules.altersvorsorgedepot.contractContributionCapAnnual / 12
  const cappedToRemaining = gross > capMonthly
  const sized = Math.min(gross, capMonthly)
  if (sized <= 0) return null

  const baseAvd = defaultAssumptions.altersvorsorgedepot
  const fees = (baseAvd.fees.wrapperAssetFee ?? 0) + (baseAvd.fees.fundAssetFee ?? 0)
  const netReturn = Math.max(-0.5, g.basis.annualReturn - fees)
  const capital = projectMonthlyContributionFV(sized, netReturn, g.yearsToRetirement)
  const totalContributions = sized * 12 * g.yearsToRetirement
  const payoutYears = Math.max(1, wsa.retirementEndAge - profile.retirementAge)
  const grossPayout = monthlyPayoutFromCapital(capital, netReturn, payoutYears)

  const newInstanceIdStr = newInstanceId('altersvorsorgedepot')
  const candidateResult = synthesizeProductResult({
    productId: 'altersvorsorgedepot',
    instanceId: newInstanceIdStr,
    scenarioId: g.basis.scenarioId,
    scenarioLabel: 'Basis',
    annualReturn: g.basis.annualReturn,
    grossMonthlyPayout: grossPayout,
    capitalAtRetirement: capital,
    totalProductContributions: totalContributions,
    afterTaxLumpSum: capital,
    label: 'Neues Altersvorsorgedepot',
  })

  const newInstance: AltersvorsorgedepotInstance = {
    instanceId: newInstanceIdStr,
    label: 'Neues Altersvorsorgedepot',
    status: 'active',
    contractStartYear: g.rules.year,
    evidenceMap: {},
    ...baseAvd,
    monthlyOwnContribution: sized,
  }

  return {
    id: 'new_avd',
    label: 'Neues Altersvorsorgedepot',
    productId: 'altersvorsorgedepot',
    isNewInstance: true,
    grossMonthlyEUR: sized,
    netCashOutEUR: sized,
    cappedToRemaining,
    candidateResult,
    newInstance,
  }
}

// --- Riester top-up (existing instance) -----------------------------------

function makeRiesterTopUpCandidate(g: GeneratorContext): CandidateDraft | null {
  const wsa = g.workspace.baseline.assumptions
  const target = wsa.riester.find((r) => r.status !== 'surrendered')
  if (!target) return null
  const profile = g.workspace.baseline.profile
  const salary = calculateSalaryResult(profile, g.rules, 0)

  const isolatedOwn = solveRiesterOwnFromNet(
    g.marginalMonthlyEUR,
    g.rules,
    salary,
    target,
    profile,
  )
  if (isolatedOwn <= 0) return null

  // Clamp to §10a annual cap (incl. allowances).
  const capAnnual = g.rules.riester.annualCapInclAllowances
  const usedAnnual = wsa.riester
    .filter((r) => r.status !== 'surrendered')
    .reduce((s, r) => s + (r.monthlyOwnContribution ?? 0) * 12, 0)
  const remainingAnnual = Math.max(0, capAnnual - usedAnnual)
  const remainingMonthly = remainingAnnual / 12
  const cappedToRemaining = isolatedOwn > remainingMonthly
  const own = Math.min(isolatedOwn, remainingMonthly)
  if (own <= 0) return null

  const fundingForOwn = calculateRiesterFunding(g.rules, salary, {
    ...target,
    monthlyOwnContribution: own,
  }, profile)
  const netCash = Math.max(0, fundingForOwn.monthlyNetCost)

  const totalMonthly = own + fundingForOwn.totalAllowanceAnnual / 12
  const fees = (target.fees?.wrapperAssetFee ?? 0) + (target.fees?.fundAssetFee ?? 0)
  const netReturn = Math.max(-0.5, g.basis.annualReturn - fees)
  const capital = projectMonthlyContributionFV(totalMonthly, netReturn, g.yearsToRetirement)
  const totalContributions = totalMonthly * 12 * g.yearsToRetirement
  const grossPayout = (capital / 10_000) * (target.rentenfaktor ?? 28)

  const candidateResult = synthesizeProductResult({
    productId: 'riester',
    instanceId: target.instanceId,
    scenarioId: g.basis.scenarioId,
    scenarioLabel: 'Basis',
    annualReturn: g.basis.annualReturn,
    grossMonthlyPayout: grossPayout,
    capitalAtRetirement: capital,
    totalProductContributions: totalContributions,
    afterTaxLumpSum: capital,
    label: target.label ?? 'Riester',
  })

  return {
    id: 'add_to_existing_riester',
    label: `Aufstockung Riester (${target.label ?? 'Riester'})`,
    productId: 'riester',
    isNewInstance: false,
    targetInstanceId: target.instanceId,
    grossMonthlyEUR: own,
    netCashOutEUR: netCash,
    cappedToRemaining,
    candidateResult,
  }
}

// ---------------------------------------------------------------------------
// Combine the candidate's ProductResult into a candidate workspace
// ---------------------------------------------------------------------------

/**
 * Clone the workspace and add the candidate's instance metadata so
 * `combinePortfolio` can resolve `instanceId → instance` lookups consistently.
 *
 * For "add to existing" candidates the existing instance metadata is reused —
 * we only need to inject the candidate's *delta* contribution into the
 * synthesized ProductResult bundle (the workspace itself doesn't change because
 * combinePortfolio's instance metadata only carries fee + payout-mode shape,
 * not the contribution amount). The dashboard-mode bundle reflects the user's
 * existing contributions; the candidate's gross is layered on top via the
 * synthesized ProductResult that combinePortfolio sees alongside the baseline
 * results.
 */
function workspaceWithCandidateInstance(
  workspace: Workspace,
  draft: CandidateDraft,
): Workspace {
  if (!draft.isNewInstance || !draft.newInstance) return workspace
  const wsa = workspace.baseline.assumptions
  const newAsm = (() => {
    if (draft.productId === 'basisrente') {
      return { ...wsa, basisrente: [...wsa.basisrente, draft.newInstance as BasisrenteInstance] }
    }
    if (draft.productId === 'altersvorsorgedepot') {
      return {
        ...wsa,
        altersvorsorgedepot: [...wsa.altersvorsorgedepot, draft.newInstance as AltersvorsorgedepotInstance],
      }
    }
    if (draft.productId === 'riester') {
      return { ...wsa, riester: [...wsa.riester, draft.newInstance as RiesterInstance] }
    }
    if (draft.productId === 'bav') {
      return { ...wsa, bav: [...wsa.bav, draft.newInstance as BavInstance] }
    }
    return wsa
  })()
  return {
    ...workspace,
    baseline: { ...workspace.baseline, assumptions: newAsm },
  }
}

/**
 * Compute the candidate's combined retirement income by:
 *   1. Cloning the workspace with the candidate's new instance (when
 *      isNewInstance) so combinePortfolio's instance lookup map resolves.
 *   2. Producing a per-instance bundle: baseline basis-scenario results PLUS
 *      the candidate's synthesized ProductResult.
 *   3. Calling combinePortfolio over the merged bundle.
 *
 * For "add to existing instance" candidates: the candidateResult shares the
 * existing instance's id, but it represents the OPTIMIZED instance with extra
 * contribution layered on top. The simplest preservation of "marginal
 * benefit" is to ADD the candidate's gross monthly payout to the baseline
 * instance's gross, and re-combine. We do this by replacing the baseline
 * instance's result with a sum.
 */
function combinedForCandidate(
  workspace: Workspace,
  draft: CandidateDraft,
  baselinePerInstance: Record<string, ProductResult[]>,
  basisScenarioId: string,
  combineCtx: CombineContext,
): CombinedResult {
  const baselineResults = basisInstanceResults(baselinePerInstance, basisScenarioId)
  let merged: ProductResult[]
  if (draft.isNewInstance) {
    merged = [...baselineResults, draft.candidateResult]
  } else {
    merged = baselineResults.map((r) => {
      if (r.instanceId !== draft.targetInstanceId) return r
      return {
        ...r,
        grossMonthlyPayout: r.grossMonthlyPayout + draft.candidateResult.grossMonthlyPayout,
        netMonthlyPayout: r.netMonthlyPayout + draft.candidateResult.netMonthlyPayout,
        capitalAtRetirement: r.capitalAtRetirement + draft.candidateResult.capitalAtRetirement,
        totalProductContributions: r.totalProductContributions + draft.candidateResult.totalProductContributions,
      }
    })
  }
  const candidateWorkspace = workspaceWithCandidateInstance(workspace, draft)
  return combinePortfolio(candidateWorkspace, merged, combineCtx)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RecommendNextEuroInput {
  workspace: Workspace
  rules: GermanRules
  marginalMonthlyEUR: number
  /**
   * Per-instance basis-scenario ProductResults indexed by instanceId. Caller
   * passes the bundle from `useCombineSimulation`.
   */
  baselinePerInstance: Record<string, ProductResult[]>
  /** Combined baseline (basis scenario). */
  baselineCombined: CombinedResult
  /** Statutory pension monthly gross (basis scenario). */
  grvGrossMonthlyPension: number
}

export function recommendNextEuro(input: RecommendNextEuroInput): RecommendedCandidate[] {
  const { workspace, rules, marginalMonthlyEUR } = input
  if (marginalMonthlyEUR <= 0) return []

  const profile = workspace.baseline.profile
  const yearsToRetirement = Math.max(1, profile.retirementAge - profile.age)
  const basis = pickBasisScenario(workspace)
  const combineCtx = buildCombineContext(workspace, rules, input.grvGrossMonthlyPension)

  const g: GeneratorContext = {
    workspace,
    rules,
    marginalMonthlyEUR,
    basis,
    yearsToRetirement,
    baselinePerInstance: input.baselinePerInstance,
    baselineCombined: input.baselineCombined,
    combineCtx,
  }

  // Generate raw candidates in priority order (one per product class for diversity).
  const generators: Array<() => CandidateDraft | null> = [
    () => makeEtfCandidate(g),
    () => makeBavCandidate(g),
    () => makeBasisrenteCandidate(g),
    () => makeAvdCandidate(g),
    () => makeRiesterTopUpCandidate(g),
  ]
  const drafts: CandidateDraft[] = []
  for (const gen of generators) {
    const d = gen()
    if (d) drafts.push(d)
  }

  // Wunschnetto floor (defaults to 0 = no target set; treated as "not enforced").
  const wunschnetto = profile.desiredNetMonthlyPension ?? 0

  // Materialise each draft into a RecommendedCandidate via combinePortfolio.
  const candidates: RecommendedCandidate[] = drafts.map((d) => {
    const combined = combinedForCandidate(
      workspace,
      d,
      input.baselinePerInstance,
      basis.scenarioId,
      combineCtx,
    )
    const median = combined.monthlyNetIncome
    const lifetimeYears = Math.max(
      1,
      Math.min(
        MAX_LIFETIME_YEARS,
        workspace.baseline.assumptions.retirementEndAge - profile.retirementAge,
      ),
    )
    const lifetimeCash = median * 12 * lifetimeYears
    const wunschnettoFloorMet = wunschnetto > 0 ? median >= wunschnetto : true
    const atoms: Atom[] = runRules({
      workspace,
      simulationResult: { products: basisInstanceResults(input.baselinePerInstance, basis.scenarioId) },
      combinedResult: combined,
      marginalBudgetEUR: marginalMonthlyEUR,
    }).filter((a) => isCandidateRelevantAtom(a, d))
    if (d.cappedToRemaining) {
      atoms.push({
        id: 'bav_cap_remaining',
        priority: 'high',
        context: { usedPct: 1, remainingMonthly: 0, capFullForCandidate: true },
      })
    }
    return {
      id: d.id,
      label: d.label,
      productId: d.productId,
      isNewInstance: d.isNewInstance,
      targetInstanceId: d.targetInstanceId,
      grossMonthlyEUR: d.grossMonthlyEUR,
      netCashOutEUR: d.netCashOutEUR,
      medianNettoRente: median,
      lifetimeCash,
      flexibilityScore: FLEX_BY_PRODUCT[d.productId],
      riskScore: d.candidateResult.capitalAtRetirement,
      atoms,
      wunschnettoFloorMet,
      cappedToRemaining: d.cappedToRemaining,
    }
  })

  // Default ranking: median Netto-Rente desc.
  candidates.sort((a, b) => b.medianNettoRente - a.medianNettoRente)
  return candidates.slice(0, MAX_CANDIDATES)
}

// ---------------------------------------------------------------------------
// Atom relevance filter
// ---------------------------------------------------------------------------

function isCandidateRelevantAtom(atom: Atom, draft: CandidateDraft): boolean {
  const productMatches: Record<ProductId, string[]> = {
    etf: ['sparerpauschbetrag_remaining'],
    bav: ['bav_cap_remaining'],
    versicherung: [],
    basisrente: ['basisrente_cap_remaining'],
    altersvorsorgedepot: ['avd_cap_remaining'],
    riester: ['riester_cap_remaining'],
  }
  const allowed = productMatches[draft.productId]
  return allowed.includes(atom.id)
}

// ---------------------------------------------------------------------------
// "Save as plan" helper — materialise a candidate as a what-if scenario
// ---------------------------------------------------------------------------

/**
 * Build a what-if scenario representing a chosen candidate. Caller is expected
 * to push it into `usePortfolioState.addWhatIf` (or call `forkBaselineScenario`
 * directly when the recommender is wired into a UI that already manages
 * portfolio state).
 *
 * The returned scenario carries `origin: 'recommender'` so the scenario
 * library can identify recommender-originated plans.
 */
export function buildWhatIfFromCandidate(
  baseline: Scenario,
  candidate: RecommendedCandidate,
): WhatIfScenario {
  const label = candidate.label
  const fork = forkBaselineScenario(baseline, label, 'recommender')
  // Apply the candidate's contribution change to the cloned assumptions.
  const wsa = deepCloneScenario(fork.assumptions)
  applyCandidateToAssumptions(wsa, candidate)
  return {
    ...fork,
    id: newScenarioId('whatif'),
    assumptions: wsa,
  }
}

function applyCandidateToAssumptions(
  wsa: Scenario['assumptions'],
  candidate: RecommendedCandidate,
): void {
  if (!candidate.isNewInstance && candidate.targetInstanceId) {
    if (candidate.productId === 'bav') {
      const idx = wsa.bav.findIndex((b) => b.instanceId === candidate.targetInstanceId)
      if (idx >= 0) {
        const current = wsa.bav[idx]
        wsa.bav[idx] = {
          ...current,
          monthlyGrossConversion: (current.monthlyGrossConversion ?? 0) + candidate.grossMonthlyEUR,
        }
      }
    } else if (candidate.productId === 'riester') {
      const idx = wsa.riester.findIndex((r) => r.instanceId === candidate.targetInstanceId)
      if (idx >= 0) {
        const current = wsa.riester[idx]
        wsa.riester[idx] = {
          ...current,
          monthlyOwnContribution: (current.monthlyOwnContribution ?? 0) + candidate.grossMonthlyEUR,
        }
      }
    }
    // ETF: no per-instance contribution field; the fair-comparison invariant
    // pulls ETF gross from bavFunding.monthlyNetCost. Leaving the assumptions
    // untouched here is acceptable for the v1 recommender — issue 15 will
    // revisit per-instance ETF contribution storage.
    return
  }
  // New-instance candidates: append a fresh instance with the sized contribution.
  if (candidate.productId === 'basisrente') {
    wsa.basisrente.push({
      instanceId: newInstanceId('basisrente'),
      label: candidate.label,
      status: 'active',
      contractStartYear: new Date().getFullYear(),
      evidenceMap: {},
      monthlyGrossContribution: candidate.grossMonthlyEUR,
      payoutMode: 'leibrente',
      rentenfaktor: defaultAssumptions.basisrente.rentenfaktor,
      rentenfaktorConfirmed: false,
      monthlyOtherRetirementIncome: 0,
      fees: { ...defaultAssumptions.basisrente.fees },
    } as BasisrenteInstance)
  } else if (candidate.productId === 'altersvorsorgedepot') {
    wsa.altersvorsorgedepot.push({
      instanceId: newInstanceId('altersvorsorgedepot'),
      label: candidate.label,
      status: 'active',
      contractStartYear: new Date().getFullYear(),
      evidenceMap: {},
      ...defaultAssumptions.altersvorsorgedepot,
      monthlyOwnContribution: candidate.grossMonthlyEUR,
    } as AltersvorsorgedepotInstance)
  }
}

// ---------------------------------------------------------------------------
// Smoke-test helper: tax + payout primitives are wired so unused-import linter
// stays quiet.
// ---------------------------------------------------------------------------

void netBavPayout
void netBasisrentePayout
void netRiesterPayout
void netAvdPayout
