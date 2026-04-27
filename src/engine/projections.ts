import type {
  FeeModel,
  GermanRules,
  PersonalProfile,
  ProductId,
  ReturnScenario,
  YearlyProjection,
} from '../domain/types'
import { calculateCapitalGainsTax, calculateIncomeTax2026 } from './tax'

interface AccumulationInput {
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
}

export interface AccumulationResult {
  capital: number
  realCapital: number
  totalUserCost: number
  totalProductContributions: number
  totalEmployerContributions: number
  totalFees: number
  totalContributionsBeforeFees: number
  rows: YearlyProjection[]
}

function annualNetRate(annualReturn: number, annualAssetFee: number): number {
  return (1 + annualReturn) * (1 - annualAssetFee) - 1
}

export function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1
}

export function projectAccumulation(input: AccumulationInput): AccumulationResult {
  const monthlyNetRate = monthlyRate(annualNetRate(input.annualReturn, input.fees.annualAssetFee))
  const acquisitionMonths = Math.max(1, input.fees.acquisitionCostSpreadYears * 12)
  const plannedContributions = input.monthlyProductContribution * input.months
  const monthlyAcquisitionCost =
    input.fees.acquisitionCostPct > 0
      ? (plannedContributions * input.fees.acquisitionCostPct) / acquisitionMonths
      : 0

  let capital = 0
  let totalUserCost = 0
  let totalProductContributions = 0
  let totalEmployerContributions = 0
  let totalFees = 0
  let feesInCurrentYear = 0
  const rows: YearlyProjection[] = []

  for (let month = 1; month <= input.months; month += 1) {
    const acquisitionCost = month <= acquisitionMonths ? monthlyAcquisitionCost : 0
    const contributionFee = input.monthlyProductContribution * input.fees.contributionFee
    const fixedFee = input.fees.fixedMonthlyFee
    const fees = Math.min(
      input.monthlyProductContribution,
      contributionFee + fixedFee + acquisitionCost,
    )
    const investedContribution = Math.max(0, input.monthlyProductContribution - fees)

    capital = (capital + investedContribution) * (1 + monthlyNetRate)
    totalUserCost += input.monthlyUserCost
    totalProductContributions += input.monthlyProductContribution
    totalEmployerContributions += input.monthlyEmployerContribution
    totalFees += fees
    feesInCurrentYear += fees

    if (month % 12 === 0 || month === input.months) {
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
      })
      feesInCurrentYear = 0
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
    rows,
  }
}

export function monthlyPayoutFromCapital(
  capital: number,
  annualReturn: number,
  payoutYears: number,
): number {
  const months = Math.max(1, Math.round(payoutYears * 12))
  const rate = monthlyRate(Math.max(-0.99, annualReturn))

  if (Math.abs(rate) < 0.000001) {
    return capital / months
  }

  return (capital * rate) / (1 - Math.pow(1 + rate, -months))
}

export function netEtfPayout(
  grossMonthlyPayout: number,
  capital: number,
  totalContributions: number,
  rules: GermanRules,
  partialExemption: number,
): number {
  const gainRatio = capital > 0 ? Math.max(0, capital - totalContributions) / capital : 0
  const annualTaxableGain = grossMonthlyPayout * 12 * gainRatio
  const annualTax = calculateCapitalGainsTax(
    annualTaxableGain,
    rules,
    partialExemption,
    rules.capitalGains.saverAllowance,
  )

  return Math.max(0, grossMonthlyPayout - annualTax / 12)
}

export function afterTaxInvestmentCapital(
  capital: number,
  totalContributions: number,
  rules: GermanRules,
  partialExemption: number,
): number {
  const gain = Math.max(0, capital - totalContributions)
  return capital - calculateCapitalGainsTax(gain, rules, partialExemption)
}

export function netBavPayout(
  grossMonthlyPayout: number,
  profile: PersonalProfile,
  rules: GermanRules,
): number {
  const annualIncomeTax = calculateIncomeTax2026(grossMonthlyPayout * 12, rules)
  const additionalHealthRate = profile.healthAdditionalContributionPct / 100
  const healthRate = rules.socialSecurity.healthGeneralRate + additionalHealthRate
  const healthBaseMonthly = Math.max(
    0,
    grossMonthlyPayout - rules.socialSecurity.retirementHealthAllowanceMonthly,
  )
  const careBaseMonthly =
    grossMonthlyPayout > rules.socialSecurity.retirementHealthAllowanceMonthly
      ? grossMonthlyPayout
      : 0
  const healthMonthly = healthBaseMonthly * healthRate
  const careMonthly = careBaseMonthly * rules.socialSecurity.careRetirementChildlessRate

  return Math.max(0, grossMonthlyPayout - annualIncomeTax / 12 - healthMonthly - careMonthly)
}

export function afterTaxBavLumpSum(
  capital: number,
  profile: PersonalProfile,
  rules: GermanRules,
): number {
  const incomeTax = calculateIncomeTax2026(capital, rules)
  const additionalHealthRate = profile.healthAdditionalContributionPct / 100
  const healthRate = rules.socialSecurity.healthGeneralRate + additionalHealthRate
  const healthBase = Math.max(
    0,
    capital - rules.socialSecurity.retirementHealthAllowanceMonthly * 12,
  )
  const health = healthBase * healthRate
  const care =
    capital > rules.socialSecurity.retirementHealthAllowanceMonthly * 12
      ? capital * rules.socialSecurity.careRetirementChildlessRate
      : 0

  return Math.max(0, capital - incomeTax - health - care)
}
