import type {
  BavFundingResult,
  EtfPayoutRow,
  FeeModel,
  GermanRules,
  PersonalProfile,
  ProductId,
  ProductResult,
  ReturnScenario,
  ScenarioAssumptions,
  SimulationResult,
} from '../domain/types'
import { calculateBavFunding } from './salary'
import {
  afterTaxBavLumpSum,
  afterTaxInsuranceLumpSum,
  afterTaxInvestmentCapital,
  deriveInsuranceTaxMode,
  etfPayoutSchedule,
  monthlyPayoutFromCapital,
  netBavPayout,
  netInsurancePayout,
  projectAccumulation,
} from './projections'

const zeroFeeModel: FeeModel = {
  annualAssetFee: 0,
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 1,
}

function capitalMultipleAnnualized(finalValue: number, totalUserCost: number, years: number): number {
  if (finalValue <= 0 || totalUserCost <= 0 || years <= 0) {
    return 0
  }

  return Math.pow(finalValue / totalUserCost, 1 / years) - 1
}

function buildProductResult(params: {
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
  taxMode: 'etf' | 'bav' | 'pre2005' | 'halbeinkuenfte' | 'abgeltungsteuer'
  partialExemption?: number
  /** Calendar year the user reaches retirement age — used for cohort-table lookups in #46 pipeline. */
  retirementYear: number
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
  })
  const payoutReturn = params.scenario.annualReturn - params.fees.annualAssetFee
  const grossMonthlyPayout = monthlyPayoutFromCapital(
    projection.capital,
    payoutReturn,
    payoutYears,
  )

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
    afterTaxLumpSum = afterTaxInsuranceLumpSum(
      projection.capital,
      projection.totalContributionsBeforeFees,
      params.taxMode,
      params.rules,
      otherAnnual,
      params.retirementYear,
    )
    netMonthlyPayout = netInsurancePayout(
      grossMonthlyPayout,
      projection.capital,
      projection.totalContributionsBeforeFees,
      params.taxMode,
      params.rules,
      params.assumptions.insurance.monthlyOtherRetirementIncome,
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
      params.productId === 'bav' ? params.bavFunding.annualTaxAndSvSavings * yearsToRetirement : 0,
    valueMultipleOnUserCost:
      projection.totalUserCost > 0 && afterTaxLumpSum !== null
        ? afterTaxLumpSum / projection.totalUserCost
        : null,
    capitalMultipleAnnualized:
      afterTaxLumpSum !== null
        ? capitalMultipleAnnualized(afterTaxLumpSum, projection.totalUserCost, yearsToRetirement)
        : 0,
    rows: projection.rows,
    etfPayoutRows,
  }
}

export function simulateRetirementComparison(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  rules: GermanRules,
): SimulationResult {
  const bavFunding = calculateBavFunding(profile, rules, assumptions.bav)
  const etfMonthly = bavFunding.monthlyNetCost
  const insuranceMonthly = bavFunding.monthlyNetCost
  // Use calendar years so the classification is correct regardless of when the contract started.
  // payoutYear = the calendar year the user reaches retirementAge.
  // contractRuntimeYears = years from contract start to payout (actual duration as insurer sees it).
  const payoutYear = rules.year + (profile.retirementAge - profile.age)
  const contractRuntimeYears = payoutYear - assumptions.insurance.contractStartYear
  const insuranceTaxMode = deriveInsuranceTaxMode(
    assumptions.insurance.contractStartYear,
    contractRuntimeYears,
    profile.retirementAge,
    assumptions.insurance.oldContractTaxFreeEligible,
  )

  const products = assumptions.returnScenarios.flatMap((scenario) => [
    buildProductResult({
      productId: 'etf',
      label: 'ETF-Depot',
      scenario,
      profile,
      rules,
      assumptions,
      bavFunding,
      monthlyUserCost: etfMonthly,
      monthlyProductContribution: etfMonthly,
      monthlyEmployerContribution: 0,
      fees: { ...zeroFeeModel, annualAssetFee: assumptions.etf.annualAssetFee },
      taxMode: 'etf',
      partialExemption: assumptions.etf.equityPartialExemption,
      retirementYear: payoutYear,
    }),
    buildProductResult({
      productId: 'bav',
      label: 'bAV',
      scenario,
      profile,
      rules,
      assumptions,
      bavFunding,
      monthlyUserCost: bavFunding.monthlyNetCost,
      monthlyProductContribution:
        bavFunding.monthlyGrossConversion + bavFunding.monthlyEmployerContribution,
      monthlyEmployerContribution: bavFunding.monthlyEmployerContribution,
      fees: assumptions.bav.fees,
      taxMode: 'bav',
      retirementYear: payoutYear,
    }),
    buildProductResult({
      productId: 'versicherung',
      label: 'Private Versicherung',
      scenario,
      profile,
      rules,
      assumptions,
      bavFunding,
      monthlyUserCost: insuranceMonthly,
      monthlyProductContribution: insuranceMonthly,
      monthlyEmployerContribution: 0,
      fees: assumptions.insurance.fees,
      taxMode: insuranceTaxMode,
      retirementYear: payoutYear,
    }),
  ])

  return {
    bavFunding,
    products,
  }
}
