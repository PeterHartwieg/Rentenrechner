import type {
  FeeModel,
  GermanRules,
  ProductId,
  ReturnScenario,
  YearlyProjection,
} from '../domain'
import { monthlyRate } from './payoutMath'
import { calculateCapitalGainsTax } from './tax'

export interface AccumulationInput {
  productId: ProductId
  currentAge: number
  months: number
  monthlyUserCost: number
  monthlyProductContribution: number
  monthlyEmployerContribution: number
  annualReturn: number
  inflationRate: number
  scenario: ReturnScenario
  fees: FeeModel
  // When set, applies InvStG §18 Vorabpauschale each year and tracks the gross cumulative amount.
  etfVorabpauschale?: { rules: GermanRules; partialExemption: number }
  // When set, overrides annualReturn for each year (yearIndex = 0-based year).
  // Used for Standarddepot glidepath de-risking where the risk allocation changes over time.
  yearlyReturnFn?: (yearIndex: number) => number
  // #71: starting capital for products that begin with transferred capital (Riester → AVD).
  // When set, the accumulation loop begins from this balance instead of zero.
  initialCapital?: number
}

export interface AccumulationResult {
  capital: number
  realCapital: number
  totalUserCost: number
  totalProductContributions: number
  totalEmployerContributions: number
  totalFees: number
  totalContributionsBeforeFees: number
  cumulativeVorabpauschale: number
  rows: YearlyProjection[]
}

export function projectAccumulation(input: AccumulationInput): AccumulationResult {
  // (1-f)^(1/12): portion of capital retained after TER each month.
  const totalAssetFee = input.fees.wrapperAssetFee + input.fees.fundAssetFee
  const monthlyRetentionFactor = Math.pow(1 - totalAssetFee, 1 / 12)
  const acquisitionMonths = Math.max(1, input.fees.acquisitionCostSpreadYears * 12)
  const plannedContributions = input.monthlyProductContribution * input.months
  const monthlyAcquisitionCost =
    input.fees.acquisitionCostPct > 0
      ? (plannedContributions * input.fees.acquisitionCostPct) / acquisitionMonths
      : 0

  let capital = input.initialCapital ?? 0
  let totalUserCost = 0
  let totalProductContributions = 0
  let totalEmployerContributions = 0
  let totalFees = 0
  let feesInCurrentYear = 0
  let contributionsInCurrentYear = 0
  let balanceAtYearStart = 0
  let cumulativeVorabpauschale = 0
  // InvStG §18: contributions made during the year are prorated by remaining months.
  // Tracks sum(investedContribution × remainingMonthsInYear / 12) for current year.
  let vpAcquisitionBaseInYear = 0
  const rows: YearlyProjection[] = []

  // When yearlyReturnFn is set, the gross rate is recomputed at the start of each year.
  let currentMonthlyGrossRate = monthlyRate(input.annualReturn)

  for (let month = 1; month <= input.months; month += 1) {
    if (input.yearlyReturnFn && (month === 1 || month % 12 === 1)) {
      const yearIndex = Math.floor((month - 1) / 12)
      currentMonthlyGrossRate = monthlyRate(input.yearlyReturnFn(yearIndex))
    }

    const acquisitionCost = month <= acquisitionMonths ? monthlyAcquisitionCost : 0
    const contributionFee = input.monthlyProductContribution * input.fees.contributionFee
    const fixedFee = input.fees.fixedMonthlyFee
    const explicitFees = Math.min(
      input.monthlyProductContribution,
      contributionFee + fixedFee + acquisitionCost,
    )
    const investedContribution = Math.max(0, input.monthlyProductContribution - explicitFees)

    const capitalAfterGrowth = (capital + investedContribution) * (1 + currentMonthlyGrossRate)
    const assetFee = capitalAfterGrowth * (1 - monthlyRetentionFactor)
    capital = capitalAfterGrowth - assetFee

    const monthlyFees = explicitFees + assetFee
    totalUserCost += input.monthlyUserCost
    totalProductContributions += input.monthlyProductContribution
    totalEmployerContributions += input.monthlyEmployerContribution
    totalFees += monthlyFees
    feesInCurrentYear += monthlyFees
    contributionsInCurrentYear += input.monthlyProductContribution

    if (input.etfVorabpauschale) {
      const monthWithinYear = ((month - 1) % 12) + 1
      vpAcquisitionBaseInYear += (investedContribution * (13 - monthWithinYear)) / 12
    }

    if (month % 12 === 0 || month === input.months) {
      if (input.etfVorabpauschale) {
        const { rules, partialExemption } = input.etfVorabpauschale
        const annualGrowth = capital - balanceAtYearStart - contributionsInCurrentYear
        const basisertrag =
          (balanceAtYearStart + vpAcquisitionBaseInYear) * rules.capitalGains.basiszins * 0.7
        const vp = Math.max(0, Math.min(basisertrag, annualGrowth))
        const vpTax = calculateCapitalGainsTax(
          vp,
          rules,
          partialExemption,
          rules.capitalGains.saverAllowance,
        )
        capital -= vpTax
        cumulativeVorabpauschale += vp
      }

      const year = Math.ceil(month / 12)
      rows.push({
        year,
        age: input.currentAge + year,
        productId: input.productId,
        scenarioId: input.scenario.id,
        balance: capital,
        realBalance: capital / Math.pow(1 + input.inflationRate, year),
        yearlyUserCost: input.monthlyUserCost * 12,
        yearlyProductContribution: input.monthlyProductContribution * 12,
        yearlyEmployerContribution: input.monthlyEmployerContribution * 12,
        yearlyFees: feesInCurrentYear,
        cumulativeFees: totalFees,
        cumulativeProductContributions: totalProductContributions,
        cumulativeVorabpauschale,
      })
      balanceAtYearStart = capital
      feesInCurrentYear = 0
      contributionsInCurrentYear = 0
      vpAcquisitionBaseInYear = 0
    }
  }

  return {
    capital,
    realCapital: capital / Math.pow(1 + input.inflationRate, input.months / 12),
    totalUserCost,
    totalProductContributions,
    totalEmployerContributions,
    totalFees,
    totalContributionsBeforeFees: totalProductContributions,
    cumulativeVorabpauschale,
    rows,
  }
}
