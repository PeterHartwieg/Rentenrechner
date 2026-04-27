import type {
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
  afterTaxInvestmentCapital,
  monthlyPayoutFromCapital,
  netBavPayout,
  netEtfPayout,
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
  taxMode: 'etf' | 'bav' | 'insurance-tax-free' | 'insurance-normal'
  partialExemption?: number
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
  })
  const payoutReturn = Math.max(0, params.scenario.annualReturn - params.fees.annualAssetFee)
  const grossMonthlyPayout = monthlyPayoutFromCapital(
    projection.capital,
    payoutReturn,
    payoutYears,
  )

  let afterTaxLumpSum: number | null = projection.capital
  let netMonthlyPayout = grossMonthlyPayout

  if (params.taxMode === 'etf') {
    const partialExemption = params.partialExemption ?? 0
    afterTaxLumpSum = afterTaxInvestmentCapital(
      projection.capital,
      projection.totalContributionsBeforeFees,
      params.rules,
      partialExemption,
    )
    netMonthlyPayout = netEtfPayout(
      grossMonthlyPayout,
      projection.capital,
      projection.totalContributionsBeforeFees,
      params.rules,
      partialExemption,
    )
  }

  if (params.taxMode === 'insurance-normal') {
    afterTaxLumpSum = afterTaxInvestmentCapital(
      projection.capital,
      projection.totalContributionsBeforeFees,
      params.rules,
      0,
    )
    netMonthlyPayout = netEtfPayout(
      grossMonthlyPayout,
      projection.capital,
      projection.totalContributionsBeforeFees,
      params.rules,
      0,
    )
  }

  if (params.taxMode === 'insurance-tax-free') {
    afterTaxLumpSum = projection.capital
    netMonthlyPayout = grossMonthlyPayout
  }

  if (params.taxMode === 'bav') {
    afterTaxLumpSum = null
    netMonthlyPayout = netBavPayout(grossMonthlyPayout, params.profile, params.rules)
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
      taxMode:
        assumptions.insurance.taxMode === 'steuerfrei'
          ? 'insurance-tax-free'
          : 'insurance-normal',
    }),
  ])

  return {
    bavFunding,
    products,
  }
}
