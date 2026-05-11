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

import type {
  BavFundingResult,
  GermanRules,
  PayoutMode,
  PersonalProfile,
} from '../../domain'
import type { BavInstance } from '../../domain/instances'
import { defaultAssumptions } from '../../data/defaultScenario'
import { calculateBavFunding, calculateSalaryResult } from '../../engine/salary'
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

function bavOfferFunding(
  profile: PersonalProfile,
  rules: GermanRules,
  bav: BavInstance,
  offer: ResolvedBavOffer,
): BavFundingResult {
  const annualGrossConversion = bav.monthlyGrossConversion * 12
  const monthlyEmployerContribution = monthlyEmployerContributionForOffer(
    bav.monthlyGrossConversion,
    offer,
  )
  const annualEmployerContribution = monthlyEmployerContribution * 12
  const taxFreeLimit = rules.socialSecurity.pensionCapYear * rules.bav.taxFreePctOfPensionCap
  const svFreeLimit = rules.socialSecurity.pensionCapYear * rules.bav.socialSecurityFreePctOfPensionCap
  const totalBavContributionAnnual = annualGrossConversion + annualEmployerContribution
  const effectiveTaxFreeConversion = Math.max(
    0,
    Math.min(annualGrossConversion, taxFreeLimit - annualEmployerContribution),
  )
  const effectiveSvFreeConversion = Math.max(
    0,
    Math.min(annualGrossConversion, svFreeLimit - annualEmployerContribution),
  )
  const salaryWithoutBav = calculateSalaryResult(profile, rules, 0)
  const salaryWithBav = calculateSalaryResult(
    profile,
    rules,
    annualGrossConversion,
    effectiveTaxFreeConversion,
    effectiveSvFreeConversion,
  )
  const annualNetCost = salaryWithoutBav.annualNet - salaryWithBav.annualNet
  const annualTaxAndSvSavings = annualGrossConversion - annualNetCost
  const taxFreePortionAnnual = Math.min(totalBavContributionAnnual, taxFreeLimit)
  const svFreePortionAnnual = Math.min(totalBavContributionAnnual, svFreeLimit)
  const yearsToRetirement = Math.max(0, profile.retirementAge - profile.age)
  const rvBbg = rules.socialSecurity.pensionCapYear
  const lostPensionableBase =
    Math.min(profile.grossSalaryYear, rvBbg) -
    Math.min(profile.grossSalaryYear - effectiveSvFreeConversion, rvBbg)
  const estimatedMonthlyGrvReduction =
    yearsToRetirement *
    (lostPensionableBase / rules.socialSecurity.durchschnittsentgelt) *
    rules.socialSecurity.aktuellerRentenwert

  return {
    monthlyGrossConversion: bav.monthlyGrossConversion,
    annualGrossConversion,
    monthlyNetCost: annualNetCost / 12,
    annualNetCost,
    monthlyTaxAndSvSavings: annualTaxAndSvSavings / 12,
    annualTaxAndSvSavings,
    monthlyStatutoryEmployerSubsidy: 0,
    monthlyStatutoryEmployerSubsidyUncapped: 0,
    monthlyStatutoryEmployerSubsidyCap: 0,
    monthlyStatutoryEmployerSubsidyCapApplied: false,
    monthlyContractualEmployerContribution: monthlyEmployerContribution,
    monthlyEmployerContribution,
    annualEmployerContribution,
    employerSocialSecuritySavingAnnual: 0,
    salaryWithoutBav,
    salaryWithBav,
    totalBavContributionAnnual,
    taxFreePortionAnnual,
    svFreePortionAnnual,
    taxableOverflowAnnual: Math.max(0, totalBavContributionAnnual - taxFreeLimit),
    svLiableOverflowAnnual: Math.max(0, totalBavContributionAnnual - svFreeLimit),
    estimatedMonthlyGrvReduction,
  }
}

function fundingForBavCandidate(
  profile: PersonalProfile,
  rules: GermanRules,
  bav: BavInstance,
  offer?: ResolvedBavOffer,
): BavFundingResult {
  if (offer?.hasOffer || offer?.standardAssumption) {
    return bavOfferFunding(profile, rules, bav, offer)
  }
  return calculateBavFunding(profile, rules, bav)
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
  // Existing aggregate gross conversion across active bAV instances (single-employer
  // V1 assumption: §3 Nr. 63 + SvEV cap shared across one person's bAV portfolio).
  const usedMonthly = wsa.bav
    .filter((b) => b.status === 'active')
    .reduce((s, b) => s + (b.monthlyGrossConversion ?? 0), 0)
  const capMonthly = (g.rules.socialSecurity.pensionCapYear * g.rules.bav.taxFreePctOfPensionCap) / 12
  const remainingCapMonthly = Math.max(0, capMonthly - usedMonthly)
  if (remainingCapMonthly <= 0) return null

  const neutralEmployerTerms = {
    contractualMatchPercent: 0,
    contractualFixedMonthly: 0,
  }
  const fundingForNetCost = (monthlyGrossConversion: number) =>
    activatesOffer
      ? calculateBavFunding(profile, g.rules, {
          ...target,
          ...neutralEmployerTerms,
          monthlyGrossConversion,
        })
      : fundingForBavCandidate(profile, g.rules, {
          ...target,
          monthlyGrossConversion,
        }, targetOffer)

  // Bisection: solve for the marginal gross conversion (delta on top of
  // existing) such that
  //   forward(usedMonthly + delta).monthlyNetCost
  //     - forward(usedMonthly).monthlyNetCost  ≈  marginalMonthlyEUR.
  // The previous approach solved against an isolated bAV (gross=delta only);
  // that under-counts the SV-saving step when usedMonthly already pushes part
  // of the income below the BBG, so the returned delta was off for users with
  // existing bAV. Now we bisect on the actual marginal net cost.
  const baselineNetCost = fundingForNetCost(usedMonthly).monthlyNetCost
  const forwardMarginalNet = (delta: number) =>
    fundingForNetCost(usedMonthly + delta).monthlyNetCost -
      baselineNetCost
  // grossDelta = forward(used + delta) − forward(used); marginal, not isolated.
  const grossDelta = (() => {
    if (g.marginalMonthlyEUR <= 0) return 0
    let lo = 0
    let hi = Math.max(100, g.marginalMonthlyEUR * 4)
    for (let i = 0; i < 10 && forwardMarginalNet(hi) < g.marginalMonthlyEUR; i++) hi *= 2
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      const net = forwardMarginalNet(mid)
      if (Math.abs(net - g.marginalMonthlyEUR) < 0.01) return mid
      if (net < g.marginalMonthlyEUR) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  })()
  const cappedToRemaining = grossDelta > remainingCapMonthly
  const gross = Math.min(grossDelta, remainingCapMonthly)

  // Marginal funding: the delta the candidate adds vs. the existing baseline.
  // `netCash` is the user's marginal net cash out-of-pocket; `totalMonthly`
  // is the marginal product contribution (delta gross + delta employer share)
  // used for the candidate's capital projection.
  const fundingBaseline = fundingForNetCost(usedMonthly)
  const fundingTotalForNet = fundingForNetCost(usedMonthly + gross)
  const fundingTotal = activatesOffer
    ? fundingForBavCandidate(profile, g.rules, {
        ...target,
        monthlyGrossConversion: gross,
      }, targetOffer)
    : fundingForBavCandidate(profile, g.rules, {
        ...target,
        monthlyGrossConversion: usedMonthly + gross,
      }, targetOffer)
  const netCash = Math.max(0, fundingTotalForNet.monthlyNetCost - fundingBaseline.monthlyNetCost)

  // Project capital: marginal contribution = (Δgross + Δemployer share). Use
  // simple FV at basis scenario return minus average accumulation fee. The
  // production simulator does year-by-year fees + Beitragsdynamik; the
  // recommender's "what does another €X buy" only needs candidate ranking.
  const totalMonthly = activatesOffer
    ? gross + fundingTotal.monthlyEmployerContribution
    : (fundingTotal.monthlyGrossConversion - fundingBaseline.monthlyGrossConversion) +
      (fundingTotal.monthlyEmployerContribution - fundingBaseline.monthlyEmployerContribution)
  const monthlyEmployerContributionEUR = activatesOffer
    ? fundingTotal.monthlyEmployerContribution
    : fundingTotal.monthlyEmployerContribution - fundingBaseline.monthlyEmployerContribution
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
