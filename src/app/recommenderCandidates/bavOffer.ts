/** Shared offer resolution and saved-plan patch; no orchestration or storage dependencies. */
import type { BavInstance } from '../../domain/instances'
import { defaultAssumptions } from '../../data/defaultScenario'
import type { ResolvedBavOffer } from './types'

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

export function resolveBavOfferFromInstance(target: BavInstance): ResolvedBavOffer {
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

export function bavOfferPatchForSavedPlan(
  offer: ResolvedBavOffer | undefined,
  totalMonthlyGrossConversion: number,
): Partial<BavInstance> {
  if (!offer) return {}
  const cappedEmployerMonthly = monthlyEmployerContributionForOffer(
    totalMonthlyGrossConversion,
    offer,
  )
  const capWouldBind =
    offer.monthlyCapEUR !== undefined &&
    totalMonthlyGrossConversion * offer.employerMatchPercent + offer.fixedMonthlyEUR > offer.monthlyCapEUR
  return {
    statutoryMinimumSubsidyEnabled: false,
    contractualMatchPercent: capWouldBind ? 0 : offer.employerMatchPercent,
    contractualFixedMonthly: capWouldBind ? cappedEmployerMonthly : offer.fixedMonthlyEUR,
    durchfuehrungsweg: offer.durchfuehrungsweg,
    payoutMode: offer.payoutMode,
    rentenfaktor: offer.rentenfaktor,
    rentenfaktorConfirmed: offer.hasOffer,
    fees: {
      ...defaultAssumptions.bav.fees,
      wrapperAssetFee: offer.effectiveCostAnnual,
      fundAssetFee: 0,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
    },
  }
}
