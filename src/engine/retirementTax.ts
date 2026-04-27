/**
 * Retirement taxable-income pipeline (#46).
 *
 * Converts gross retirement income components into a full tax breakdown,
 * applying cohort-based allowances and routing rules before calling the
 * underlying §32a/§32d tax helpers.
 *
 * Design decisions documented here:
 *
 * HALBEINKÜNFTE ROUTING
 *   §20 Abs. 1 Nr. 6 EStG: only half the gain from a qualifying private-insurance
 *   contract enters the personal-income-tax base. Implemented by halving
 *   `privateInsuranceTaxableAnnual` before summing into the personal base.
 *   The full gain is NOT reported in `abgeltungsteuerOnPrivateInsurance` for this mode.
 *
 * ABGELTUNGSTEUER ROUTING
 *   §20 Abs. 2 EStG: the full gain is taxed at a flat 25 % + Soli.
 *   It is removed from the personal-income-tax base entirely and
 *   reported in `abgeltungsteuerOnPrivateInsurance`.
 *
 * PRE-2005 ROUTING
 *   §52 Abs. 28 EStG a.F.: qualifying old-law contracts are entirely tax-free.
 *   Neither the gain nor anything else enters either tax base.
 *
 * VERSORGUNGSFREIBETRAG — LUMP-SUM SUPPRESSION
 *   §19 Abs. 2 EStG refers to "laufende Versorgungsbezüge" (ongoing pension payments).
 *   A one-time capital payout (e.g. used as Fünftelregelung context) does not qualify
 *   as a "laufender" Versorgungsbezug. Set `bavIsLumpSum = true` on the components to
 *   suppress the Versorgungsfreibetrag. Callers must handle Fünftelregelung themselves
 *   (they pass lumpSum / 5 as bavPensionAnnual for each of the five years and call the
 *   pipeline twice — for "other" alone and for "other + lumpSum/5").
 *
 * FILING STATUS
 *   Only 'single' (Einzelveranlagung) is implemented. 'married' throws an error to
 *   prevent silent wrong values. Ehegattensplitting (#future) can be added by doubling
 *   the allowances and applying the tariff to half the joint income.
 *
 * WERBUNGSKOSTEN CAPS
 *   Each Pauschbetrag is capped at the corresponding gross income component,
 *   preventing a deduction larger than the income from that source.
 *   - Versorgung cap: bavPensionAnnual (gross)
 *   - Renten cap: statutoryPensionTaxable (after Rentenfreibetrag)
 *   Sonderausgaben-Pauschbetrag is not capped because it applies to the
 *   whole zvE, not a specific income source.
 *
 * NOT MODELED
 *   - Kirchensteuer (no implementation; note in LEGAL_REVIEW.md)
 *   - Außerordentliche Einkünfte beyond Fünftelregelung
 *   - KV/PV contribution deductions from zvE (modeled separately in projections.ts)
 *   - Sparerpauschbetrag for private insurance (callers pass the gain net of allowances
 *     if applicable; typically not used for insurance lump-sum but documented here)
 */

import type {
  GermanRules,
  RetirementIncomeComponents,
  RetirementTaxBreakdown,
} from '../domain/types'
import {
  besteuerungsanteilGrv,
  sonderausgabenPauschbetrag,
  versorgungsfreibetrag,
  werbungskostenPauschalRenten,
  werbungskostenPauschalVersorgungsbezuege,
} from '../rules/de2026'
import { calculateIncomeTax2026, calculateSolidarityTax } from './tax'

export function calculateRetirementTax(
  components: RetirementIncomeComponents,
  rules: GermanRules,
  filingStatus: 'single' | 'married' = 'single',
): RetirementTaxBreakdown {
  if (filingStatus === 'married') {
    // Ehegattensplitting requires joint-assessment logic (double allowances, half-income tariff).
    // Not yet implemented. Use 'single' until #future Splittingtabelle is added.
    throw new Error(
      'calculateRetirementTax: filingStatus "married" is not yet implemented. ' +
      'Use "single" until Ehegattensplitting support is added.',
    )
  }

  const {
    statutoryPensionAnnual,
    bavPensionAnnual,
    bavIsLumpSum,
    privateInsuranceTaxableAnnual,
    privateInsuranceTaxMode,
    otherTaxableAnnual,
    retirementYear,
  } = components

  // -------------------------------------------------------------------------
  // 1. Statutory pension → apply Besteuerungsanteil (§22 Nr. 1 Satz 3a aa EStG)
  // -------------------------------------------------------------------------
  const besteuerungsanteil = besteuerungsanteilGrv(retirementYear)
  const statutoryPensionTaxable = statutoryPensionAnnual * besteuerungsanteil

  // -------------------------------------------------------------------------
  // 2. bAV pension → apply Versorgungsfreibetrag + Zuschlag (§19 Abs. 2 EStG)
  //    Suppressed for lump-sum context (one-time payout is not "laufend").
  // -------------------------------------------------------------------------
  let bavPensionTaxable: number
  if (bavIsLumpSum || bavPensionAnnual <= 0) {
    bavPensionTaxable = Math.max(0, bavPensionAnnual)
  } else {
    const vfb = versorgungsfreibetrag(retirementYear)
    const rawFreibetrag = bavPensionAnnual * vfb.prozent
    const cappedFreibetrag = Math.min(rawFreibetrag, vfb.hoechstbetrag)
    // Zuschlag is unconditional (not limited by the Hoechstbetrag cap — it is additive).
    const totalAllowance = cappedFreibetrag + vfb.zuschlag
    bavPensionTaxable = Math.max(0, bavPensionAnnual - totalAllowance)
  }

  // -------------------------------------------------------------------------
  // 3. Private insurance → routing by tax mode
  // -------------------------------------------------------------------------
  let privateInsuranceTaxable: number
  let abgeltungsteuerOnPrivateInsurance: number

  if (privateInsuranceTaxMode === 'pre2005') {
    // Entirely tax-free; nothing enters either base.
    privateInsuranceTaxable = 0
    abgeltungsteuerOnPrivateInsurance = 0
  } else if (privateInsuranceTaxMode === 'abgeltungsteuer') {
    // Full gain taxed at flat 25 % + Soli; removed from personal-income-tax base.
    privateInsuranceTaxable = 0
    const flatTax = Math.max(0, privateInsuranceTaxableAnnual) * rules.capitalGains.taxRate
    abgeltungsteuerOnPrivateInsurance = flatTax + flatTax * rules.capitalGains.solidarityRate
  } else {
    // halbeinkuenfte: only half the gain enters the personal-income-tax base (§20 Abs. 1 Nr. 6).
    privateInsuranceTaxable = Math.max(0, privateInsuranceTaxableAnnual) / 2
    abgeltungsteuerOnPrivateInsurance = 0
  }

  // -------------------------------------------------------------------------
  // 4. Werbungskosten-Pauschbeträge (§9a EStG)
  //    Each cap applies against its respective source gross/taxable amount.
  // -------------------------------------------------------------------------

  // §9a Nr. 1b: applies if there are any Versorgungsbezüge (bAV pension > 0).
  // Cap: cannot exceed the gross bAV pension (no deduction beyond source income).
  const werbungskostenVersorgung =
    bavPensionAnnual > 0
      ? Math.min(werbungskostenPauschalVersorgungsbezuege, bavPensionAnnual)
      : 0

  // §9a Nr. 3: applies if there is any statutory pension / "sonstige Einkünfte aus Renten".
  // Cap: cannot exceed the taxable statutory pension amount.
  const werbungskostenRenten =
    statutoryPensionAnnual > 0
      ? Math.min(werbungskostenPauschalRenten, statutoryPensionTaxable)
      : 0

  // §10c: Sonderausgaben-Pauschbetrag — single filer: 36 EUR.
  const sonderausgaben = sonderausgabenPauschbetrag[filingStatus]

  // -------------------------------------------------------------------------
  // 5. Zu versteuerndes Einkommen (zvE)
  // -------------------------------------------------------------------------
  const grossPersonalBase =
    statutoryPensionTaxable +
    bavPensionTaxable +
    privateInsuranceTaxable +
    otherTaxableAnnual

  const totalDeductions = werbungskostenVersorgung + werbungskostenRenten + sonderausgaben

  const zuVersteuerndesEinkommen = Math.max(0, grossPersonalBase - totalDeductions)

  // -------------------------------------------------------------------------
  // 6. Income tax and Soli on zvE
  // -------------------------------------------------------------------------
  const einkommensteuer = calculateIncomeTax2026(zuVersteuerndesEinkommen, rules)
  const solidaritaetszuschlag = calculateSolidarityTax(einkommensteuer, rules)

  // -------------------------------------------------------------------------
  // 7. Totals
  // -------------------------------------------------------------------------
  const totalTaxAnnual = einkommensteuer + solidaritaetszuschlag + abgeltungsteuerOnPrivateInsurance

  const netRetirementIncomeAnnual =
    statutoryPensionAnnual +
    bavPensionAnnual +
    otherTaxableAnnual +
    privateInsuranceTaxableAnnual -
    totalTaxAnnual

  return {
    statutoryPensionTaxable,
    bavPensionTaxable,
    privateInsuranceTaxable,
    otherTaxable: otherTaxableAnnual,
    werbungskostenVersorgung,
    werbungskostenRenten,
    sonderausgaben,
    zuVersteuerndesEinkommen,
    einkommensteuer,
    solidaritaetszuschlag,
    abgeltungsteuerOnPrivateInsurance,
    totalTaxAnnual,
    netRetirementIncomeAnnual,
  }
}
