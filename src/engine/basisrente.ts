/**
 * Basisrente / Rürup-Rente engine (#61).
 *
 * Basisrente is a Schicht-1 certified old-age pension product (§10 Abs. 1 Nr. 2 EStG).
 * Key characteristics:
 * - Contributions are deductible as Sonderausgaben up to the shared Schicht-1 cap
 *   (§10 Abs. 3 EStG). The cap is reduced by total GRV contributions (employee + employer).
 * - Payouts are taxed by the same §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil cohort
 *   table as GRV statutory pensions.
 * - Only lifelong annuity (Leibrente) or fixed-term annuity (Zeitrente) permitted;
 *   full capital payout (Kapitalabfindung) is prohibited by certification rules.
 * - No inheritance payout in the base form; capital is not available before age 62.
 *
 * KV/PV simplification (documented):
 *   Basisrente payouts are NOT Versorgungsbezüge under §229 SGB V. They are therefore
 *   assessed at the full health rate (no §249a SGB V half-rate) and without the
 *   §226 Abs. 2 SGB V KV-Freibetrag. This module uses the freiwillig-versichert
 *   §240 SGB V path regardless of the user's actual GKV status in retirement — the
 *   most common case for Rürup holders (self-employed). See LEGAL_REVIEW.md.
 *
 * Schicht-1 cap:
 *   Total counted = GRV employee contributions + GRV employer contributions + Basisrente.
 *   (§10 Abs. 3 Satz 2 Nr. 1 EStG: steuerfreie Arbeitgeberanteile count toward the cap.)
 *   Deductible = min(basisrenteAnnual, max(0, schicht1Cap - grvTotal)) × deductibleFraction.
 *   Tax saving = income tax at salary zvE minus income tax at (zvE - deductible).
 */

import type {
  BasisrenteFundingResult,
  BasisrenteAssumptions,
  GermanRules,
  PersonalProfile,
  SalaryResult,
} from '../domain'
import { besteuerungsanteilGrv } from '../rules/de2026'
import { careEmployeeRateForChildren } from './salary'
import { calculateRetirementTax } from './retirementTax'
import { calculateIncomeTax2026, calculateSolidarityTax } from './tax'

/**
 * Computes the §10 Abs. 3 EStG Schicht-1 deduction and resulting tax saving.
 *
 * @param rules        - Year-specific German rules (Schicht-1 cap, tax rates)
 * @param salaryResult - Salary calculation result (provides the salary-phase zvE and GRV amounts)
 * @param basisrente   - Basisrente assumption block
 * @param pensionSystemAnnualContributionOverride
 *   When provided, replaces the GRV-derived pension-system contribution toward the Schicht-1 cap.
 *   Use for Versorgungswerk members: pass (employeeMonthly + employerMonthly) × 12.
 *   Pass 0 for Beamtenpension/none (no GRV-equivalent contributions).
 */
export function calculateBasisrenteFunding(
  rules: GermanRules,
  salaryResult: SalaryResult,
  basisrente: BasisrenteAssumptions,
  pensionSystemAnnualContributionOverride?: number,
): BasisrenteFundingResult {
  const annualGrossContribution = basisrente.monthlyGrossContribution * 12

  // -------------------------------------------------------------------------
  // 1. Pension-system contributions that count against the Schicht-1 cap.
  //    §10 Abs. 3 Satz 2 Nr. 1 EStG: GRV employee + employer contributions count.
  //    §10 Abs. 3 Satz 2 Nr. 2 EStG: berufsständische Versorgungswerk contributions count similarly.
  //    When override provided (VW members), use it directly instead of deriving from salary.
  // -------------------------------------------------------------------------
  let annualPensionContributionsTowardsCap: number
  if (pensionSystemAnnualContributionOverride !== undefined) {
    annualPensionContributionsTowardsCap = pensionSystemAnnualContributionOverride
  } else {
    const annualGrvEmployee = salaryResult.social.pension
    const annualGrvEmployer =
      rules.socialSecurity.pensionEmployeeRate > 0
        ? (annualGrvEmployee / rules.socialSecurity.pensionEmployeeRate) *
          rules.socialSecurity.pensionEmployerRate
        : annualGrvEmployee
    annualPensionContributionsTowardsCap = annualGrvEmployee + annualGrvEmployer
  }

  // -------------------------------------------------------------------------
  // 2. Remaining Schicht-1 cap and deductible Basisrente portion.
  // -------------------------------------------------------------------------
  const remainingSchicht1Cap = Math.max(
    0,
    rules.basisrente.schicht1CapSingle - annualPensionContributionsTowardsCap,
  )
  const annualDeductible =
    Math.min(annualGrossContribution, remainingSchicht1Cap) * rules.basisrente.deductibleFraction

  // -------------------------------------------------------------------------
  // 3. Marginal tax saving from the Sonderausgaben deduction.
  //    The Basisrente deductible reduces the salary-phase zvE directly.
  //    Base zvE: from salary result (already reflects bAV conversion if applicable).
  // -------------------------------------------------------------------------
  const zvEWithout = salaryResult.taxableIncome
  const zvEWith = Math.max(0, zvEWithout - annualDeductible)

  const taxWithout =
    calculateIncomeTax2026(zvEWithout, rules) +
    calculateSolidarityTax(calculateIncomeTax2026(zvEWithout, rules), rules)
  const taxWith =
    calculateIncomeTax2026(zvEWith, rules) +
    calculateSolidarityTax(calculateIncomeTax2026(zvEWith, rules), rules)

  const annualTaxSaving = Math.max(0, taxWithout - taxWith)
  const monthlyTaxSaving = annualTaxSaving / 12
  const monthlyNetCost = Math.max(0, basisrente.monthlyGrossContribution - monthlyTaxSaving)

  return {
    monthlyGrossContribution: basisrente.monthlyGrossContribution,
    annualGrossContribution,
    annualPensionContributionsTowardsCap,
    remainingSchicht1Cap,
    annualDeductible,
    annualTaxSaving,
    monthlyTaxSaving,
    monthlyNetCost,
  }
}

/**
 * Net monthly Basisrente payout after income tax (§22 Nr. 1 Satz 3 a aa EStG
 * Besteuerungsanteil) and KV/PV (full health rate; no §226 Abs. 2 SGB V Freibetrag).
 *
 * Marginal-tax approach: the reported payout is taxed on top of `otherMonthlyIncome`
 * (GRV + other sources), matching how netBavPayout and netInsurancePayout work.
 *
 * KV/PV: computed via the freiwillig §240 SGB V path (full healthRate, full careRate,
 * no Freibetrag). Zero when publicHealthInsurance = false (PKV holder).
 */
export function netBasisrentePayout(
  grossMonthlyPayout: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  retirementYear = rules.year,
): number {
  // -------------------------------------------------------------------------
  // 1. Income tax — §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil.
  //    Route Basisrente through statutoryPensionAnnual so the Besteuerungsanteil
  //    cohort table is applied (same table as GRV). Werbungskosten-Pauschbetrag 102 EUR
  //    (§9a Nr. 3 EStG) applies to Renten income, which is correct.
  // -------------------------------------------------------------------------
  const basisrenteAnnual = grossMonthlyPayout * 12
  const otherAnnual = otherMonthlyIncome * 12

  const taxWith = calculateRetirementTax(
    {
      statutoryPensionAnnual: basisrenteAnnual,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer', // irrelevant (no insurance income)
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
      privateInsuranceTaxMode: 'abgeltungsteuer',
      otherTaxableAnnual: otherAnnual,
      retirementYear,
    },
    rules,
    'single',
  )
  const marginalTaxAnnual = taxWith.totalTaxAnnual - taxWithout.totalTaxAnnual

  if (!profile.publicHealthInsurance) {
    return Math.max(0, grossMonthlyPayout - marginalTaxAnnual / 12)
  }

  // -------------------------------------------------------------------------
  // 2. KV/PV — marginal freiwillig §240 SGB V.
  //    Basisrente is not a Versorgungsbezug (§229 SGB V); no §226 Abs. 2 KV-Freibetrag.
  //    For freiwillig Versicherte, contributions apply at the full rate on all income up
  //    to the monthly BBG (§240 SGB V). otherMonthlyIncome (GRV + other) already occupies
  //    part of that BBG headroom. The MARGINAL KV/PV from adding the Basisrente payout is:
  //      rate × min(grossPayout, max(0, BBG − otherMonthlyIncome))
  //    When other income fills the BBG entirely, the Basisrente adds zero KV/PV.
  // -------------------------------------------------------------------------
  const additionalHealthRate = (profile.healthAdditionalContributionPct ?? 0) / 100
  const healthRate = rules.socialSecurity.healthGeneralRate + additionalHealthRate
  const careRate =
    careEmployeeRateForChildren(profile.childBirthYears, retirementYear, rules) +
    rules.socialSecurity.careEmployerRate

  const bbg = rules.socialSecurity.healthAndCareCapMonth
  const kvPvBase = Math.min(grossMonthlyPayout, Math.max(0, bbg - otherMonthlyIncome))
  const kvPvMonthly = kvPvBase * (healthRate + careRate)

  return Math.max(0, grossMonthlyPayout - marginalTaxAnnual / 12 - kvPvMonthly)
}

/**
 * Besteuerungsanteil for Basisrente — identical to GRV per §22 Nr. 1 Satz 3 a aa EStG.
 * Exported separately so callers can display it for audit/info purposes.
 */
export { besteuerungsanteilGrv as besteuerungsanteilBasisrente }
