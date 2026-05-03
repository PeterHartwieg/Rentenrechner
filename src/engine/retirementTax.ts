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
 * ERTRAGSANTEIL ROUTING (#59)
 *   §22 Nr. 1 Satz 3 a aa EStG: for lifelong private Leibrenten, only the
 *   age-based Ertragsanteil fraction enters the personal-income-tax base.
 *   The caller (netInsurancePayout) pre-multiplies by the fraction and passes
 *   the result as privateInsuranceTaxableAnnual; this branch passes it through
 *   unchanged (no further halving or flat-tax treatment).
 *
 * PRE-2005 ROUTING
 *   §52 Abs. 28 EStG a.F.: qualifying old-law contracts are entirely tax-free for
 *   capital payouts. Even pre-2005 contracts pay Ertragsanteil on Leibrente — that
 *   payout path uses 'ertragsanteil' mode, not 'pre2005'.
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
 *   - 'single' (Einzelveranlagung): standard §32a Abs. 1 EStG Grundtarif on the zvE.
 *   - 'married' (Zusammenveranlagung, §32a Abs. 5 EStG Splittingtarif):
 *       1. zvE is treated as the JOINT taxable income of both spouses (caller-aggregated).
 *       2. Einkommensteuer = 2 × Grundtarif(zvE / 2).
 *       3. §10c Sonderausgaben-Pauschbetrag uses the doubled married value (72 EUR).
 *       4. Soli uses the doubled Freigrenze (rules.incomeTax.solidarityFreeTaxMarried).
 *     Werbungskosten-Pauschbeträge (§9a Nr. 1b/Nr. 3) are statutorily granted per
 *     spouse who actually receives that source. Because the components describe the
 *     joint household as one stream, the pipeline applies each Pauschbetrag at most
 *     once. This is exact for one-earner couples (where only one spouse receives
 *     Versorgungsbezüge / GRV) and underestimates by up to 102 EUR per shared source
 *     for both-earner couples. Callers that need full per-spouse breakdown should
 *     pre-deduct the second Pauschbetrag from the relevant gross component.
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
 *   - KV/PV contribution deductions from zvE (modeled separately in retirementPayout.ts)
 *   - Sparerpauschbetrag for private insurance (callers pass the gain net of allowances
 *     if applicable; typically not used for insurance lump-sum but documented here)
 */

import type {
  GermanRules,
  RetirementIncomeComponents,
  RetirementKvPvBreakdown,
  RetirementKvPvContext,
  RetirementTaxBreakdown,
} from '../domain'
import {
  besteuerungsanteilGrv,
  sonderausgabenPauschbetrag,
  versorgungsfreibetrag,
  werbungskostenPauschalRenten,
  werbungskostenPauschalVersorgungsbezuege,
} from '../rules/de2026'
import { legalConstants } from '../rules/legalConstants'
import { calculateIncomeTax2026, calculateSolidarityTax } from './tax'

export function calculateRetirementTax(
  components: RetirementIncomeComponents,
  rules: GermanRules,
  filingStatus: 'single' | 'married' = 'single',
): RetirementTaxBreakdown {
  const {
    statutoryPensionAnnual,
    bavPensionAnnual,
    bavIsLumpSum,
    privateInsuranceTaxableAnnual,
    privateInsuranceTaxMode,
    privateInsuranceContributions,
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
  //
  //    Single-instance path: route the singleton (privateInsuranceTaxableAnnual,
  //    privateInsuranceTaxMode) through the per-mode rules.
  //
  //    Multi-instance path (combine-mode, Group G issue 08): when
  //    `privateInsuranceContributions` is set, iterate the list and apply each
  //    entry's mode independently. Each mode's contribution to the personal
  //    base / Abgeltungsteuer line accumulates separately. The singleton
  //    fields are ignored in this path.
  // -------------------------------------------------------------------------
  let privateInsuranceTaxable = 0
  let abgeltungsteuerOnPrivateInsurance = 0

  const applyInsuranceContribution = (amount: number, mode: typeof privateInsuranceTaxMode): void => {
    const safeAmount = Math.max(0, amount)
    if (mode === 'pre2005') {
      // Entirely tax-free for capital payouts; nothing enters either base.
      // Note: even pre-2005 contracts pay Ertragsanteil on Leibrente — that path uses 'ertragsanteil' instead.
      return
    }
    if (mode === 'abgeltungsteuer') {
      // Full gain taxed at flat 25 % + Soli; removed from personal-income-tax base.
      const flatTax = safeAmount * rules.capitalGains.taxRate
      abgeltungsteuerOnPrivateInsurance += flatTax + flatTax * rules.capitalGains.solidarityRate
      return
    }
    if (mode === 'ertragsanteil') {
      // §22 Nr. 1 Satz 3 a aa EStG: Ertragsanteil enters the personal-income-tax base directly.
      // The amount must already be (grossMonthlyPayout × 12 × ertragsanteil);
      // no further reduction — the age-based fraction is the statutory taxable share.
      privateInsuranceTaxable += safeAmount
      return
    }
    // halbeinkuenfte: only half the gain enters the personal-income-tax base (§20 Abs. 1 Nr. 6).
    privateInsuranceTaxable += safeAmount * legalConstants.insurance.halbeinkuenfteFactor
  }

  if (privateInsuranceContributions && privateInsuranceContributions.length > 0) {
    for (const entry of privateInsuranceContributions) {
      applyInsuranceContribution(entry.amount, entry.mode)
    }
  } else {
    applyInsuranceContribution(privateInsuranceTaxableAnnual, privateInsuranceTaxMode)
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
  //    'married' applies the §32a Abs. 5 EStG Splittingtarif: 2 × Grundtarif(zvE / 2).
  //    Soli uses the doubled Freigrenze for joint assessment.
  // -------------------------------------------------------------------------
  const einkommensteuer =
    filingStatus === 'married'
      ? 2 * calculateIncomeTax2026(zuVersteuerndesEinkommen / 2, rules)
      : calculateIncomeTax2026(zuVersteuerndesEinkommen, rules)
  const solidaritaetszuschlag = calculateSolidarityTax(einkommensteuer, rules, filingStatus)

  // -------------------------------------------------------------------------
  // 7. Totals
  // -------------------------------------------------------------------------
  const totalTaxAnnual = einkommensteuer + solidaritaetszuschlag + abgeltungsteuerOnPrivateInsurance

  const totalPrivateInsuranceGross = privateInsuranceContributions && privateInsuranceContributions.length > 0
    ? privateInsuranceContributions.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0)
    : Math.max(0, privateInsuranceTaxableAnnual)

  const netRetirementIncomeAnnual =
    statutoryPensionAnnual +
    bavPensionAnnual +
    otherTaxableAnnual +
    totalPrivateInsuranceGross -
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

/**
 * BBG-aware KV/PV contribution calculation across multiple retirement income sources. (#47)
 *
 * Design decisions:
 *
 * KV FREIBETRAG (§226 Abs. 2 SGB V):
 *   The Freibetrag is granted ONCE per month on the AGGREGATE of all Versorgungsbezüge,
 *   not once per source. We sum all Versorgungsbezüge, deduct the single monthly Freibetrag,
 *   then split the KV-relevant base back proportionally to each source's share. This matches
 *   §226 Abs. 2 SGB V, which reads "Versorgungsbezüge" in the aggregate.
 *
 * PV FREIGRENZE (§57 Abs. 1 SGB XI):
 *   The Freigrenze is all-or-nothing on the AGGREGATE of Versorgungsbezüge per month.
 *   Below the Freigrenze: zero PV on ALL Versorgungsbezüge. Above: the full aggregate
 *   amount is subject to PV (no deduction — Freigrenze, not Freibetrag). Per-source PV is
 *   then split proportionally to each source's share of the aggregate.
 *
 * STATUTORY PENSION KV (§249a SGB V):
 *   For KVdR members: the pensioner pays the employee half of healthRate (the Rentenversicherung
 *   pays the other half as Beitragszuschuss). Effective rate = healthRate / 2.
 *   For freiwillig Versicherte: §240 SGB V applies — the pensioner pays the full healthRate
 *   on statutory pension income just like on all other income. (No institutional half-rate split.)
 *
 * STATUTORY PENSION PV:
 *   The Versorgungsträger (DRV) does not pay an employer share of PV. The pensioner pays
 *   the full careRate on statutory pension in both KVdR and freiwillig scenarios.
 *
 * BBG APPORTIONMENT (§224 Abs. 1 SGB V by analogy):
 *   When the uncapped aggregate assessment base exceeds the monthly BBG (5,812.50 EUR in 2026),
 *   per-source amounts are scaled down proportionally so the capped totals sum to
 *   BBG × applicable rate. Proportional scaling is administratively analogous to the
 *   multi-employer apportionment in §22 Abs. 1 SGB IV and §6 Abs. 7 SGB V.
 *   (Documented choice — see LEGAL_REVIEW.md §"Retirement KV/PV (#47)".)
 *
 * FREIWILLIG VERSICHERTE — PRIVATE INSURANCE:
 *   Private insurance Renten are NOT Versorgungsbezüge under §229 SGB V but are subject to
 *   KV/PV for freiwillig Versicherte under §240 SGB V (full income basis up to BBG).
 *   Pass these via `freiwilligOtherMonthlyIncome`; ignored for KVdR members.
 *
 * MINDESTBEITRAG:
 *   The minimum contribution (Mindestbeitrag) for freiwillig Versicherte (§240 Abs. 4 SGB V)
 *   is not modeled. This function may produce zero contributions for very low incomes, which
 *   would be corrected upward in reality. Documented simplification in LEGAL_REVIEW.md.
 */
export function calculateRetirementKvPv(ctx: RetirementKvPvContext): RetirementKvPvBreakdown {
  const {
    bavMonthlyVersorgungsbezuege,
    otherMonthlyVersorgungsbezuege,
    monthlyStatutoryPension,
    freiwilligOtherMonthlyIncome,
    isFreiwilligVersichert,
    kvFreibetragVersorgungMonthly,
    pvFreigrenzeVersorgungMonthly,
    monthlyKvPvBbg,
    healthRate,
    careRate,
  } = ctx

  // -------------------------------------------------------------------------
  // 1. KV on Versorgungsbezüge (§226 Abs. 2 SGB V)
  //    One Freibetrag applied to the aggregate of all Versorgungsbezüge, then
  //    the KV-relevant excess is split proportionally back to each source.
  //    Retiree pays the FULL healthRate on Versorgungsbezüge (§249a SGB V — no
  //    employer/Versorgungsträger half for KV on Versorgungsbezüge).
  //
  //    IMPORTANT: §226 Abs. 2 SGB V Freibetrag applies ONLY to KVdR-Pflichtversicherte
  //    (§5 Abs. 1 Nr. 11 SGB V). For freiwillig Versicherte under §240 SGB V, the full
  //    amount of all income is the assessment base — no Freibetrag.
  //
  //    Similarly, the PV Freigrenze (§57 Abs. 1 SGB XI) applies only in the context of
  //    compulsory KVdR membership. For freiwillig Versicherte, the full care-contribution
  //    base is all income up to the BBG (§57 Abs. 4 SGB XI → §240 SGB V by reference).
  //    We maintain the Freigrenze for consistency but the freiwillig KV/PV path below
  //    routes through freiwilligBase rather than the Versorgungsbezüge fields.
  // -------------------------------------------------------------------------
  const totalVersorgungsbezuege = Math.max(0, bavMonthlyVersorgungsbezuege) +
    Math.max(0, otherMonthlyVersorgungsbezuege)
  // KVdR Freibetrag applies only when NOT freiwillig (§226 Abs. 2 SGB V)
  const kvRelevantVersorgung = isFreiwilligVersichert
    ? totalVersorgungsbezuege
    : Math.max(0, totalVersorgungsbezuege - kvFreibetragVersorgungMonthly)

  // Per-source proportional share of the KV-relevant Versorgungsbezüge base
  const versorgungShareBav = totalVersorgungsbezuege > 0
    ? Math.max(0, bavMonthlyVersorgungsbezuege) / totalVersorgungsbezuege
    : 0
  const versorgungShareOther = totalVersorgungsbezuege > 0
    ? Math.max(0, otherMonthlyVersorgungsbezuege) / totalVersorgungsbezuege
    : 0

  const bavKvVersorgungBase = kvRelevantVersorgung * versorgungShareBav
  const otherKvVersorgungBase = kvRelevantVersorgung * versorgungShareOther

  // -------------------------------------------------------------------------
  // 2. PV on Versorgungsbezüge (§57 Abs. 1 SGB XI, all-or-nothing Freigrenze)
  //    PV-relevant Versorgungsbezüge aggregate (no deduction — Freigrenze):
  //    below Freigrenze → 0 for all; above → full aggregate at careRate.
  // -------------------------------------------------------------------------
  const pvRelevantVersorgung = isFreiwilligVersichert
    ? totalVersorgungsbezuege
    : totalVersorgungsbezuege > pvFreigrenzeVersorgungMonthly
      ? totalVersorgungsbezuege
      : 0

  const bavPvVersorgungBase = pvRelevantVersorgung * versorgungShareBav
  const otherPvVersorgungBase = pvRelevantVersorgung * versorgungShareOther

  // -------------------------------------------------------------------------
  // 3. KV on statutory pension (§249a SGB V: half-rate for KVdR; full rate for freiwillig)
  //    PV on statutory pension: full careRate in both cases (DRV has no employer PV share).
  // -------------------------------------------------------------------------
  const statutoryPensionKvHalfRate = isFreiwilligVersichert ? healthRate : healthRate / 2
  const statutoryPensionKvBase = Math.max(0, monthlyStatutoryPension)
  const statutoryPensionPvBase = Math.max(0, monthlyStatutoryPension)

  // -------------------------------------------------------------------------
  // 4. KV/PV on other income for freiwillig Versicherte only (§240 SGB V)
  // -------------------------------------------------------------------------
  const freiwilligBase = isFreiwilligVersichert ? Math.max(0, freiwilligOtherMonthlyIncome) : 0

  // -------------------------------------------------------------------------
  // 5. Uncapped totals (used as scaling reference and diagnostic output)
  //    For KV: Versorgungsbezüge base × fullRate + statutory × halfOrFullRate + freiwillig × fullRate
  //    For PV: all bases × careRate
  // -------------------------------------------------------------------------
  const uncappedKvMonthly =
    bavKvVersorgungBase * healthRate +
    otherKvVersorgungBase * healthRate +
    statutoryPensionKvBase * statutoryPensionKvHalfRate +
    freiwilligBase * healthRate

  const uncappedPvMonthly =
    bavPvVersorgungBase * careRate +
    otherPvVersorgungBase * careRate +
    statutoryPensionPvBase * careRate +
    freiwilligBase * careRate

  // -------------------------------------------------------------------------
  // 6. BBG cap via proportional scaling
  //
  //    The assessment base for KV and PV is capped at monthlyKvPvBbg (§6 Abs. 7 SGB V).
  //    We compute an "uncapped assessment base" for each tax separately (accounting for the
  //    different effective rates per source) and then scale down if it exceeds BBG.
  //
  //    For KV:
  //      uncapped KV assessment base = bavKvVersorgungBase + otherKvVersorgungBase
  //                                   + statutoryPensionKvBase (weighted by halfOrFull)
  //                                   + freiwilligBase
  //    Simplification: since sources have different per-unit KV rates (full vs. half on
  //    GRV), we work with the total *contribution amounts* and scale those proportionally.
  //
  //    Scale factor = min(1, BBG_contributions / uncapped_contributions)
  //    where BBG_contributions = BBG × weighted_avg_rate (already implicit in uncappedKV).
  //    Actually simpler: scale each contribution amount proportionally so their SUM =
  //    min(uncappedKV, BBG_max_contribution_at_applicable_rate).
  //
  //    But since sources have different rates, the cleanest approach is:
  //    if uncappedKvMonthly ≤ BBG × healthRate → no cap needed
  //    else scale each per-source KV contribution proportionally:
  //      scaled_source = source_contribution × (cappedTotal / uncappedTotal)
  //
  //    The "cap" for KV is: total_KV_contributions ≤ effectiveCapKv
  //    where effectiveCapKv is not simply BBG × healthRate because the GRV portion uses
  //    halfRate. We cap the underlying assessment bases instead:
  //      aggregate assessment base = bavKvVersorgungBase + otherKvVersorgungBase
  //                                  + statutoryPensionKvBase + freiwilligBase
  //    Cap: aggregate_base ≤ monthlyKvPvBbg
  //    If over: scale = monthlyKvPvBbg / aggregate_base
  //    Apply scale to each base, then multiply by the source's own rate.
  //
  //    Same logic for PV, using the PV aggregate bases.
  // -------------------------------------------------------------------------

  // KV aggregate assessment base (before applying rates)
  const kvAggregateBase =
    bavKvVersorgungBase +
    otherKvVersorgungBase +
    statutoryPensionKvBase +
    freiwilligBase

  const kvScale = kvAggregateBase > monthlyKvPvBbg
    ? monthlyKvPvBbg / kvAggregateBase
    : 1

  // PV aggregate assessment base (Versorgungsbezüge after Freigrenze; statutory pension; freiwillig other)
  const pvAggregateBase =
    bavPvVersorgungBase +
    otherPvVersorgungBase +
    statutoryPensionPvBase +
    freiwilligBase

  const pvScale = pvAggregateBase > monthlyKvPvBbg
    ? monthlyKvPvBbg / pvAggregateBase
    : 1

  // -------------------------------------------------------------------------
  // 7. Apply scaled bases × rates to get final per-source monthly deductions
  // -------------------------------------------------------------------------
  const bavKvMonthly = bavKvVersorgungBase * kvScale * healthRate
  const otherVersorgungsbezuegeKvMonthly = otherKvVersorgungBase * kvScale * healthRate
  const statutoryPensionKvMonthly = statutoryPensionKvBase * kvScale * statutoryPensionKvHalfRate
  const freiwilligOtherKvMonthly = freiwilligBase * kvScale * healthRate

  const bavPvMonthly = bavPvVersorgungBase * pvScale * careRate
  const otherVersorgungsbezuegePvMonthly = otherPvVersorgungBase * pvScale * careRate
  const statutoryPensionPvMonthly = statutoryPensionPvBase * pvScale * careRate
  const freiwilligOtherPvMonthly = freiwilligBase * pvScale * careRate

  const totalKvMonthly =
    bavKvMonthly +
    otherVersorgungsbezuegeKvMonthly +
    statutoryPensionKvMonthly +
    freiwilligOtherKvMonthly

  const totalPvMonthly =
    bavPvMonthly +
    otherVersorgungsbezuegePvMonthly +
    statutoryPensionPvMonthly +
    freiwilligOtherPvMonthly

  return {
    bavKvMonthly,
    bavPvMonthly,
    otherVersorgungsbezuegeKvMonthly,
    otherVersorgungsbezuegePvMonthly,
    statutoryPensionKvMonthly,
    statutoryPensionPvMonthly,
    freiwilligOtherKvMonthly,
    freiwilligOtherPvMonthly,
    totalKvMonthly,
    totalPvMonthly,
    uncappedKvMonthly,
    uncappedPvMonthly,
  }
}
