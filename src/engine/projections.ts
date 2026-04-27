import type {
  EtfPayoutRow,
  FeeModel,
  GermanRules,
  InsuranceTaxMode,
  PersonalProfile,
  ProductId,
  ReturnScenario,
  YearlyProjection,
} from '../domain/types'
import { calculateCapitalGainsTax } from './tax'
import { careEmployeeRateForChildren } from './salary'
import { calculateRetirementTax } from './retirementTax'

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
  // When set, applies InvStG §18 Vorabpauschale each year and tracks the gross cumulative amount
  etfVorabpauschale?: { rules: GermanRules; partialExemption: number }
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

export function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1
}

export function projectAccumulation(input: AccumulationInput): AccumulationResult {
  const monthlyGrossRate = monthlyRate(input.annualReturn)
  // (1-f)^(1/12): portion of capital retained after TER each month
  const monthlyRetentionFactor = Math.pow(1 - input.fees.annualAssetFee, 1 / 12)
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
  let contributionsInCurrentYear = 0
  let balanceAtYearStart = 0
  let cumulativeVorabpauschale = 0
  // InvStG §18: contributions made during the year are prorated by remaining months.
  // Tracks sum(investedContribution × remainingMonthsInYear / 12) for current year.
  let vpAcquisitionBaseInYear = 0
  const rows: YearlyProjection[] = []

  for (let month = 1; month <= input.months; month += 1) {
    const acquisitionCost = month <= acquisitionMonths ? monthlyAcquisitionCost : 0
    const contributionFee = input.monthlyProductContribution * input.fees.contributionFee
    const fixedFee = input.fees.fixedMonthlyFee
    const explicitFees = Math.min(
      input.monthlyProductContribution,
      contributionFee + fixedFee + acquisitionCost,
    )
    const investedContribution = Math.max(0, input.monthlyProductContribution - explicitFees)

    // Apply gross return, then deduct TER from the resulting balance.
    // Mathematically identical to the old (1 + monthlyNetRate) combined rate,
    // but now the TER drag is visible as a separate tracked fee.
    const capitalAfterGrowth = (capital + investedContribution) * (1 + monthlyGrossRate)
    const assetFee = capitalAfterGrowth * (1 - monthlyRetentionFactor)
    capital = capitalAfterGrowth - assetFee

    const monthlyFees = explicitFees + assetFee
    totalUserCost += input.monthlyUserCost
    totalProductContributions += input.monthlyProductContribution
    totalEmployerContributions += input.monthlyEmployerContribution
    totalFees += monthlyFees
    feesInCurrentYear += monthlyFees
    contributionsInCurrentYear += input.monthlyProductContribution

    // Accumulate prorated VP acquisition base: weight = remaining months in calendar year / 12.
    // Month 1 of each year → weight 12/12; month 12 → weight 1/12.
    if (input.etfVorabpauschale) {
      const monthWithinYear = ((month - 1) % 12) + 1
      vpAcquisitionBaseInYear += investedContribution * (13 - monthWithinYear) / 12
    }

    if (month % 12 === 0 || month === input.months) {
      // InvStG §18 Vorabpauschale: annual tax event for accumulating ETF funds.
      // Opening balance gets full-year treatment; contributions are prorated by acquisition month.
      // Tax is deducted from capital; gross VP accumulates to reduce exit taxable gain (§19 InvStG).
      if (input.etfVorabpauschale) {
        const { rules, partialExemption } = input.etfVorabpauschale
        const annualGrowth = capital - balanceAtYearStart - contributionsInCurrentYear
        const basisertrag =
          (balanceAtYearStart + vpAcquisitionBaseInYear) * rules.capitalGains.basiszins * 0.7
        const vp = Math.max(0, Math.min(basisertrag, annualGrowth))
        const vpTax = calculateCapitalGainsTax(vp, rules, partialExemption, rules.capitalGains.saverAllowance)
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
  cumulativeVorabpauschale = 0,
): number {
  // Vorabpauschale already taxed during accumulation reduces remaining taxable gain at payout
  const untaxedGain = Math.max(0, capital - totalContributions - cumulativeVorabpauschale)
  const gainRatio = capital > 0 ? untaxedGain / capital : 0
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
  cumulativeVorabpauschale = 0,
): number {
  // Vorabpauschale already taxed during accumulation reduces the remaining taxable exit gain (§19 InvStG)
  const gain = Math.max(0, capital - totalContributions - cumulativeVorabpauschale)
  return capital - calculateCapitalGainsTax(gain, rules, partialExemption, 0)
}

// Year-by-year ETF payout schedule (#37). Tracks remaining capital, cost basis, and tax each year.
// grossMonthlyPayout must equal monthlyPayoutFromCapital(capitalAtRetirement, payoutReturn, payoutYears)
// so that capital depletes to ~0 at the end of the schedule.
// cumulativeVorabpauschale shifts the cost basis per §19 InvStG (already-taxed VP is not taxed again).
export function etfPayoutSchedule(
  capitalAtRetirement: number,
  totalContributions: number,
  cumulativeVorabpauschale: number,
  grossMonthlyPayout: number,
  payoutYears: number,
  payoutReturn: number,
  retirementAge: number,
  rules: GermanRules,
  partialExemption: number,
): EtfPayoutRow[] {
  if (capitalAtRetirement <= 0 || payoutYears <= 0) return []

  const annualWithdrawal = grossMonthlyPayout * 12
  let capital = capitalAtRetirement
  // VP already taxed during accumulation extends the cost basis — double-tax protection §19 InvStG
  let costBasis = Math.min(totalContributions + cumulativeVorabpauschale, capitalAtRetirement)

  // Annuity factor r/r_m aligns the yearly capital formula with monthlyPayoutFromCapital.
  // C_end = C_start*(1+r) − PMT*(r/r_m) depletes to 0 in exactly payoutYears years when
  // PMT = monthlyPayoutFromCapital(C0, r, payoutYears). Derivation: substituting r_m into the
  // monthly annuity formula collapses to the same recurrence. When return is 0, factor = 12.
  // For negative payoutReturn, r_m is negative too; r/r_m is still a positive ratio so the
  // recurrence correctly decays faster than straight-line drawdown.
  const r_m = Math.abs(payoutReturn) < 1e-9 ? 0 : monthlyRate(payoutReturn)
  const annuityFactor = Math.abs(r_m) < 1e-9 ? 12 : payoutReturn / r_m

  const rows: EtfPayoutRow[] = []

  for (let year = 1; year <= payoutYears; year++) {
    const capitalAtStart = Math.max(0, capital)
    const gainRatio = capitalAtStart > 0
      ? Math.max(0, (capitalAtStart - costBasis) / capitalAtStart)
      : 0
    const rawTaxableGain = annualWithdrawal * gainRatio
    const taxableAfterExemption = rawTaxableGain * (1 - partialExemption)
    const saverAllowanceUsed = Math.min(taxableAfterExemption, rules.capitalGains.saverAllowance)
    const taxDue = calculateCapitalGainsTax(
      rawTaxableGain,
      rules,
      partialExemption,
      rules.capitalGains.saverAllowance,
    )
    const netAnnualPayout = Math.max(0, annualWithdrawal - taxDue)

    // Cost basis shrinks proportionally to gross withdrawal vs. start-of-year capital
    const fractionWithdrawn = capitalAtStart > 0 ? Math.min(1, annualWithdrawal / capitalAtStart) : 0
    costBasis = Math.max(0, costBasis * (1 - fractionWithdrawn))
    // Exact year-end capital: C*(1+r) − PMT*(r/r_m) ensures depletion to 0 at year payoutYears.
    // Works for positive, zero, and negative payoutReturn because annuityFactor = r/r_m is always
    // a finite, positive ratio derived from the annuity formula (limit is 12 when r → 0).
    capital = Math.max(0, capitalAtStart * (1 + payoutReturn) - grossMonthlyPayout * annuityFactor)

    rows.push({
      year,
      age: retirementAge + year - 1,
      capitalAtStart,
      grossAnnualPayout: annualWithdrawal,
      taxableGain: rawTaxableGain,
      saverAllowanceUsed,
      taxDue,
      netAnnualPayout,
      netMonthlyPayout: netAnnualPayout / 12,
      capitalAtEnd: capital,
      remainingCostBasis: costBasis,
    })
  }

  return rows
}

// Derives the private-insurance tax treatment from the contract year, accumulation period, and retirement age.
// pre2005: §52 Abs. 28 EStG a.F. — payout is tax-free. Requires contractStartYear < 2005,
//   oldContractTaxFreeEligible = true (user-confirmed: ≥5 annual premiums, capital payout),
//   AND contractRuntimeYears ≥ 12.
// halbeinkuenfte: §20 Abs. 1 Nr. 6 EStG — ≥12-year contract, payout at age ≥62: only half the gain taxable at personal income tax rate.
// abgeltungsteuer: §20 Abs. 2 EStG — all other post-2004 contracts: full gain at 25% Abgeltungsteuer.
export function deriveInsuranceTaxMode(
  contractStartYear: number,
  contractRuntimeYears: number,
  retirementAge: number,
  oldContractTaxFreeEligible = true,
): InsuranceTaxMode {
  if (contractStartYear < 2005 && oldContractTaxFreeEligible && contractRuntimeYears >= 12) {
    return 'pre2005'
  }
  if (contractRuntimeYears >= 12 && retirementAge >= 62) return 'halbeinkuenfte'
  return 'abgeltungsteuer'
}

// Net monthly insurance payout after tax.
// Halbeinkünfteverfahren: only half the gain is taxable at the personal income tax rate (§20 Abs. 1 Nr. 6 EStG).
// Abgeltungsteuer: full gain taxed at 25% + Soli (§20 Abs. 2 EStG).
// pre2005: no tax.
// Routed through calculateRetirementTax so retirement deductions (Pauschbeträge, cohort allowances)
// are applied before computing the marginal rate. (#46)
export function netInsurancePayout(
  grossMonthlyPayout: number,
  capital: number,
  totalContributions: number,
  taxMode: InsuranceTaxMode,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  retirementYear = rules.year,
): number {
  const gainRatio = capital > 0 ? Math.max(0, capital - totalContributions) / capital : 0
  const annualGain = grossMonthlyPayout * 12 * gainRatio

  if (taxMode === 'pre2005') return grossMonthlyPayout

  // Build RetirementIncomeComponents with the gain and other income, then compare tax
  // with and without the insurance gain to get the marginal tax on the gain.
  const taxWithGain = calculateRetirementTax(
    {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: annualGain,
      privateInsuranceTaxMode: taxMode,
      otherTaxableAnnual: otherMonthlyIncome * 12,
      retirementYear,
    },
    rules,
    'single',
  )
  const taxWithoutGain = calculateRetirementTax(
    {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: taxMode,
      otherTaxableAnnual: otherMonthlyIncome * 12,
      retirementYear,
    },
    rules,
    'single',
  )
  const marginalTax = taxWithGain.totalTaxAnnual - taxWithoutGain.totalTaxAnnual
  return Math.max(0, grossMonthlyPayout - marginalTax / 12)
}

// After-tax lump-sum insurance capital.
// otherAnnualIncome is only used for the Halbeinkünfteverfahren marginal-tax calculation.
// Routed through calculateRetirementTax so retirement deductions (Pauschbeträge, cohort allowances)
// are applied consistently with the monthly-payout path. (#46)
export function afterTaxInsuranceLumpSum(
  capital: number,
  totalContributions: number,
  taxMode: InsuranceTaxMode,
  rules: GermanRules,
  otherAnnualIncome = 0,
  retirementYear = rules.year,
): number {
  const gain = Math.max(0, capital - totalContributions)

  if (taxMode === 'pre2005') return capital

  // Marginal-tax approach: tax(other + gain) − tax(other)
  const taxWithGain = calculateRetirementTax(
    {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: gain,
      privateInsuranceTaxMode: taxMode,
      otherTaxableAnnual: otherAnnualIncome,
      retirementYear,
    },
    rules,
    'single',
  )
  const taxWithoutGain = calculateRetirementTax(
    {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: taxMode,
      otherTaxableAnnual: otherAnnualIncome,
      retirementYear,
    },
    rules,
    'single',
  )
  const marginalTax = taxWithGain.totalTaxAnnual - taxWithoutGain.totalTaxAnnual
  return Math.max(0, capital - marginalTax)
}

// §229 SGB V 1/120: after-tax bAV lump sum payout.
// Income tax: §22 Nr. 5 EStG — full lump sum is taxable income.
//   §34 Abs. 2 Nr. 4 EStG Fünftelregelung applied (multi-year accumulation qualifies as extraordinary income).
//   The Fünftelregelung itself is unchanged (#48); only its internal tax computation is now routed
//   through calculateRetirementTax with bavIsLumpSum=true so retirement Pauschbeträge are applied. (#46)
//   Versorgungsfreibetrag is suppressed (bavIsLumpSum=true) because a one-time payout is NOT a
//   "laufender Versorgungsbezug" per §19 Abs. 2 EStG Satz 1.
// KV/PV: spread over 120 months per §229 SGB V.
//   KVdR (§226(2) SGB V): KV Freibetrag applies per month → max(0, lumpSum − threshold×120) × rate.
//   freiwillig (§240 SGB V): no Freibetrag → lumpSum × rate.
//   PV (§57(1) SGB XI): same threshold; full pvRate on lumpSum if monthlyBase > threshold, else 0.
// PKV members: no GKV/PV deductions.
export function afterTaxBavLumpSum(
  lumpSum: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherAnnualIncome = 0,
  kvdrMember = true,
  retirementYear = rules.year,
): number {
  if (lumpSum <= 0) return 0

  // Fünftelregelung §34 EStG: 5 × (tax(other + lumpSum/5) − tax(other)).
  // Both tax calls go through calculateRetirementTax with bavIsLumpSum=true so that:
  //   - retirement Pauschbeträge (Werbungskosten + Sonderausgaben) apply to the zvE, and
  //   - Versorgungsfreibetrag is suppressed (lump sum is not "laufend").
  // otherAnnualIncome is routed as otherTaxableAnnual (opaque other income context).
  const taxOnFuenftel = (bavFuenftel: number): number => {
    const bd = calculateRetirementTax(
      {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: bavFuenftel,
        bavIsLumpSum: true,      // suppress Versorgungsfreibetrag
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer', // irrelevant (gain=0)
        otherTaxableAnnual: otherAnnualIncome,
        retirementYear,
      },
      rules,
      'single',
    )
    return bd.einkommensteuer + bd.solidaritaetszuschlag
  }

  // Fünftelregelung: 5 × (T(otherIncome + lumpSum/5) − T(otherIncome))
  const incomeTax = Math.max(
    0,
    5 * (taxOnFuenftel(lumpSum / 5) - taxOnFuenftel(0)),
  )

  if (!profile.publicHealthInsurance) {
    return Math.max(0, lumpSum - incomeTax)
  }

  const additionalHealthRate = profile.healthAdditionalContributionPct / 100
  const healthRate = rules.socialSecurity.healthGeneralRate + additionalHealthRate
  const threshold = rules.socialSecurity.kvFreibetragVersorgungMonthly
  const monthlyBase = lumpSum / 120

  const kvBurden = kvdrMember
    ? Math.max(0, lumpSum - threshold * 120) * healthRate
    : lumpSum * healthRate

  const pvRate = careEmployeeRateForChildren(profile.children, rules) + rules.socialSecurity.careEmployerRate
  const pvBurden = monthlyBase > threshold ? lumpSum * pvRate : 0

  return Math.max(0, lumpSum - incomeTax - kvBurden - pvBurden)
}

// #6: marginal-tax approach — income tax on (bAV + other) minus tax on (other alone).
// When otherMonthlyIncome = 0 and bAV is below the basic allowance, result equals the simple formula.
// kvdrMember: true = KVdR (KV Freibetrag §226(2) SGB V); false = freiwillig versichert (no Freibetrag, §240 SGB V).
// PKV members: no GKV/PV deductions applied.
// Routed through calculateRetirementTax (#46) so Versorgungsfreibetrag, Werbungskosten-Pauschbeträge,
// and Sonderausgaben-Pauschbetrag are applied before computing the marginal rate.
// otherMonthlyIncome is treated as opaque other taxable income (otherTaxableAnnual) since the
// calculator does not yet model GRV separately. TODO #47: split into statutoryPension + other.
export function netBavPayout(
  grossMonthlyPayout: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  kvdrMember = true,
  retirementYear = rules.year,
): number {
  const bavAnnual = grossMonthlyPayout * 12
  const otherAnnual = otherMonthlyIncome * 12

  const taxWith = calculateRetirementTax(
    {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: bavAnnual,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer', // irrelevant (gain=0)
      otherTaxableAnnual: otherAnnual,
      retirementYear,
    },
    rules,
    'single',
  )
  const taxWithout = calculateRetirementTax(
    {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer', // irrelevant (gain=0)
      otherTaxableAnnual: otherAnnual,
      retirementYear,
    },
    rules,
    'single',
  )
  const marginalAnnualTax = taxWith.totalTaxAnnual - taxWithout.totalTaxAnnual

  if (!profile.publicHealthInsurance) {
    return Math.max(0, grossMonthlyPayout - marginalAnnualTax / 12)
  }

  const additionalHealthRate = profile.healthAdditionalContributionPct / 100
  const healthRate = rules.socialSecurity.healthGeneralRate + additionalHealthRate
  const threshold = rules.socialSecurity.kvFreibetragVersorgungMonthly
  // PV §57(1) SGB XI: Freigrenze applies for all GKV members. Versorgungsträger pays employer share in both KVdR and freiwillig.
  // = careEmployeeRateForChildren(children) + careEmployerRate == careRetirementChildlessRate for 0 children.
  const retirementCareRate =
    careEmployeeRateForChildren(profile.children, rules) + rules.socialSecurity.careEmployerRate
  const careMonthly = grossMonthlyPayout > threshold ? grossMonthlyPayout * retirementCareRate : 0

  let healthMonthly: number
  if (kvdrMember) {
    // KVdR: KV Freibetrag §226(2) SGB V — only the excess above the threshold is subject to GKV
    healthMonthly = Math.max(0, grossMonthlyPayout - threshold) * healthRate
  } else {
    // freiwillig versichert: KV on full amount §240 SGB V (no Freibetrag)
    healthMonthly = grossMonthlyPayout * healthRate
  }

  return Math.max(0, grossMonthlyPayout - marginalAnnualTax / 12 - healthMonthly - careMonthly)
}
