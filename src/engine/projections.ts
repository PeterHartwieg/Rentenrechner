import type {
  BavDurchfuehrungsweg,
  BavLumpSumTaxMode,
  EtfPayoutRow,
  FeeModel,
  GermanRules,
  InsuranceTaxMode,
  PayoutMode,
  PersonalProfile,
  ProductId,
  ReturnScenario,
  YearlyProjection,
} from '../domain'
import { calculateCapitalGainsTax } from './tax'
import { careEmployeeRateForChildren } from './salary'
import { calculateRetirementKvPv, calculateRetirementTax } from './retirementTax'
import { ertragsanteilByAge, legalConstants } from '../rules/legalConstants'

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

export function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1
}

export function projectAccumulation(input: AccumulationInput): AccumulationResult {
  // (1-f)^(1/12): portion of capital retained after TER each month
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
    // Recompute monthly rate at year boundaries when glidepath is active.
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

    // Apply gross return, then deduct TER from the resulting balance.
    // Mathematically identical to the old (1 + monthlyNetRate) combined rate,
    // but now the TER drag is visible as a separate tracked fee.
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

/**
 * Computes the gross monthly retirement payout based on the contractual payout mode (#54).
 *
 * - leibrente: gross = capital / 10 000 × rentenfaktor. The insurer takes the capital
 *   and pays a contractually fixed monthly amount for life. The calculator does not
 *   model death timing — payments are reported as a stable monthly figure regardless
 *   of the user's chosen `retirementEndAge`.
 * - zeitrente: capital depletes over `zeitrenteYears` (contractual fixed term).
 * - kapitalverzehr: capital depletes over the user-chosen `kapitalverzehrYears`
 *   (= retirementEndAge − retirementAge), modelled as a self-managed drawdown plan.
 */
export function computeGrossMonthlyPayout(
  capital: number,
  cfg: {
    mode: PayoutMode
    rentenfaktor: number
    zeitrenteYears: number
    kapitalverzehrYears: number
    payoutReturn: number
  },
): number {
  if (capital <= 0) return 0
  if (cfg.mode === 'leibrente') {
    return Math.max(0, (capital / 10_000) * cfg.rentenfaktor)
  }
  const years = cfg.mode === 'zeitrente' ? cfg.zeitrenteYears : cfg.kapitalverzehrYears
  if (years <= 0) return 0
  return monthlyPayoutFromCapital(capital, cfg.payoutReturn, years)
}

export function afterTaxInvestmentCapital(
  capital: number,
  totalContributions: number,
  rules: GermanRules,
  partialExemption: number,
  cumulativeVorabpauschale = 0,
): number {
  // Vorabpauschale already taxed during accumulation reduces the remaining taxable exit gain (§19 InvStG).
  // Sparer-Pauschbetrag applies in the liquidation year (EStG §20 Abs. 9), consistent with etfPayoutSchedule.
  const gain = Math.max(0, capital - totalContributions - cumulativeVorabpauschale)
  return capital - calculateCapitalGainsTax(gain, rules, partialExemption, rules.capitalGains.saverAllowance)
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
): 'pre2005' | 'halbeinkuenfte' | 'abgeltungsteuer' {
  const { pre2005YearBoundary, halbeinkuenfteMinRuntimeYears, halbeinkuenfteMinAge } = legalConstants.insurance
  if (
    contractStartYear < pre2005YearBoundary &&
    oldContractTaxFreeEligible &&
    contractRuntimeYears >= halbeinkuenfteMinRuntimeYears
  ) {
    return 'pre2005'
  }
  if (contractRuntimeYears >= halbeinkuenfteMinRuntimeYears && retirementAge >= halbeinkuenfteMinAge) {
    return 'halbeinkuenfte'
  }
  return 'abgeltungsteuer'
}

/**
 * Derives the income-tax mode for a bAV capital payout (Kapitalabfindung) from the
 * Durchführungsweg and (where relevant) the pre-2005 eligibility flag. (#48)
 *
 * Mapping:
 *
 * - direktversicherung_40b_alt + pre2005EligibleTaxFree=true
 *   → pre2005_steuerfrei
 *   Basis: §52 Abs. 28 EStG a.F. (qualifying old-law §40b contract: ≥12-year runtime,
 *   ≥5 annual premium payments, capital payout not annuity). Income-tax-free at the EStG
 *   level. KV/PV as Versorgungsbezug still applies per §229 Abs. 1 Satz 1 Nr. 5 SGB V.
 *
 * - direktversicherung_40b_alt + pre2005EligibleTaxFree=false
 *   → voll_versorgungsbezug
 *   The contract is §40b but the user has indicated the §52 Abs. 28 EStG a.F. conditions
 *   are not met (e.g. runtime < 12 years, payout as annuity, fewer than 5 premium years).
 *   Full marginal rate applies to the payout. Fünftelregelung §34 is not available for
 *   §40b contracts where the §52 a.F. steuerfrei conditions are not met.
 *
 * - direktzusage or unterstuetzungskasse
 *   → fuenftelregelung
 *   Basis: §34 Abs. 2 Nr. 4 EStG. Capital payments from Direktzusage and Unterstützungskasse
 *   are Versorgungsbezüge under §19 EStG. The payment qualifies as "Vergütung für mehrjährige
 *   Tätigkeit" (multi-year service), making §34 EStG Fünftelregelung available and typically
 *   applied.
 *
 * - all *_3_63 Durchführungswege
 *   → voll_versorgungsbezug
 *   Basis: §22 Nr. 5 Satz 1 EStG. Capital payouts from §3 Nr. 63 EStG contracts are taxable
 *   as Versorgungsbezüge at the full personal marginal rate. §34 Fünftelregelung does NOT
 *   apply: these payments are not "Vergütungen für mehrjährige Tätigkeit" per §34 Abs. 2
 *   Nr. 4 EStG because the tax benefit during accumulation (§3 Nr. 63 steuerfrei) distinguishes
 *   them from the §19 EStG Direktzusage/Unterstützungskasse context where Fünftelregelung
 *   historically applied (§22 Nr. 5 Satz 2 EStG explicitly excludes the §34 route for
 *   §3-Nr.-63 funded contracts). Confirmed by BFH X R 25/23 (2025-10-30): a §3 Nr. 63
 *   capital payout with a free capital option is not "Vergütung für mehrjährige Tätigkeit"
 *   within §34 EStG. See LEGAL_REVIEW.md §"bAV Lump-Sum Tax Routing (#48)".
 */
export function deriveBavLumpSumTaxMode(
  durchfuehrungsweg: BavDurchfuehrungsweg,
  pre2005EligibleTaxFree: boolean,
): BavLumpSumTaxMode {
  if (durchfuehrungsweg === 'direktversicherung_40b_alt') {
    return pre2005EligibleTaxFree ? 'pre2005_steuerfrei' : 'voll_versorgungsbezug'
  }
  if (durchfuehrungsweg === 'direktzusage' || durchfuehrungsweg === 'unterstuetzungskasse') {
    return 'fuenftelregelung'
  }
  // All *_3_63 Durchführungswege → full marginal rate (no Fünftelregelung)
  return 'voll_versorgungsbezug'
}

// Net monthly insurance payout after tax and KV/PV where applicable. (#46, #47, #59)
// For payoutMode === 'leibrente' (#59): §22 Nr. 1 Satz 3 a aa EStG Ertragsanteil method.
//   Taxable = grossMonthlyPayout × 12 × ertragsanteilByAge(retirementAge).
//   Applies regardless of contract era (even pre-2005 contracts pay Ertragsanteil on Leibrente).
// For other payout modes: gain-ratio method — capital-payout tax modes (halbeinkuenfte / abgeltungsteuer / pre2005).
//   Halbeinkünfteverfahren: only half the gain at the personal income tax rate (§20 Abs. 1 Nr. 6 EStG).
//   Abgeltungsteuer: full gain taxed at 25% + Soli (§20 Abs. 2 EStG).
//   pre2005: no income tax.
// Routed through calculateRetirementTax so retirement deductions (Pauschbeträge, cohort allowances)
// are applied before computing the marginal rate. (#46)
// KV/PV (#47): Private insurance payouts are NOT Versorgungsbezüge under §229 SGB V.
//   For KVdR-Pflichtversicherte: private insurance income does NOT trigger KV/PV.
//   For freiwillig Versicherte: §240 SGB V — all income up to BBG is subject to KV/PV.
//   PKV members: no KV/PV deductions.
export function netInsurancePayout(
  grossMonthlyPayout: number,
  capital: number,
  totalContributions: number,
  taxMode: InsuranceTaxMode,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  retirementYear = rules.year,
  profile?: PersonalProfile,
  kvdrMember = true,
  payoutMode?: PayoutMode,
  retirementAge?: number,
  /** Gross GRV monthly pension. Stacked into the marginal-tax base via
   *  statutoryPensionAnnual and into KV/PV (freiwillig path). */
  grvBaselineMonthly = 0,
): number {
  // #59: Leibrente → Ertragsanteil method (§22 EStG), ignoring capital-payout tax mode.
  let effectiveTaxMode: InsuranceTaxMode = taxMode
  let annualGain: number
  if (payoutMode === 'leibrente' && retirementAge !== undefined) {
    const ertragsanteil = ertragsanteilByAge(retirementAge)
    annualGain = grossMonthlyPayout * 12 * ertragsanteil
    effectiveTaxMode = 'ertragsanteil'
  } else {
    const gainRatio = capital > 0 ? Math.max(0, capital - totalContributions) / capital : 0
    annualGain = grossMonthlyPayout * 12 * gainRatio
  }

  // For pre-2005 capital payouts: no income tax (annualGain irrelevant for tax).
  // For Leibrente: always tax via Ertragsanteil even on pre-2005 contracts (effectiveTaxMode='ertragsanteil').
  if (effectiveTaxMode === 'pre2005') {
    if (!profile?.publicHealthInsurance || kvdrMember || !profile) {
      return grossMonthlyPayout
    }
    // freiwillig versichert: apply KV/PV below (marginalTax = 0 since pre2005)
  }

  let marginalTax = 0
  if (effectiveTaxMode !== 'pre2005') {
    const grvAnnual = grvBaselineMonthly * 12
    const taxWithGain = calculateRetirementTax(
      {
        statutoryPensionAnnual: grvAnnual,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: annualGain,
        privateInsuranceTaxMode: effectiveTaxMode,
        otherTaxableAnnual: otherMonthlyIncome * 12,
        retirementYear,
      },
      rules,
      'single',
    )
    const taxWithoutGain = calculateRetirementTax(
      {
        statutoryPensionAnnual: grvAnnual,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: effectiveTaxMode,
        otherTaxableAnnual: otherMonthlyIncome * 12,
        retirementYear,
      },
      rules,
      'single',
    )
    marginalTax = taxWithGain.totalTaxAnnual - taxWithoutGain.totalTaxAnnual
  }

  // KV/PV for freiwillig Versicherte only (#47).
  // Private insurance is NOT a Versorgungsbezug — pass as freiwilligOtherMonthlyIncome.
  let kvPvMonthly = 0
  if (profile?.publicHealthInsurance && !kvdrMember) {
    const additionalHealthRate = (profile.healthAdditionalContributionPct ?? 0) / 100
    const healthRate = rules.socialSecurity.healthGeneralRate + additionalHealthRate
    const retirementCareRate =
      careEmployeeRateForChildren(profile.childBirthYears, retirementYear, rules) + rules.socialSecurity.careEmployerRate
    const kvPv = calculateRetirementKvPv({
      bavMonthlyVersorgungsbezuege: 0,
      otherMonthlyVersorgungsbezuege: 0,
      monthlyStatutoryPension: otherMonthlyIncome + grvBaselineMonthly,
      freiwilligOtherMonthlyIncome: grossMonthlyPayout,
      isFreiwilligVersichert: true,
      kvFreibetragVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
      pvFreigrenzeVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
      monthlyKvPvBbg: rules.socialSecurity.healthAndCareCapMonth,
      healthRate,
      careRate: retirementCareRate,
    })
    kvPvMonthly = kvPv.freiwilligOtherKvMonthly + kvPv.freiwilligOtherPvMonthly
  }

  return Math.max(0, grossMonthlyPayout - marginalTax / 12 - kvPvMonthly)
}

// After-tax lump-sum insurance capital. (#46, #47)
// otherAnnualIncome is only used for the Halbeinkünfteverfahren marginal-tax calculation.
// Routed through calculateRetirementTax so retirement deductions (Pauschbeträge, cohort allowances)
// are applied consistently with the monthly-payout path. (#46)
// KV/PV (#47): For KVdR-Pflichtversicherte, private insurance lump sums do NOT trigger KV/PV.
//   For freiwillig Versicherte (§240 SGB V), the lump sum IS subject to KV/PV up to the BBG.
//   Simplified: the full lump sum is treated as received in a single period (no spreading for
//   lump-sum insurance — unlike the bAV 1/120 rule which is statutory). The BBG cap is applied
//   assuming the lump sum is income in the payout month alongside otherMonthlyIncome context.
//   PKV members: no KV/PV. Profile is optional for backwards compatibility.
export function afterTaxInsuranceLumpSum(
  capital: number,
  totalContributions: number,
  taxMode: InsuranceTaxMode,
  rules: GermanRules,
  otherAnnualIncome = 0,
  retirementYear = rules.year,
  profile?: PersonalProfile,
  kvdrMember = true,
  /** Gross GRV monthly pension. Stacked into both income-tax and KV/PV bases. */
  grvBaselineMonthly = 0,
): number {
  const gain = Math.max(0, capital - totalContributions)
  const grvAnnual = grvBaselineMonthly * 12

  if (taxMode === 'pre2005') {
    // pre2005: no income tax. KV/PV may still apply for freiwillig versichert.
    // For lump sum: treat as one-time payment (no 1/120 spreading for non-bAV insurance).
    // In practice freiwillig versichert KV/PV on a large lump sum would be capped at BBG.
    // Fall through to KV/PV block with zero marginalTax.
    if (!profile?.publicHealthInsurance || kvdrMember || !profile) return capital
    // freiwillig versichert: apply KV/PV below (marginalTax = 0)
  }

  let marginalTax = 0
  if (taxMode !== 'pre2005') {
    // Marginal-tax approach: tax(other + gain) − tax(other)
    const taxWithGain = calculateRetirementTax(
      {
        statutoryPensionAnnual: grvAnnual,
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
        statutoryPensionAnnual: grvAnnual,
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
    marginalTax = taxWithGain.totalTaxAnnual - taxWithoutGain.totalTaxAnnual
  }

  // KV/PV for freiwillig Versicherte (#47): private insurance is not a Versorgungsbezug.
  // For freiwillig: §240 SGB V applies — lump sum income subject to KV/PV up to BBG.
  // We apply the rate to the lump sum in the context of one month (BBG cap applies).
  // Note: for lump sums there is no 1/120 statutory spreading for non-bAV private insurance.
  // Using the monthly BBG implies the KV/PV is capped per-month of receipt. Practical
  // simplification: treat the lump sum as received in one month, capped at BBG.
  let kvPvBurden = 0
  if (profile?.publicHealthInsurance && !kvdrMember) {
    const additionalHealthRate = (profile.healthAdditionalContributionPct ?? 0) / 100
    const healthRate = rules.socialSecurity.healthGeneralRate + additionalHealthRate
    const retirementCareRate =
      careEmployeeRateForChildren(profile.childBirthYears, retirementYear, rules) + rules.socialSecurity.careEmployerRate
    const otherMonthlyIncome = otherAnnualIncome / 12
    // For lump sum: use the full lump sum as monthly income (it's a one-off event).
    // The BBG cap in calculateRetirementKvPv limits the deduction.
    const kvPv = calculateRetirementKvPv({
      bavMonthlyVersorgungsbezuege: 0,
      otherMonthlyVersorgungsbezuege: 0,
      monthlyStatutoryPension: otherMonthlyIncome + grvBaselineMonthly,
      freiwilligOtherMonthlyIncome: capital,
      isFreiwilligVersichert: true,
      kvFreibetragVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
      pvFreigrenzeVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
      monthlyKvPvBbg: rules.socialSecurity.healthAndCareCapMonth,
      healthRate,
      careRate: retirementCareRate,
    })
    kvPvBurden = kvPv.freiwilligOtherKvMonthly + kvPv.freiwilligOtherPvMonthly
  }

  return Math.max(0, capital - marginalTax - kvPvBurden)
}

/**
 * §229 SGB V 1/120: after-tax bAV capital payout (Kapitalabfindung). (#6, #19, #46, #47, #48)
 *
 * Income tax routing is determined by `taxMode` (derived via `deriveBavLumpSumTaxMode`):
 *
 * a. pre2005_steuerfrei (§40b EStG a.F. + §52 Abs. 28 EStG a.F. eligible):
 *    Income tax = 0. The lump sum is steuerfrei for EStG purposes.
 *    KV/PV via §229 Abs. 1 Satz 3 SGB V (1/120 rule) still applies because §40b contracts
 *    are Versorgungsbezüge under §229 Abs. 1 Satz 1 Nr. 5 SGB V regardless of EStG treatment.
 *
 * b. fuenftelregelung (§34 Abs. 2 Nr. 4 EStG — Direktzusage / Unterstützungskasse):
 *    5 × (tax(other + lumpSum/5) − tax(other)), routed through calculateRetirementTax with
 *    bavIsLumpSum=true (suppresses Versorgungsfreibetrag for one-time payouts).
 *    KV/PV via §229 Abs. 1 Satz 3 SGB V (1/120 rule).
 *
 * c. voll_versorgungsbezug (§22 Nr. 5 EStG — all §3 Nr. 63 Durchführungswege):
 *    Full marginal-rate computation: tax(other + lumpSum) − tax(other), routed through
 *    calculateRetirementTax with bavIsLumpSum=true (suppresses Versorgungsfreibetrag).
 *    KV/PV via §229 Abs. 1 Satz 3 SGB V (1/120 rule).
 *
 * KV/PV (all modes): Spread over 120 months per §229 Abs. 1 Satz 3 SGB V.
 *   Each of the 120 months is evaluated via calculateRetirementKvPv:
 *   - bavMonthlyVersorgungsbezuege = lumpSum / 120
 *   - monthlyStatutoryPension = otherAnnualIncome / 12 (treated as GRV — most common scenario)
 *   KVdR: Freibetrag applies per-month to the 1/120 base. freiwillig: no Freibetrag.
 *   PV Freigrenze applies per-month to the 1/120 base.
 *   BBG cap evaluated per-month across the aggregate income context.
 *   Total KV/PV = 120 × per-month deduction on the bAV portion alone.
 * PKV members: no GKV/PV deductions.
 */
export function afterTaxBavLumpSum(
  lumpSum: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherAnnualIncome = 0,
  kvdrMember = true,
  retirementYear = rules.year,
  taxMode: BavLumpSumTaxMode = 'fuenftelregelung',
  /** Gross GRV monthly pension. Stacked into both income-tax and KV/PV bases. */
  grvBaselineMonthly = 0,
): number {
  if (lumpSum <= 0) return 0

  const grvAnnual = grvBaselineMonthly * 12

  // -------------------------------------------------------------------------
  // Income tax based on taxMode
  // -------------------------------------------------------------------------
  let incomeTax: number

  if (taxMode === 'pre2005_steuerfrei') {
    // §52 Abs. 28 EStG a.F.: qualifying §40b contract — no income tax.
    incomeTax = 0

  } else if (taxMode === 'fuenftelregelung') {
    // §34 Abs. 2 Nr. 4 EStG Fünftelregelung: 5 × (T(other + lumpSum/5) − T(other)).
    const taxOnFuenftel = (bavFuenftel: number): number => {
      const bd = calculateRetirementTax(
        {
          statutoryPensionAnnual: grvAnnual,
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
    const fuenftel = legalConstants.bav.fuenftelregelungDivisor
    incomeTax = Math.max(0, fuenftel * (taxOnFuenftel(lumpSum / fuenftel) - taxOnFuenftel(0)))

  } else {
    // voll_versorgungsbezug: §22 Nr. 5 EStG — full marginal rate in the payout year.
    const taxWith = calculateRetirementTax(
      {
        statutoryPensionAnnual: grvAnnual,
        bavPensionAnnual: otherAnnualIncome + lumpSum,
        bavIsLumpSum: true,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer', // irrelevant
        otherTaxableAnnual: 0,
        retirementYear,
      },
      rules,
      'single',
    )
    const taxWithout = calculateRetirementTax(
      {
        statutoryPensionAnnual: grvAnnual,
        bavPensionAnnual: otherAnnualIncome,
        bavIsLumpSum: true,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer', // irrelevant
        otherTaxableAnnual: 0,
        retirementYear,
      },
      rules,
      'single',
    )
    incomeTax = Math.max(0, taxWith.totalTaxAnnual - taxWithout.totalTaxAnnual)
  }

  if (!profile.publicHealthInsurance) {
    return Math.max(0, lumpSum - incomeTax)
  }

  // -------------------------------------------------------------------------
  // KV/PV via §229 Abs. 1 Satz 3 SGB V: 1/120 monthly base, evaluated 120 times.
  // Note: applies to ALL taxModes (including pre2005_steuerfrei) because §40b contracts
  // are Versorgungsbezüge under §229 Abs. 1 Satz 1 Nr. 5 SGB V regardless of EStG treatment.
  // -------------------------------------------------------------------------
  const spreadingMonths = legalConstants.bav.versorgungsbezugSpreadingMonths
  const additionalHealthRate = profile.healthAdditionalContributionPct / 100
  const healthRate = rules.socialSecurity.healthGeneralRate + additionalHealthRate
  const careRate = careEmployeeRateForChildren(profile.childBirthYears, retirementYear, rules) + rules.socialSecurity.careEmployerRate
  const monthlyBase = lumpSum / spreadingMonths
  const monthlyOtherIncome = otherAnnualIncome / 12

  const kvPv = calculateRetirementKvPv({
    bavMonthlyVersorgungsbezuege: monthlyBase,
    otherMonthlyVersorgungsbezuege: 0,
    monthlyStatutoryPension: monthlyOtherIncome + grvBaselineMonthly,
    freiwilligOtherMonthlyIncome: 0,
    isFreiwilligVersichert: !kvdrMember,
    kvFreibetragVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
    pvFreigrenzeVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
    monthlyKvPvBbg: rules.socialSecurity.healthAndCareCapMonth,
    healthRate,
    careRate,
  })

  // Total KV/PV over the spreading period = spreadingMonths × per-month deduction on the bAV portion alone.
  const kvBurden = kvPv.bavKvMonthly * spreadingMonths
  const pvBurden = kvPv.bavPvMonthly * spreadingMonths

  return Math.max(0, lumpSum - incomeTax - kvBurden - pvBurden)
}

// #6/#47: marginal-tax approach — income tax on (bAV + other) minus tax on (other alone).
// When otherMonthlyIncome = 0 and bAV is below the basic allowance, result equals the simple formula.
// kvdrMember: true = KVdR (KV Freibetrag §226(2) SGB V); false = freiwillig versichert (no Freibetrag, §240 SGB V).
// PKV members: no GKV/PV deductions applied.
// Routed through calculateRetirementTax (#46) so Versorgungsfreibetrag, Werbungskosten-Pauschbeträge,
// and Sonderausgaben-Pauschbetrag are applied before computing the marginal rate.
// otherMonthlyIncome is treated as monthlyStatutoryPension in the KV/PV context (#47) — the most
// common scenario (the user's "other income" is their GRV pension). Income-tax context still routes
// it as otherTaxableAnnual for simplicity. See LEGAL_REVIEW.md for this documented simplification.
// KV/PV now computed via calculateRetirementKvPv to apply the monthly BBG cap across all income sources (#47).
export function netBavPayout(
  grossMonthlyPayout: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  kvdrMember = true,
  retirementYear = rules.year,
  /** Gross GRV monthly pension. Stacked into the marginal-tax base via
   *  statutoryPensionAnnual (Besteuerungsanteil applied) and into KV/PV. */
  grvBaselineMonthly = 0,
): number {
  const bavAnnual = grossMonthlyPayout * 12
  const otherAnnual = otherMonthlyIncome * 12
  const grvAnnual = grvBaselineMonthly * 12

  const taxWith = calculateRetirementTax(
    {
      statutoryPensionAnnual: grvAnnual,
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
      statutoryPensionAnnual: grvAnnual,
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
  // PV §57(1) SGB XI: Freigrenze applies for all GKV members. Versorgungsträger pays employer share in both KVdR and freiwillig.
  // §55 Abs. 3a SGB XI: only children under 25 at retirementYear qualify for the Beitragsabschlag.
  const retirementCareRate =
    careEmployeeRateForChildren(profile.childBirthYears, retirementYear, rules) + rules.socialSecurity.careEmployerRate

  // KV/PV via calculateRetirementKvPv: applies BBG cap across all income sources (#47).
  // GRV pension + user's manual otherMonthlyIncome both flow into the §249a SGB V
  // half-rate base via monthlyStatutoryPension.
  const kvPv = calculateRetirementKvPv({
    bavMonthlyVersorgungsbezuege: grossMonthlyPayout,
    otherMonthlyVersorgungsbezuege: 0,
    monthlyStatutoryPension: otherMonthlyIncome + grvBaselineMonthly,
    freiwilligOtherMonthlyIncome: 0,
    isFreiwilligVersichert: !kvdrMember,
    kvFreibetragVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
    pvFreigrenzeVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
    monthlyKvPvBbg: rules.socialSecurity.healthAndCareCapMonth,
    healthRate,
    careRate: retirementCareRate,
  })

  return Math.max(0, grossMonthlyPayout - marginalAnnualTax / 12 - kvPv.bavKvMonthly - kvPv.bavPvMonthly)
}
