import type {
  FeeModel,
  GermanRules,
  ProductId,
  ReturnScenario,
  YearlyProjection,
} from '../domain'
import { monthlyRate } from './payoutMath'
import { calculateCapitalGainsTax } from './tax'

/**
 * Pluggable accumulation behaviors. The base loop runs with monthly contributions,
 * a constant return, and a fee model; everything else (variable returns, ETF
 * Vorabpauschale tax accrual, transferred starting capital) is opt-in via this
 * policy. Future extensions (Monte Carlo return draws, contribution escalation)
 * plug in here without changing the base signature.
 */
export interface AccumulationPolicy {
  /** Per-year return override; replaces `annualReturn` for each year (yearIndex
   *  is 0-based). Used by the Standarddepot glidepath de-risking; Monte Carlo /
   *  variable-return policies will plug in here too. */
  yearlyReturn?: (yearIndex: number) => number
  /** Apply InvStG §18 Vorabpauschale each year-end: deduct §20 KapESt on the
   *  basisertrag (capped at the annual growth), and accrue the gross cumulative
   *  amount on each row so cost-basis carryover at exit can subtract it. */
  vorabpauschale?: { rules: GermanRules; partialExemption: number }
  /** Starting balance — used when capital transfers between products
   *  (#71 Riester → AVD per AltZertG transfer; paid-up insurance phase 2).
   *  Default 0. */
  initialCapital?: number
  /** Beitragsdynamik: each year's monthly user cost, product contribution and
   *  employer contribution scale by `(1 + annualRate)^yearIndex`. Total
   *  planned contributions used by `acquisitionCostPct` are expanded to the
   *  geometric sum so Abschlusskosten reflect the full contract horizon
   *  (Versicherungs-Beitragssumme convention). 0 / undefined = static. */
  contributionGrowth?: { annualRate: number }
}

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
  policy?: AccumulationPolicy
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
  const policy = input.policy
  const dynamicRate = policy?.contributionGrowth?.annualRate ?? 0
  const yearsTotal = input.months / 12
  // Geometric expansion of total planned contributions for Abschlusskosten
  // (Versicherungs-Beitragssumme convention: total premium summed over the
  // contract horizon with annual contribution growth applied). Falls back to
  // simple month-count multiplication when no Dynamik is configured.
  const plannedContributions =
    dynamicRate === 0 || Math.abs(dynamicRate) < 1e-12
      ? input.monthlyProductContribution * input.months
      : input.monthlyProductContribution * 12 *
        (Math.pow(1 + dynamicRate, yearsTotal) - 1) / dynamicRate
  const monthlyAcquisitionCost =
    input.fees.acquisitionCostPct > 0
      ? (plannedContributions * input.fees.acquisitionCostPct) / acquisitionMonths
      : 0

  let capital = policy?.initialCapital ?? 0
  let totalUserCost = 0
  let totalProductContributions = 0
  let totalEmployerContributions = 0
  let totalFees = 0
  let feesInCurrentYear = 0
  let contributionsInCurrentYear = 0
  let balanceAtYearStart = capital
  let cumulativeVorabpauschale = 0
  // InvStG §18: contributions made during the year are prorated by remaining months.
  // Tracks sum(investedContribution × remainingMonthsInYear / 12) for current year.
  let vpAcquisitionBaseInYear = 0
  const rows: YearlyProjection[] = []

  // When policy.yearlyReturn is set, the gross rate is recomputed at the start of each year.
  let currentMonthlyGrossRate = monthlyRate(input.annualReturn)
  // Beitragsdynamik scaling (1 + r)^yearIndex applied to every contribution at the
  // start of each year. yearIndex = 0 for the first year (no growth yet).
  let dynamicMul = 1
  let monthlyUserCost = input.monthlyUserCost
  let monthlyProductContribution = input.monthlyProductContribution
  let monthlyEmployerContribution = input.monthlyEmployerContribution

  for (let month = 1; month <= input.months; month += 1) {
    if (month > 1 && (month - 1) % 12 === 0) {
      if (dynamicRate !== 0) {
        dynamicMul *= 1 + dynamicRate
        monthlyUserCost = input.monthlyUserCost * dynamicMul
        monthlyProductContribution = input.monthlyProductContribution * dynamicMul
        monthlyEmployerContribution = input.monthlyEmployerContribution * dynamicMul
      }
    }

    if (policy?.yearlyReturn && (month === 1 || month % 12 === 1)) {
      const yearIndex = Math.floor((month - 1) / 12)
      currentMonthlyGrossRate = monthlyRate(policy.yearlyReturn(yearIndex))
    }

    const acquisitionCost = month <= acquisitionMonths ? monthlyAcquisitionCost : 0
    const contributionFee = monthlyProductContribution * input.fees.contributionFee
    const fixedFee = input.fees.fixedMonthlyFee
    const explicitFees = Math.min(
      monthlyProductContribution,
      contributionFee + fixedFee + acquisitionCost,
    )
    const investedContribution = Math.max(0, monthlyProductContribution - explicitFees)

    const capitalAfterGrowth = (capital + investedContribution) * (1 + currentMonthlyGrossRate)
    const assetFee = capitalAfterGrowth * (1 - monthlyRetentionFactor)
    capital = capitalAfterGrowth - assetFee

    const monthlyFees = explicitFees + assetFee
    totalUserCost += monthlyUserCost
    totalProductContributions += monthlyProductContribution
    totalEmployerContributions += monthlyEmployerContribution
    totalFees += monthlyFees
    feesInCurrentYear += monthlyFees
    contributionsInCurrentYear += monthlyProductContribution

    if (policy?.vorabpauschale) {
      const monthWithinYear = ((month - 1) % 12) + 1
      vpAcquisitionBaseInYear += (investedContribution * (13 - monthWithinYear)) / 12
    }

    if (month % 12 === 0 || month === input.months) {
      if (policy?.vorabpauschale) {
        const { rules, partialExemption } = policy.vorabpauschale
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
        yearlyUserCost: monthlyUserCost * 12,
        yearlyProductContribution: monthlyProductContribution * 12,
        yearlyEmployerContribution: monthlyEmployerContribution * 12,
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
