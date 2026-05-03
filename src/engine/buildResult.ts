import type {
  BaseProductResult,
  FeeModel,
  GermanRules,
  PersonalProfile,
  ProductId,
  ReturnScenario,
  ScenarioAssumptions,
} from '../domain'
import { projectAccumulation, type AccumulationPolicy } from './accumulation'
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
  /** undefined = lifelong (Leibrente). See BaseProductResult.payoutEndAge. */
  payoutEndAge?: number
  lumpSumDeductions?: { incomeTax: number; kvPv: number }
}

/**
 * Accumulation policy at the buildResult layer. Mirrors `AccumulationPolicy` but
 * `vorabpauschale` omits `rules` — buildResult injects them from `params.rules`
 * so callers don't repeat the year-locked rule object.
 */
export interface BuildProductPolicy {
  yearlyReturn?: (yearIndex: number) => number
  vorabpauschale?: { partialExemption: number }
  initialCapital?: number
  contributionGrowth?: { annualRate: number }
  /** Issue 15 — TransferEvent inbound capital injections. See `AccumulationPolicy`. */
  capitalInjections?: { year: number; amount: number }[]
  /** Issue 15 — TransferEvent outbound capital withdrawals. See `AccumulationPolicy`. */
  capitalWithdrawals?: { year: number; amount: number }[]
  /** Issue 15 — Cost-basis bumps for surrender_reinvest into ETF target. */
  costBasisInjections?: { year: number; amount: number }[]
}

export interface BuildProductGuarantee {
  label: string
  floorCapital: (projection: ProjectionResult) => number
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
  policy?: BuildProductPolicy
  guarantee?: BuildProductGuarantee
  buildPayout: (context: ProductPayoutContext) => TPayoutFields
}

function capitalMultipleAnnualized(finalValue: number, totalUserCost: number, years: number): number {
  if (finalValue <= 0 || totalUserCost <= 0 || years <= 0) {
    return 0
  }
  return Math.pow(finalValue / totalUserCost, 1 / years) - 1
}

function applyCapitalGuarantee(
  projection: ProjectionResult,
  guaranteeFloor: number,
  inflationRate: number,
): ProjectionResult {
  if (guaranteeFloor <= projection.capital) return projection

  const rows = projection.rows.slice()
  const lastRow = rows[rows.length - 1]
  if (lastRow) {
    rows[rows.length - 1] = {
      ...lastRow,
      balance: guaranteeFloor,
      realBalance: guaranteeFloor / Math.pow(1 + inflationRate, lastRow.year),
    }
  }

  return {
    ...projection,
    capital: guaranteeFloor,
    realCapital: guaranteeFloor / Math.pow(1 + inflationRate, projection.rows.length),
    rows,
  }
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
  const accumulationPolicy: AccumulationPolicy | undefined = params.policy
    ? {
        yearlyReturn: params.policy.yearlyReturn,
        vorabpauschale: params.policy.vorabpauschale
          ? { rules: params.rules, partialExemption: params.policy.vorabpauschale.partialExemption }
          : undefined,
        initialCapital: params.policy.initialCapital,
        contributionGrowth: params.policy.contributionGrowth,
        capitalInjections: params.policy.capitalInjections,
        capitalWithdrawals: params.policy.capitalWithdrawals,
        costBasisInjections: params.policy.costBasisInjections,
      }
    : undefined
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
    policy: accumulationPolicy,
  })
  const rawCapitalAtRetirement = projection.capital
  const guaranteeFloor =
    params.guarantee
      ? Math.max(0, params.guarantee.floorCapital(projection))
      : undefined
  const effectiveProjection =
    guaranteeFloor !== undefined
      ? applyCapitalGuarantee(projection, guaranteeFloor, params.assumptions.inflationRate)
      : projection
  const guaranteeApplied =
    guaranteeFloor !== undefined && effectiveProjection.capital > rawCapitalAtRetirement
  const totalAssetFee = params.fees.wrapperAssetFee + params.fees.fundAssetFee
  const payoutReturn = params.scenario.annualReturn - totalAssetFee
  const payout = params.buildPayout({
    projection: effectiveProjection,
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
    totalUserCost: effectiveProjection.totalUserCost,
    totalProductContributions: effectiveProjection.totalProductContributions,
    totalEmployerContributions: effectiveProjection.totalEmployerContributions,
    totalFees: effectiveProjection.totalFees,
    capitalAtRetirement: effectiveProjection.capital,
    rawCapitalAtRetirement: params.guarantee ? rawCapitalAtRetirement : undefined,
    guaranteeFloorAtRetirement: guaranteeFloor,
    guaranteeLabel: params.guarantee?.label,
    guaranteeApplied,
    realCapitalAtRetirement: effectiveProjection.realCapital,
    taxAndSvSavings: params.taxAndSvSavings ?? 0,
    valueMultipleOnUserCost:
      effectiveProjection.totalUserCost > 0 && payout.afterTaxLumpSum !== null
        ? payout.afterTaxLumpSum / effectiveProjection.totalUserCost
        : null,
    capitalMultipleAnnualized:
      payout.afterTaxLumpSum !== null
        ? capitalMultipleAnnualized(payout.afterTaxLumpSum, effectiveProjection.totalUserCost, yearsToRetirement)
        : 0,
    accumulationRiy: computeRIY(
      params.monthlyProductContribution,
      monthsToRetirement,
      params.scenario.annualReturn,
      effectiveProjection.capital,
    ),
    rows: effectiveProjection.rows,
    ...payout,
  }
}
