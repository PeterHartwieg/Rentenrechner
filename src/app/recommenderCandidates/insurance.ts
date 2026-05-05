/**
 * Private insurance (pAV) candidate generator.
 *
 * Generates a candidate that adds the marginal budget to an existing active
 * or offered insurance instance. The recommender does NOT synthesize a
 * brand-new no-instance candidate — insurance only appears when the user has
 * indicated an available offer (active or offered instance).
 *
 * Insurance contributions are after-tax money — the user's net cash burden
 * equals the gross contribution (no Sonderausgaben deduction during
 * accumulation, unlike Basisrente / Riester / bAV).
 *
 * Capital is taxed via `deriveInsuranceTaxMode` (halbeinkuenfte /
 * abgeltungsteuer / pre2005) when the payout mode is not Leibrente. Leibrente
 * payouts use §22 Nr. 1 Satz 3 a EStG Ertragsanteil — `afterTaxLumpSum` is
 * null in that case.
 */

import type { PayoutMode } from '../../domain'
import { computeGrossMonthlyPayout } from '../../engine/payoutMath'
import {
  afterTaxInsuranceLumpSum,
  computeRuntimeYearsAtRetirement,
  deriveInsuranceTaxMode,
} from '../../engine/insurancePayout'
import {
  type CandidateDraft,
  type GeneratorContext,
  projectMonthlyContributionFV,
  synthesizeProductResult,
} from './types'

export function makeInsuranceCandidate(g: GeneratorContext): CandidateDraft | null {
  const wsa = g.workspace.baseline.assumptions
  const profile = g.workspace.baseline.profile
  // Prefer offered (concrete offer the user is evaluating); fall back to active.
  const target =
    wsa.insurance.find((i) => i.status === 'offered') ??
    wsa.insurance.find((i) => i.status === 'active')
  if (!target) return null

  const gross = g.marginalMonthlyEUR
  if (gross <= 0) return null
  const fees = (target.fees?.wrapperAssetFee ?? 0) + (target.fees?.fundAssetFee ?? 0)
  const netReturn = Math.max(-0.5, g.basis.annualReturn - fees)
  const capital = projectMonthlyContributionFV(gross, netReturn, g.yearsToRetirement)
  const totalContributions = gross * 12 * g.yearsToRetirement
  const payoutYears = Math.max(1, wsa.retirementEndAge - profile.retirementAge)
  const grossPayout = computeGrossMonthlyPayout(capital, {
    mode: target.payoutMode as PayoutMode,
    rentenfaktor: target.rentenfaktor ?? 28,
    zeitrenteYears: target.zeitrenteYears ?? 20,
    kapitalverzehrYears: payoutYears,
    payoutReturn: netReturn,
  })

  // Net (after-tax) lump sum — issue 67. Leibrente payouts are taxed via
  // Ertragsanteil at payout-time, so when the contract is annuitised we set
  // afterTaxLumpSum=null and let the candidate fall back to gross capital with
  // payoutOnly=true downstream.
  const isLeibrente = target.payoutMode === 'leibrente'
  let afterTaxLumpSum: number | null = null
  if (!isLeibrente) {
    const retirementYear = g.rules.year + (profile.retirementAge - profile.age)
    const runtimeYearsAtRetirement = computeRuntimeYearsAtRetirement(
      target.contractStartYear,
      g.rules.year,
      profile.age,
      profile.retirementAge,
    )
    const taxMode = deriveInsuranceTaxMode(
      target.contractStartYear,
      runtimeYearsAtRetirement,
      profile.retirementAge,
      target.oldContractTaxFreeEligible,
    )
    afterTaxLumpSum = afterTaxInsuranceLumpSum(
      capital,
      totalContributions,
      taxMode,
      g.rules,
      0,
      retirementYear,
      profile,
      true,
      0,
    )
  }

  const candidateResult = synthesizeProductResult({
    productId: 'versicherung',
    instanceId: target.instanceId,
    scenarioId: g.basis.scenarioId,
    scenarioLabel: 'Basis',
    annualReturn: g.basis.annualReturn,
    grossMonthlyPayout: grossPayout,
    capitalAtRetirement: capital,
    totalProductContributions: totalContributions,
    afterTaxLumpSum,
    label: target.label ?? 'Private Rentenversicherung',
  })

  const isOffered = target.status === 'offered'
  const id = isOffered
    ? `activate_${target.instanceId}`
    : `add_to_${target.instanceId}`
  const label = isOffered
    ? `Versicherungsangebot nutzen (${target.label ?? 'Private Rentenversicherung'})`
    : `Aufstockung Versicherung (${target.label ?? 'Private Rentenversicherung'})`

  return {
    id,
    label,
    productId: 'versicherung',
    isNewInstance: false,
    targetInstanceId: target.instanceId,
    grossMonthlyEUR: gross,
    netCashOutEUR: gross,
    cappedToRemaining: false,
    candidateResult,
    mcInputs: { monthlyContribution: gross, totalFeeDecimal: fees },
  }
}
