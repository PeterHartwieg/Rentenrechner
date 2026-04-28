import type {
  AltersvorsorgedepotFundingResult,
  BasisrenteFundingResult,
  BavFundingResult,
  BavLumpSumTaxMode,
  EtfPayoutRow,
  FeeModel,
  GermanRules,
  PersonalProfile,
  ProductId,
  ProductResult,
  ReturnScenario,
  RiesterFundingResult,
  ScenarioAssumptions,
} from '../domain/types'
// ProductResult is the discriminated union; individual product simulate() functions
// narrow the return to the specific member via type assertions at their call sites.
import {
  afterTaxBavLumpSum,
  afterTaxInsuranceLumpSum,
  afterTaxInvestmentCapital,
  computeGrossMonthlyPayout,
  etfPayoutSchedule,
  monthlyPayoutFromCapital,
  netBavPayout,
  netInsurancePayout,
  projectAccumulation,
} from './projections'
import { netBasisrentePayout } from './basisrente'
import { afterTaxAvdLumpSum, netAvdPayout } from './altersvorsorgedepot'
import { afterTaxRiesterLumpSum, netRiesterPayout } from './riester'
import { computeRIY } from './fees'

export const zeroFeeModel: FeeModel = {
  wrapperAssetFee: 0,
  fundAssetFee: 0,
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 1,
  pensionPayoutFeePct: 0,
}

function capitalMultipleAnnualized(finalValue: number, totalUserCost: number, years: number): number {
  if (finalValue <= 0 || totalUserCost <= 0 || years <= 0) {
    return 0
  }
  return Math.pow(finalValue / totalUserCost, 1 / years) - 1
}

export function buildProductResult(params: {
  productId: ProductId
  label: string
  scenario: ReturnScenario
  profile: PersonalProfile
  rules: GermanRules
  assumptions: ScenarioAssumptions
  bavFunding: BavFundingResult
  monthlyUserCost: number
  monthlyProductContribution: number
  monthlyEmployerContribution: number
  fees: FeeModel
  taxMode: 'etf' | 'bav' | 'pre2005' | 'halbeinkuenfte' | 'abgeltungsteuer' | 'basisrente' | 'altersvorsorgedepot' | 'riester'
  /** Required when taxMode === 'basisrente' to populate taxAndSvSavings. */
  basisrenteFunding?: BasisrenteFundingResult
  /** Required when taxMode === 'altersvorsorgedepot'. */
  avdFunding?: AltersvorsorgedepotFundingResult
  /** Required when taxMode === 'riester' to populate taxAndSvSavings. */
  riesterFunding?: RiesterFundingResult
  /** #71: initial capital for the accumulation (e.g. transferred Riester capital). */
  initialCapital?: number
  partialExemption?: number
  /** Calendar year the user reaches retirement age — used for cohort-table lookups in #46 pipeline. */
  retirementYear: number
  /** #48: derived bAV lump-sum tax mode (only used when taxMode === 'bav') */
  bavLumpSumTaxMode?: BavLumpSumTaxMode
  /** Year-varying return function for Standarddepot glidepath. */
  yearlyReturnFn?: (yearIndex: number) => number
}): ProductResult {
  const yearsToRetirement = params.profile.retirementAge - params.profile.age
  const monthsToRetirement = yearsToRetirement * 12
  const payoutYears = params.assumptions.retirementEndAge - params.profile.retirementAge
  const projection = projectAccumulation({
    productId: params.productId,
    currentAge: params.profile.age,
    months: monthsToRetirement,
    monthlyUserCost: params.monthlyUserCost,
    monthlyProductContribution: params.monthlyProductContribution,
    monthlyEmployerContribution: params.monthlyEmployerContribution,
    annualReturn: params.scenario.annualReturn,
    inflationRate: params.assumptions.inflationRate,
    scenario: params.scenario,
    fees: params.fees,
    etfVorabpauschale:
      params.taxMode === 'etf'
        ? { rules: params.rules, partialExemption: params.partialExemption ?? 0 }
        : undefined,
    yearlyReturnFn: params.yearlyReturnFn,
    initialCapital: params.initialCapital,
  })
  const totalAssetFee = params.fees.wrapperAssetFee + params.fees.fundAssetFee
  const payoutReturn = params.scenario.annualReturn - totalAssetFee
  // #54: ETF stays in capital-drawdown mode (user-managed depletion). bAV and private
  // insurance branch on the contractual `payoutMode` — Leibrente uses the contract's
  // Rentenfaktor instead of `payoutYears`.
  let grossMonthlyPayout: number
  if (params.taxMode === 'etf') {
    grossMonthlyPayout = monthlyPayoutFromCapital(projection.capital, payoutReturn, payoutYears)
  } else if (params.taxMode === 'bav') {
    grossMonthlyPayout = computeGrossMonthlyPayout(projection.capital, {
      mode: params.assumptions.bav.payoutMode,
      rentenfaktor: params.assumptions.bav.rentenfaktor,
      zeitrenteYears: params.assumptions.bav.zeitrenteYears,
      kapitalverzehrYears: payoutYears,
      payoutReturn,
    })
  } else if (params.taxMode === 'basisrente') {
    grossMonthlyPayout = computeGrossMonthlyPayout(projection.capital, {
      mode: params.assumptions.basisrente.payoutMode,
      rentenfaktor: params.assumptions.basisrente.rentenfaktor,
      zeitrenteYears: params.assumptions.basisrente.zeitrenteYears,
      kapitalverzehrYears: payoutYears,
      payoutReturn,
    })
  } else if (params.taxMode === 'altersvorsorgedepot') {
    const avdAssumptions = params.assumptions.altersvorsorgedepot
    // Partial capital payout reduces the capital available for monthly payout.
    const partialPct = Math.min(avdAssumptions.partialCapitalPct, params.rules.altersvorsorgedepot.partialCapitalMaxPct)
    const monthlyCapital = projection.capital * (1 - partialPct)
    if (avdAssumptions.payoutMode === 'lifelong_annuity') {
      grossMonthlyPayout = (monthlyCapital / 10_000) * avdAssumptions.rentenfaktor
    } else {
      // certified_payout_plan or hybrid_80_annuity: drawdown to max(payoutPlanEndAge, 85)
      const planEndAge = Math.max(avdAssumptions.payoutPlanEndAge, params.rules.altersvorsorgedepot.payoutPlanMinEndAge)
      const planYears = planEndAge - params.profile.retirementAge
      grossMonthlyPayout = monthlyPayoutFromCapital(monthlyCapital, payoutReturn, planYears)
    }
  } else if (params.taxMode === 'riester') {
    grossMonthlyPayout = computeGrossMonthlyPayout(projection.capital, {
      mode: params.assumptions.riester.payoutMode,
      rentenfaktor: params.assumptions.riester.rentenfaktor,
      zeitrenteYears: params.assumptions.riester.zeitrenteYears,
      kapitalverzehrYears: payoutYears,
      payoutReturn,
    })
  } else {
    grossMonthlyPayout = computeGrossMonthlyPayout(projection.capital, {
      mode: params.assumptions.insurance.payoutMode,
      rentenfaktor: params.assumptions.insurance.rentenfaktor,
      zeitrenteYears: params.assumptions.insurance.zeitrenteYears,
      kapitalverzehrYears: payoutYears,
      payoutReturn,
    })
  }

  // #56: pension-phase fee — applied to bAV, insurance, and Basisrente annuity payouts before
  // income tax and KV/PV. Convention: grossMonthlyPayout is gross before this fee.
  if (params.taxMode !== 'etf' && params.fees.pensionPayoutFeePct > 0) {
    grossMonthlyPayout = grossMonthlyPayout * (1 - params.fees.pensionPayoutFeePct)
  }

  let afterTaxLumpSum: number | null = projection.capital
  let netMonthlyPayout = grossMonthlyPayout
  let etfPayoutRows: EtfPayoutRow[] | undefined

  if (params.taxMode === 'etf') {
    const partialExemption = params.partialExemption ?? 0
    afterTaxLumpSum = afterTaxInvestmentCapital(
      projection.capital,
      projection.totalContributionsBeforeFees,
      params.rules,
      partialExemption,
      projection.cumulativeVorabpauschale,
    )
    etfPayoutRows = etfPayoutSchedule(
      projection.capital,
      projection.totalContributionsBeforeFees,
      projection.cumulativeVorabpauschale,
      grossMonthlyPayout,
      payoutYears,
      payoutReturn,
      params.profile.retirementAge,
      params.rules,
      partialExemption,
    )
    netMonthlyPayout = etfPayoutRows.length > 0
      ? etfPayoutRows[0].netMonthlyPayout
      : grossMonthlyPayout
  }

  if (
    params.taxMode === 'pre2005' ||
    params.taxMode === 'halbeinkuenfte' ||
    params.taxMode === 'abgeltungsteuer'
  ) {
    const otherAnnual = params.assumptions.insurance.monthlyOtherRetirementIncome * 12
    // kvdrMember shared across products: if the user is freiwillig versichert for bAV,
    // they are also freiwillig versichert for private insurance (same retirement GKV status).
    const kvdrMember = params.assumptions.bav.kvdrMember !== false
    afterTaxLumpSum = afterTaxInsuranceLumpSum(
      projection.capital,
      projection.totalContributionsBeforeFees,
      params.taxMode,
      params.rules,
      otherAnnual,
      params.retirementYear,
      params.profile,
      kvdrMember,
    )
    netMonthlyPayout = netInsurancePayout(
      grossMonthlyPayout,
      projection.capital,
      projection.totalContributionsBeforeFees,
      params.taxMode,
      params.rules,
      params.assumptions.insurance.monthlyOtherRetirementIncome,
      params.retirementYear,
      params.profile,
      kvdrMember,
      params.assumptions.insurance.payoutMode,   // #59: Ertragsanteil for leibrente
      params.profile.retirementAge,
    )
  }

  if (params.taxMode === 'basisrente') {
    // Basisrente: full capital payout is not permitted.
    afterTaxLumpSum = null
    const otherIncome = params.assumptions.basisrente.monthlyOtherRetirementIncome
    netMonthlyPayout = netBasisrentePayout(
      grossMonthlyPayout,
      params.profile,
      params.rules,
      otherIncome,
      params.retirementYear,
    )
  }

  if (params.taxMode === 'altersvorsorgedepot') {
    const avdAssumptions = params.assumptions.altersvorsorgedepot
    const partialPct = Math.min(avdAssumptions.partialCapitalPct, params.rules.altersvorsorgedepot.partialCapitalMaxPct)
    const partialCapital = projection.capital * partialPct - avdAssumptions.transferCostEUR
    const otherAnnual = avdAssumptions.monthlyOtherRetirementIncome * 12
    // Partial capital at payout start taxed as §22 Nr. 5 EStG; null when no partial capital.
    afterTaxLumpSum = partialPct > 0
      ? afterTaxAvdLumpSum(Math.max(0, partialCapital), params.profile, params.rules, otherAnnual, params.retirementYear)
      : null
    // Monthly net payout from the remaining capital.
    netMonthlyPayout = netAvdPayout(
      grossMonthlyPayout,
      params.profile,
      params.rules,
      avdAssumptions.monthlyOtherRetirementIncome,
      params.retirementYear,
    )
  }

  if (params.taxMode === 'riester') {
    const riesterAssumptions = params.assumptions.riester
    const partialPct = Math.min(riesterAssumptions.partialCapitalPct, 0.30)
    const partialCapital = projection.capital * partialPct
    const otherAnnual = riesterAssumptions.monthlyOtherRetirementIncome * 12
    // Partial capital at payout start taxed under §22 Nr. 5 EStG.
    afterTaxLumpSum = partialPct > 0
      ? afterTaxRiesterLumpSum(partialCapital, params.profile, params.rules, otherAnnual, params.retirementYear)
      : null
    netMonthlyPayout = netRiesterPayout(
      grossMonthlyPayout,
      params.profile,
      params.rules,
      riesterAssumptions.monthlyOtherRetirementIncome,
      params.retirementYear,
    )
  }

  if (params.taxMode === 'bav') {
    afterTaxLumpSum = afterTaxBavLumpSum(
      projection.capital,
      params.profile,
      params.rules,
      params.assumptions.bav.monthlyOtherRetirementIncome * 12,
      params.assumptions.bav.kvdrMember,
      params.retirementYear,
      params.bavLumpSumTaxMode,
    )
    const otherIncome = params.assumptions.bav.monthlyOtherRetirementIncome
    let rawNet = netBavPayout(
      grossMonthlyPayout,
      params.profile,
      params.rules,
      otherIncome,
      params.assumptions.bav.kvdrMember,
      params.retirementYear,
    )
    if (params.assumptions.bav.includeGrvReduction) {
      rawNet = Math.max(0, rawNet - params.bavFunding.estimatedMonthlyGrvReduction)
    }
    netMonthlyPayout = rawNet
  }

  return {
    productId: params.productId,
    label: params.label,
    scenarioId: params.scenario.id,
    scenarioLabel: params.scenario.label,
    annualReturn: params.scenario.annualReturn,
    monthlyUserCost: params.monthlyUserCost,
    monthlyProductContribution: params.monthlyProductContribution,
    monthlyEmployerContribution: params.monthlyEmployerContribution,
    totalUserCost: projection.totalUserCost,
    totalProductContributions: projection.totalProductContributions,
    totalEmployerContributions: projection.totalEmployerContributions,
    totalFees: projection.totalFees,
    capitalAtRetirement: projection.capital,
    realCapitalAtRetirement: projection.realCapital,
    afterTaxLumpSum,
    grossMonthlyPayout,
    netMonthlyPayout,
    taxAndSvSavings:
      params.productId === 'bav'
        ? params.bavFunding.annualTaxAndSvSavings * yearsToRetirement
        : params.productId === 'basisrente' && params.basisrenteFunding
          ? params.basisrenteFunding.annualTaxSaving * yearsToRetirement
          : params.productId === 'altersvorsorgedepot' && params.avdFunding
            ? (params.avdFunding.totalAllowanceAnnual + params.avdFunding.guenstigerpruefungBenefitAnnual) * yearsToRetirement
            : params.productId === 'riester' && params.riesterFunding
              ? (params.riesterFunding.totalAllowanceAnnual + params.riesterFunding.guenstigerpruefungBenefitAnnual) * yearsToRetirement
              : 0,
    valueMultipleOnUserCost:
      projection.totalUserCost > 0 && afterTaxLumpSum !== null
        ? afterTaxLumpSum / projection.totalUserCost
        : null,
    capitalMultipleAnnualized:
      afterTaxLumpSum !== null
        ? capitalMultipleAnnualized(afterTaxLumpSum, projection.totalUserCost, yearsToRetirement)
        : 0,
    // #57: Effektivkosten (accumulation phase) — RIY in pp
    accumulationRiy: computeRIY(
      params.monthlyProductContribution,
      monthsToRetirement,
      params.scenario.annualReturn,
      projection.capital,
    ),
    // #64: nominal break-even age for Leibrente — years to recoup capital at gross payout rate
    leibrenteBreakEvenAge:
      params.taxMode !== 'etf' &&
      (params.taxMode === 'bav'
        ? params.assumptions.bav.payoutMode === 'leibrente'
        : params.taxMode === 'basisrente'
          ? params.assumptions.basisrente.payoutMode === 'leibrente'
          : params.taxMode === 'altersvorsorgedepot'
            ? params.assumptions.altersvorsorgedepot.payoutMode === 'lifelong_annuity'
            : params.taxMode === 'riester'
              ? params.assumptions.riester.payoutMode === 'leibrente'
              : params.assumptions.insurance.payoutMode === 'leibrente') &&
      grossMonthlyPayout > 0
        ? params.profile.retirementAge + projection.capital / (grossMonthlyPayout * 12)
        : undefined,
    rows: projection.rows,
    etfPayoutRows,
  } as ProductResult
}
