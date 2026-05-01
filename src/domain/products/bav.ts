import type { FeeModel } from '../fees'
import type { PayoutMode } from './common'
import type { SalaryResult } from '../salary'

/**
 * bAV Durchführungsweg — determines income-tax treatment of a capital payout (Kapitalabfindung). (#48)
 *
 * - direktversicherung_3_63:  Modern Direktversicherung funded via §3 Nr. 63 EStG salary conversion.
 *   Capital payout is taxable as Versorgungsbezug per §22 Nr. 5 Satz 1 EStG. Fünftelregelung §34
 *   does NOT apply (the payment is not "Vergütung für mehrjährige Tätigkeit" under current case law).
 * - pensionskasse_3_63: Pensionskasse or Pensionsfonds funded via §3 Nr. 63 EStG.
 *   Same tax treatment as direktversicherung_3_63.
 * - pensionsfonds_3_63: see pensionskasse_3_63.
 * - direktversicherung_40b_alt: Pre-2005 Direktversicherung taxed under §40b EStG a.F.
 *   (pauschalbesteuert). Capital payout may be steuerfrei per §52 Abs. 28 EStG a.F. if
 *   all eligibility conditions are met. KV/PV as Versorgungsbezug still applies (§229 Abs. 1
 *   Satz 1 Nr. 5 SGB V) even when EStG treatment is steuerfrei.
 * - direktzusage: Direct commitment by the employer (§19 EStG). Capital payout is a
 *   Versorgungsbezug under §19 EStG. Fünftelregelung (§34 Abs. 2 Nr. 4 EStG) typically
 *   applies because the capital payment qualifies as "Vergütung für mehrjährige Tätigkeit".
 * - unterstuetzungskasse: Unterstützungskasse (§19 EStG). Same as direktzusage.
 */
export type BavDurchfuehrungsweg =
  | 'direktversicherung_3_63'    // §3 Nr. 63 EStG — modern, default
  | 'pensionskasse_3_63'         // §3 Nr. 63 EStG
  | 'pensionsfonds_3_63'         // §3 Nr. 63 EStG
  | 'direktversicherung_40b_alt' // §40b EStG a.F. — pauschalbesteuert, pre-2005 contracts
  | 'direktzusage'               // §19 EStG (Versorgungsbezug, Fünftelregelung available)
  | 'unterstuetzungskasse'       // §19 EStG (Versorgungsbezug, Fünftelregelung available)

/**
 * Income-tax mode for a bAV capital payout (Kapitalabfindung). Derived by deriveBavLumpSumTaxMode.
 *
 * - pre2005_steuerfrei: §40b EStG a.F. + eligibility confirmed → lump sum is income-tax-free.
 *   KV/PV as Versorgungsbezug still applies under §229 Abs. 1 Satz 1 Nr. 5 SGB V.
 * - fuenftelregelung: §34 Abs. 2 Nr. 4 EStG — extraordinary-income averaging over 5 years.
 *   Applicable for Direktzusage / Unterstützungskasse where the payment qualifies as
 *   "Vergütung für mehrjährige Tätigkeit".
 * - voll_versorgungsbezug: Full marginal rate in the payout year. No Fünftelregelung.
 *   Applied to all §3 Nr. 63 EStG Durchführungswege per §22 Nr. 5 EStG.
 */
export type BavLumpSumTaxMode =
  | 'pre2005_steuerfrei'   // §40b a.F. + eligible → income-tax-free
  | 'fuenftelregelung'     // §34 EStG (Direktzusage / Unterstützungskasse)
  | 'voll_versorgungsbezug' // §22 Nr. 5 EStG — full marginal rate, no Fünftelregelung

export interface BavAssumptions {
  monthlyGrossConversion: number
  // #51: §1a Abs. 1a BetrAVG statutory minimum subsidy (15 % conversion, capped by employer SV savings).
  // Disable when the employer is fully waived under a collective agreement.
  statutoryMinimumSubsidyEnabled: boolean
  // #51: contractual employer match (fraction of monthlyGrossConversion); uncapped, stacks on top of statutory.
  contractualMatchPercent: number
  // #51: contractual fixed monthly employer contribution (EUR/month); uncapped, stacks on top of statutory.
  contractualFixedMonthly: number
  fees: FeeModel
  // #6: other monthly retirement income (GRV + other) for marginal-tax calculation
  monthlyOtherRetirementIncome: number
  // #5: when true, subtract estimatedMonthlyGrvReduction from bAV net payout
  includeGrvReduction: boolean
  // #6: true = KVdR (KV Freibetrag §226(2) SGB V, combined AN+AG PV); false = freiwillig versichert (no Freibetrag)
  kvdrMember: boolean
  // #48: bAV Durchführungsweg — determines income-tax treatment of capital payout
  durchfuehrungsweg: BavDurchfuehrungsweg
  // #48: for direktversicherung_40b_alt only — true when §52 Abs. 28 EStG a.F. conditions met
  // (≥12-year runtime, ≥5 annual premium payments, capital payout not annuity)
  pre2005EligibleTaxFree: boolean
  // #54: retirement-phase payout mode — see PayoutMode docstring.
  payoutMode: PayoutMode
  // #54: contractual Rentenfaktor in EUR/Monat per 10 000 EUR Kapital (used when payoutMode === 'leibrente').
  rentenfaktor: number
  // True when the user has confirmed the Rentenfaktor matches their contract; suppresses the
  // "Schätzwert"/"Modellwert" badge even when the value still equals the default.
  rentenfaktorConfirmed: boolean
  // #54: fixed-term horizon in years (used when payoutMode === 'zeitrente').
  zeitrenteYears: number
}

export interface BavFundingResult {
  monthlyGrossConversion: number
  annualGrossConversion: number
  monthlyNetCost: number
  annualNetCost: number
  monthlyTaxAndSvSavings: number
  annualTaxAndSvSavings: number
  // #51: §1a Abs. 1a BetrAVG statutory minimum subsidy (15 % conversion, capped by employer SV savings).
  monthlyStatutoryEmployerSubsidy: number
  // #51: contractual employer match + fixed contribution (uncapped).
  monthlyContractualEmployerContribution: number
  // Total employer contribution paid into the bAV (statutory §1a Abs. 1a + contractual).
  monthlyEmployerContribution: number
  annualEmployerContribution: number
  employerSocialSecuritySavingAnnual: number
  salaryWithoutBav: SalaryResult
  salaryWithBav: SalaryResult
  // §3 Nr. 63 EStG (8% BBG) and §1 SvEV (4% BBG) limits applied to total bAV
  totalBavContributionAnnual: number
  taxFreePortionAnnual: number
  svFreePortionAnnual: number
  taxableOverflowAnnual: number
  svLiableOverflowAnnual: number
  // #5: estimated monthly GRV pension loss from salary conversion (see BACKLOG #5)
  estimatedMonthlyGrvReduction: number
}
