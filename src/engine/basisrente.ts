/**
 * Basisrente / Rürup-Rente engine (#61).
 *
 * Basisrente is a Schicht-1 certified old-age pension product (§10 Abs. 1 Nr. 2 EStG).
 * Key characteristics:
 * - Contributions are deductible as Sonderausgaben up to the shared Schicht-1 cap
 *   (§10 Abs. 3 EStG). The cap is reduced by total GRV contributions (employee + employer).
 * - Payouts are taxed by the same §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil cohort
 *   table as GRV statutory pensions.
 * - Only lifelong annuity (Leibrente) permitted for old-age Basisrente; full capital
 *   payout (Kapitalabfindung) is prohibited by certification rules (AltZertG §2).
 * - No inheritance payout in the base form; capital is not available before age 62.
 *
 * KV/PV treatment depends on retiree status:
 *   Basisrente payouts are NOT Versorgungsbezüge under §229 SGB V (§237 SGB V lists
 *   the KVdR contribution bases; Basisrente is not among them). Therefore:
 *   - KVdR / compulsory statutory pensioners: no KV/PV on Basisrente.
 *   - Voluntary GKV (freiwillig_gkv): full §240 SGB V broad-income rate up to BBG.
 *   - PKV retirees: no statutory KV/PV deduction.
 *   The caller passes retirementHealthStatus to select the correct path.
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
import { legalConstants } from '../rules/legalConstants'
import {
  calculateMonthlyRetirementPayout,
  type RetirementHealthStatus,
} from './retirementPayout'
import { calculateSalaryPhaseTaxDelta } from './salaryPhaseFunding'

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
  const { taxSavingAnnual: annualTaxSaving } = calculateSalaryPhaseTaxDelta(
    rules,
    salaryResult.taxableIncomeForDeductions ?? salaryResult.taxableIncome,
    annualDeductible,
    salaryResult.deductionFilingStatus ?? 'single',
  )
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
 * Besteuerungsanteil) and KV/PV.
 *
 * Marginal-tax approach: the reported payout is taxed on top of `otherMonthlyIncome`
 * (GRV + other sources), matching how netBavPayout and netInsurancePayout work.
 *
 * KV/PV depends on `retirementHealthStatus`:
 *   - 'kvdr': no KV/PV (Basisrente is not a Versorgungsbezug per §229 SGB V).
 *   - 'freiwillig_gkv': §240 SGB V full broad-income rate up to monthly BBG.
 *   - 'pkv': no statutory KV/PV.
 * Also zero when profile.publicHealthInsurance = false (PKV in working phase).
 * Default is 'freiwillig_gkv' for backward-compat with direct callers.
 */
export function netBasisrentePayout(
  grossMonthlyPayout: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  retirementYear = rules.year,
  retirementHealthStatus: RetirementHealthStatus = 'freiwillig_gkv',
  /** Gross GRV monthly pension. Stacked into the marginal-tax base via
   *  statutoryPensionAnnual (additive to the Basisrente itself, since both
   *  share the §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil channel) and into
   *  the §240 KV/PV BBG headroom for freiwillig versicherte. */
  grvBaselineMonthly = 0,
): number {
  // Basisrente is taxed on the §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil
  // channel (same cohort table as GRV) and is NOT a Versorgungsbezug under
  // §229 SGB V — KV/PV applies only via §240 SGB V for freiwillig versicherte.
  return calculateMonthlyRetirementPayout({
    rules,
    retirementYear,
    grvBaselineMonthly,
    otherMonthlyIncome,
    grossMonthlyPayout,
    taxChannel: 'statutory_pension',
    kvPvChannel: 'freiwillig_other',
    profile,
    healthStatus: retirementHealthStatus,
  }).netMonthly
}

/** Like netBasisrentePayout but returns both netMonthly and kvPvMonthly. */
export function netBasisrentePayoutFull(
  grossMonthlyPayout: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  retirementYear = rules.year,
  retirementHealthStatus: RetirementHealthStatus = 'freiwillig_gkv',
  grvBaselineMonthly = 0,
): { netMonthly: number; kvPvMonthly: number } {
  const r = calculateMonthlyRetirementPayout({
    rules,
    retirementYear,
    grvBaselineMonthly,
    otherMonthlyIncome,
    grossMonthlyPayout,
    taxChannel: 'statutory_pension',
    kvPvChannel: 'freiwillig_other',
    profile,
    healthStatus: retirementHealthStatus,
  })
  return { netMonthly: r.netMonthly, kvPvMonthly: r.kvPvMonthly }
}

/**
 * Inverse of calculateBasisrenteFunding: given a target monthly net cost
 * (out-of-pocket after the §10 Abs. 3 EStG marginal tax saving), return the
 * monthlyGrossContribution that produces that net.
 *
 * Used by the input-sync layer. Bisection over the funding forward pass —
 * an analytic inverse would need to enumerate the income-tax brackets and the
 * §10 Abs. 3 Schicht-1 cap regime, which is more brittle than a 30-iteration
 * bisection.
 */
export function solveBasisrenteGrossFromNet(
  targetMonthlyNet: number,
  rules: GermanRules,
  salaryResult: SalaryResult,
  basisrente: BasisrenteAssumptions,
  pensionSystemAnnualContributionOverride?: number,
): number {
  if (targetMonthlyNet <= 0) return 0

  const forward = (monthlyGross: number) =>
    calculateBasisrenteFunding(
      rules,
      salaryResult,
      { ...basisrente, monthlyGrossContribution: monthlyGross },
      pensionSystemAnnualContributionOverride,
    ).monthlyNetCost

  let lo = 0
  // Net never exceeds gross (tax saving ≥ 0), so gross ≥ net at minimum.
  // Beyond the Schicht-1 cap, additional gross is fully out-of-pocket → marginal slope 1.
  let hi = Math.max(100, targetMonthlyNet * 4)
  for (let i = 0; i < 10 && forward(hi) < targetMonthlyNet; i++) {
    hi *= 2
  }

  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    const net = forward(mid)
    if (Math.abs(net - targetMonthlyNet) < 0.01) return mid
    if (net < targetMonthlyNet) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Besteuerungsanteil for Basisrente — identical to GRV per §22 Nr. 1 Satz 3 a aa EStG.
 * Exported separately so callers can display it for audit/info purposes.
 */
export { besteuerungsanteilGrv as besteuerungsanteilBasisrente }

/**
 * Validate Basisrente payout start age against §10 Abs. 1 Nr. 2 b Doppelbuchst. aa EStG /
 * AltZertG §2: a certified Basisrentenvertrag may not begin paying the old-age annuity
 * before age 62. Returns a warning string when the retirement age is below the limit,
 * or null when it is compliant. Mirrors `validateAvdPayoutAge` in style.
 */
export function validateBasisrentePayoutAge(retirementAge: number): string | null {
  const min = legalConstants.basisrente.minPayoutAge
  if (retirementAge < min) {
    return `Rentenbeginn mit ${retirementAge} Jahren liegt unter der gesetzlichen Mindestgrenze von ${min} Jahren für Basisrente-Auszahlungen. Das Ergebnis ist für eine regelkonforme Basisrente nicht gültig.`
  }
  return null
}
