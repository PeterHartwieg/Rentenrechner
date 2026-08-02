/**
 * bAV candidate generator.
 *
 * Handles three cases in priority order:
 *   1. User has active bAV instances → candidate adds the marginal budget on
 *      top of the highest-capital instance.
 *   2. User has an "offered" bAV instance → candidate activates the offer and
 *      sizes the conversion to the marginal budget.
 *   3. No bAV instance at all → synthetic new-instance candidate using the
 *      standard recommender offer or the modal offer.
 *
 * Net-cost sizing uses a bisection on the marginal net cost
 *   forward(used + delta).monthlyNetCost − forward(used).monthlyNetCost ≈ marginalEUR
 * rather than an isolated bAV — this is more accurate when the user already
 * has bAV and is near or beyond the SV BBG.
 *
 * Employer contribution is computed from the `bavOffer` in GeneratorContext
 * (populated from the modal answer) or from the instance's contractual terms.
 */

import type { PayoutMode } from '../../domain'
import type { BavInstance } from '../../domain/instances'
import { defaultAssumptions } from '../../data/defaultScenario'
import { buildPortfolioFunding } from '../../engine/portfolioFunding'
import { computeGrossMonthlyPayout } from '../../engine/payoutMath'
import { afterTaxBavLumpSum, deriveBavLumpSumTaxMode } from '../../engine/bavPayout'
import { newInstanceId } from '../workspaceIdentity'
import {
  type CandidateDraft,
  type GeneratorContext,
  type ResolvedBavOffer,
  projectMonthlyContributionFV,
  synthesizeProductResult,
} from './types'

// ---------------------------------------------------------------------------
// Internal bAV helpers
// ---------------------------------------------------------------------------

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function monthlyEmployerContributionForOffer(
  monthlyGrossConversion: number,
  offer: ResolvedBavOffer,
): number {
  if (monthlyGrossConversion <= 0) return 0
  const raw =
    monthlyGrossConversion * offer.employerMatchPercent +
    offer.fixedMonthlyEUR
  return offer.monthlyCapEUR !== undefined ? Math.min(raw, offer.monthlyCapEUR) : raw
}

function resolveBavOfferFromInstance(target: BavInstance): ResolvedBavOffer {
  const fees = target.fees ?? defaultAssumptions.bav.fees
  return {
    hasOffer: true,
    standardAssumption: false,
    employerMatchPercent: clampFinite(target.contractualMatchPercent ?? 0, 0, 5),
    fixedMonthlyEUR: clampFinite(target.contractualFixedMonthly ?? 0, 0, 100_000),
    effectiveCostAnnual: clampFinite(
      (fees.wrapperAssetFee ?? 0) + (fees.fundAssetFee ?? 0),
      0,
      0.1,
    ),
    durchfuehrungsweg: target.durchfuehrungsweg ?? 'direktversicherung_3_63',
    payoutMode: target.payoutMode ?? 'leibrente',
    rentenfaktor: target.rentenfaktor ?? 30,
  }
}

function offerForBavTarget(
  baseTarget: BavInstance,
  isNewInstance: boolean,
  modalOffer: ResolvedBavOffer,
): ResolvedBavOffer | undefined {
  if (modalOffer.hasOffer) return modalOffer
  if (isNewInstance) return modalOffer
  if (baseTarget.status === 'offered') return resolveBavOfferFromInstance(baseTarget)
  return undefined
}

function applyBavOfferToTarget(baseTarget: BavInstance, offer?: ResolvedBavOffer): BavInstance {
  if (!offer) return baseTarget
  return {
    ...baseTarget,
    statutoryMinimumSubsidyEnabled: false,
    contractualMatchPercent: offer.employerMatchPercent,
    contractualFixedMonthly: offer.fixedMonthlyEUR,
    durchfuehrungsweg: offer.durchfuehrungsweg,
    payoutMode: offer.payoutMode,
    rentenfaktor: offer.rentenfaktor,
    fees: {
      ...baseTarget.fees,
      wrapperAssetFee: offer.effectiveCostAnnual,
      fundAssetFee: 0,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      pensionPayoutFeePct: baseTarget.fees?.pensionPayoutFeePct ?? 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Per-instance bAV candidate builder
// ---------------------------------------------------------------------------

function makeBavCandidateForTarget(
  g: GeneratorContext,
  baseTarget: BavInstance,
  isNewInstance: boolean,
): CandidateDraft | null {
  const wsa = g.workspace.baseline.assumptions
  const profile = g.workspace.baseline.profile
  const targetOffer = offerForBavTarget(baseTarget, isNewInstance, g.bavOffer)
  const target = applyBavOfferToTarget(baseTarget, targetOffer)
  const activatesOffer = baseTarget.status === 'offered'
  const currentTargetMonthly = baseTarget.status === 'active'
    ? baseTarget.monthlyGrossConversion
    : 0

  const fundingAtDelta = (delta: number) => {
    const monthlyGrossConversion = currentTargetMonthly + delta
    let trialTarget: BavInstance = {
      ...target,
      status: 'active',
      monthlyGrossConversion,
    }
    // The workspace schema has no employer-offer cap field. Materialise the
    // capped offer as its exact fixed contribution for this trial so the
    // authoritative funding pass still owns aggregate cap and salary effects.
    if (targetOffer) {
      trialTarget = {
        ...trialTarget,
        statutoryMinimumSubsidyEnabled: false,
        contractualMatchPercent: 0,
        contractualFixedMonthly: monthlyEmployerContributionForOffer(
          monthlyGrossConversion,
          targetOffer,
        ),
      }
    }
    const hasTarget = wsa.bav.some((instance) => instance.instanceId === baseTarget.instanceId)
    const bav = hasTarget
      ? wsa.bav.map((instance) =>
          instance.instanceId === baseTarget.instanceId ? trialTarget : instance,
        )
      : [...wsa.bav, trialTarget]
    return buildPortfolioFunding({
      ...g.workspace,
      baseline: {
        ...g.workspace.baseline,
        assumptions: { ...wsa, bav },
      },
    }, g.rules)
  }

  // When the user supplies updated offer terms for an already-active bAV,
  // compare delta 0 and delta N under that same regime. Otherwise the
  // candidate would attribute the whole employer-term switch to the next
  // marginal euro. Offered contracts intentionally keep the untouched
  // baseline because activation itself is part of that candidate.
  const baselineFunding = targetOffer && !isNewInstance && !activatesOffer
    ? fundingAtDelta(0)
    : g.portfolioFunding
  const baselineHeadroom = baselineFunding.headroom.bav
  if (baselineHeadroom.remainingAnnual <= 0 || baselineHeadroom.constrained) return null

  // Find the largest target top-up that does not cause the portfolio funding
  // pass to redistribute already accepted contributions.
  let loCap = 0
  let hiCap = baselineHeadroom.remainingAnnual / 12
  for (let i = 0; i < 50; i++) {
    const mid = (loCap + hiCap) / 2
    if (fundingAtDelta(mid).headroom.bav.constrained) hiCap = mid
    else loCap = mid
  }
  const maxGrossDelta = loCap
  if (maxGrossDelta <= 0) return null

  const forwardMarginalNet = (delta: number) => Math.max(
    0,
    fundingAtDelta(delta).headroom.bav.monthlyNetCost - baselineHeadroom.monthlyNetCost,
  )
  const maxNetCost = forwardMarginalNet(maxGrossDelta)
  const cappedToRemaining = maxNetCost < g.marginalMonthlyEUR - 0.01
  let gross = maxGrossDelta
  if (!cappedToRemaining) {
    let lo = 0
    let hi = maxGrossDelta
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      if (forwardMarginalNet(mid) < g.marginalMonthlyEUR) lo = mid
      else hi = mid
    }
    gross = (lo + hi) / 2
  }

  // Marginal funding: the delta the candidate adds vs. the existing baseline.
  // `netCash` is the user's marginal net cash out-of-pocket; `totalMonthly`
  // is the marginal product contribution (delta gross + delta employer share)
  // used for the candidate's capital projection.
  const prospectiveFunding = fundingAtDelta(gross)
  const netCash = Math.max(
    0,
    prospectiveFunding.headroom.bav.monthlyNetCost - baselineHeadroom.monthlyNetCost,
  )

  // Project capital: marginal contribution = (Δgross + Δemployer share). Use
  // simple FV at basis scenario return minus average accumulation fee. The
  // production simulator does year-by-year fees + Beitragsdynamik; the
  // recommender's "what does another €X buy" only needs candidate ranking.
  const totalMonthly = Math.max(
    0,
    (prospectiveFunding.headroom.bav.fundedAnnual - baselineHeadroom.fundedAnnual) / 12,
  )
  const monthlyEmployerContributionEUR = Math.max(
    0,
    (prospectiveFunding.headroom.bav.employerAnnual - baselineHeadroom.employerAnnual) / 12,
  )
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

  // Net capital at retirement — issue 67. Leibrente bAV is paid as monthly
  // pension (taxed via §19/§22 Nr. 5 in the payout pipeline), so capital is
  // contractual, not user-usable as a lump sum: set null → payoutOnly=true.
  // Other payout modes (kapitalverzehr / zeitrente) tax the lump sum via
  // `deriveBavLumpSumTaxMode` (Direktversicherung §3 Nr. 63 → voll
  // versorgungsbezug; §40b a.F. eligible → pre2005_steuerfrei; Direktzusage /
  // Unterstützungskasse → Fünftelregelung) plus §229 SGB V 1/120 KV/PV.
  const bavIsLeibrente = (target.payoutMode ?? 'leibrente') === 'leibrente'
  let bavAfterTaxLumpSum: number | null = null
  if (!bavIsLeibrente) {
    const retirementYear = g.rules.year + (profile.retirementAge - profile.age)
    const bavTaxMode = deriveBavLumpSumTaxMode(
      target.durchfuehrungsweg ?? 'direktversicherung_3_63',
      target.pre2005EligibleTaxFree ?? false,
    )
    bavAfterTaxLumpSum = afterTaxBavLumpSum(
      capital,
      profile,
      g.rules,
      0,
      true,
      retirementYear,
      bavTaxMode,
      0,
    )
  }

  const candidateResult = synthesizeProductResult({
    productId: 'bav',
    instanceId: target.instanceId,
    scenarioId: g.basis.scenarioId,
    scenarioLabel: 'Basis',
    annualReturn: g.basis.annualReturn,
    grossMonthlyPayout: grossPayout,
    capitalAtRetirement: capital,
    totalProductContributions: totalContributions,
    afterTaxLumpSum: bavAfterTaxLumpSum,
    label: target.label ?? 'bAV',
  })

  return {
    id: isNewInstance
      ? 'new_bav_standard_offer'
      : activatesOffer
        ? `activate_${target.instanceId}`
        : `add_to_${target.instanceId}`,
    label: isNewInstance
      ? 'Neue bAV'
      : activatesOffer
        ? `bAV-Angebot nutzen (${target.label ?? 'bAV'})`
      : `Zusatz auf bestehende bAV (${target.label ?? 'bAV'})`,
    productId: 'bav',
    isNewInstance,
    targetInstanceId: isNewInstance ? undefined : target.instanceId,
    grossMonthlyEUR: gross,
    netCashOutEUR: netCash,
    cappedToRemaining,
    candidateResult,
    newInstance: isNewInstance
      ? {
          ...target,
          monthlyGrossConversion: gross,
        }
      : undefined,
    mcInputs: { monthlyContribution: totalMonthly, totalFeeDecimal: fees },
    usesStandardAssumptions: targetOffer?.standardAssumption,
    bavOffer: targetOffer,
    monthlyEmployerContributionEUR,
  }
}

// ---------------------------------------------------------------------------
// Public generator
// ---------------------------------------------------------------------------

export function makeBavCandidate(g: GeneratorContext): CandidateDraft | null {
  const wsa = g.workspace.baseline.assumptions
  const existingTargets = wsa.bav.filter((target) => target.status === 'active' || target.status === 'offered')
  const targetInputs = existingTargets.length > 0
    ? existingTargets.map((target) => ({ target, isNewInstance: false }))
    : [{
        target: {
          ...defaultAssumptions.bav,
          instanceId: newInstanceId('bav'),
          label: 'Neue bAV',
          status: 'active',
          contractStartYear: g.rules.year,
          evidenceMap: {},
          monthlyGrossConversion: 0,
        } as BavInstance,
        isNewInstance: true,
      }]
  const candidates = targetInputs
    .map(({ target, isNewInstance }) => makeBavCandidateForTarget(g, target, isNewInstance))
    .filter((candidate): candidate is CandidateDraft => Boolean(candidate))
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.candidateResult.capitalAtRetirement - a.candidateResult.capitalAtRetirement)
  return candidates[0]
}
