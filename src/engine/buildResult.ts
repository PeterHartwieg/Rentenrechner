import type {
  BaseProductResult,
  FeeModel,
  GermanRules,
  PersonalProfile,
  ProductId,
  ReturnScenario,
  ScenarioAssumptions,
} from '../domain'
import {
  projectAccumulation,
} from './projections'
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

type ProjectionResult = ReturnType<typeof projectAccumulation>

export interface ProductPayoutContext {
  projection: ProjectionResult
  yearsToRetirement: number
  monthsToRetirement: number
  payoutYears: number
  payoutReturn: number
}

export interface ProductPayoutFields {
  afterTaxLumpSum: number | null
  grossMonthlyPayout: number
  netMonthlyPayout: number
  leibrenteBreakEvenAge?: number
  lumpSumDeductions?: { incomeTax: number; kvPv: number }
}

export interface BuildProductResultParams<
  TProductId extends ProductId,
  TPayoutFields extends ProductPayoutFields,
> {
  productId: TProductId
  label: string
  scenario: ReturnScenario
  profile: PersonalProfile
  rules: GermanRules
  assumptions: ScenarioAssumptions
  monthlyUserCost: number
  monthlyProductContribution: number
  monthlyEmployerContribution: number
  fees: FeeModel
  taxAndSvSavings?: number
  initialCapital?: number
  etfVorabpauschale?: {
    partialExemption: number
  }
  yearlyReturnFn?: (yearIndex: number) => number
  buildPayout: (context: ProductPayoutContext) => TPayoutFields
}

function capitalMultipleAnnualized(finalValue: number, totalUserCost: number, years: number): number {
  if (finalValue <= 0 || totalUserCost <= 0 || years <= 0) {
    return 0
  }
  return Math.pow(finalValue / totalUserCost, 1 / years) - 1
}

export function applyPensionPayoutFee(grossMonthlyPayout: number, fees: FeeModel): number {
  return fees.pensionPayoutFeePct > 0
    ? grossMonthlyPayout * (1 - fees.pensionPayoutFeePct)
    : grossMonthlyPayout
}

export function calculateLeibrenteBreakEvenAge(
  retirementAge: number,
  capital: number,
  grossMonthlyPayout: number,
  enabled: boolean,
): number | undefined {
  return enabled && grossMonthlyPayout > 0
    ? retirementAge + capital / (grossMonthlyPayout * 12)
    : undefined
}

export function buildProductResult<
  TPayoutFields extends ProductPayoutFields,
>(
  params: BuildProductResultParams<'etf', TPayoutFields>,
): BaseProductResult & { productId: 'etf' } & TPayoutFields
export function buildProductResult<
  TPayoutFields extends ProductPayoutFields,
>(
  params: BuildProductResultParams<'bav', TPayoutFields>,
): BaseProductResult & { productId: 'bav' } & TPayoutFields
export function buildProductResult<
  TPayoutFields extends ProductPayoutFields,
>(
  params: BuildProductResultParams<'versicherung', TPayoutFields>,
): BaseProductResult & { productId: 'versicherung' } & TPayoutFields
export function buildProductResult<
  TPayoutFields extends ProductPayoutFields,
>(
  params: BuildProductResultParams<'basisrente', TPayoutFields>,
): BaseProductResult & { productId: 'basisrente' } & TPayoutFields
export function buildProductResult<
  TPayoutFields extends ProductPayoutFields,
>(
  params: BuildProductResultParams<'altersvorsorgedepot', TPayoutFields>,
): BaseProductResult & { productId: 'altersvorsorgedepot' } & TPayoutFields
export function buildProductResult<
  TPayoutFields extends ProductPayoutFields,
>(
  params: BuildProductResultParams<'riester', TPayoutFields>,
): BaseProductResult & { productId: 'riester' } & TPayoutFields
export function buildProductResult<
  TProductId extends ProductId,
  TPayoutFields extends ProductPayoutFields,
>(
  params: BuildProductResultParams<TProductId, TPayoutFields>,
): BaseProductResult & { productId: TProductId } & TPayoutFields {
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
    etfVorabpauschale: params.etfVorabpauschale
      ? { rules: params.rules, partialExemption: params.etfVorabpauschale.partialExemption }
      : undefined,
    yearlyReturnFn: params.yearlyReturnFn,
    initialCapital: params.initialCapital,
  })
  const totalAssetFee = params.fees.wrapperAssetFee + params.fees.fundAssetFee
  const payoutReturn = params.scenario.annualReturn - totalAssetFee
  const payout = params.buildPayout({
    projection,
    yearsToRetirement,
    monthsToRetirement,
    payoutYears,
    payoutReturn,
  })

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
    taxAndSvSavings: params.taxAndSvSavings ?? 0,
    valueMultipleOnUserCost:
      projection.totalUserCost > 0 && payout.afterTaxLumpSum !== null
        ? payout.afterTaxLumpSum / projection.totalUserCost
        : null,
    capitalMultipleAnnualized:
      payout.afterTaxLumpSum !== null
        ? capitalMultipleAnnualized(payout.afterTaxLumpSum, projection.totalUserCost, yearsToRetirement)
        : 0,
    accumulationRiy: computeRIY(
      params.monthlyProductContribution,
      monthsToRetirement,
      params.scenario.annualReturn,
      projection.capital,
    ),
    rows: projection.rows,
    ...payout,
  }
}
