/**
 * Per-contract provenance field lists and the "which core answers are
 * missing" question — pure, React-free, so both the § 2 list and the page's
 * note above the KPI strip read the same table.
 */

import type { InstanceCommon } from '../../domain/instances'
import type { ProductId } from '../../domain/products/common'
import { resolveInputStatus } from '../results/provenanceHelpers'
import { CONTRIBUTION_FIELD_BY_PRODUCT } from '../../app/resultReadiness'

export interface ProvenanceField {

  /** Key into `instance.evidenceMap` — must match the engine's evidence key. */
  evidenceKey: string
  /** Visible German label. */
  label: string
}

/**
 * Curated per-product field list for § 2 "Wie wir das berechnen".
 *
 * `evidenceKey` values MUST match the keys written to `instance.evidenceMap`
 * by the inventory wizard via `markConfirmed`. The authoritative source is
 * `PRODUCT_EVIDENCE_FIELDS` in `src/utils/evidence.ts` — keep the two in
 * sync to avoid rows always rendering as "Modellwert" after the user
 * confirmed them. This is a UI concern only; engine code never reads this list.
 *
 * Rows whose `evidenceKey` is intentionally absent from `PRODUCT_EVIDENCE_FIELDS`
 * (because the wizard does not currently capture that field, and the engine uses
 * a statutory or cohort default) are flagged with an inline
 * `// not confirmable yet` comment so the sync-gap is intentional, not a bug.
 */
export function fieldsFor(productId: ProductId): ReadonlyArray<ProvenanceField> {
  switch (productId) {
    case 'etf':
      return [
        { evidenceKey: 'monthlyContribution', label: 'Monatlicher Sparbeitrag' },
        { evidenceKey: 'annualAssetFee', label: 'Laufende Kosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Depotwert' },
        // not confirmable yet — InvStG Teilfreistellung (30 % Aktienfonds) is a
        // statutory default; the wizard does not currently capture it as a
        // user-confirmable input.
        { evidenceKey: 'equityPartialExemption', label: 'Teilfreistellung (Aktienfonds)' },
      ]
    case 'bav':
      return [
        { evidenceKey: 'monthlyGrossConversion', label: 'Bruttoumwandlung pro Monat' },
        { evidenceKey: 'contractualMatchPercent', label: 'Arbeitgeberzuschuss' },
        { evidenceKey: 'fees.wrapperAssetFee', label: 'Versicherungskosten (Mantel)' },
        { evidenceKey: 'fees.fundAssetFee', label: 'Fondskosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Vertragswert' },
        { evidenceKey: 'durchfuehrungsweg', label: 'Durchführungsweg' },
      ]
    case 'versicherung':
      return [
        { evidenceKey: 'monthlyContribution', label: 'Monatlicher Beitrag' },
        { evidenceKey: 'fees.wrapperAssetFee', label: 'Versicherungskosten (Mantel)' },
        { evidenceKey: 'fees.fundAssetFee', label: 'Fondskosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Rückkaufswert' },
        // not confirmable yet — Garantiezins is a real contract attribute but
        // the wizard does not capture it; the engine uses cohort-based defaults.
        { evidenceKey: 'guaranteedInterestRate', label: 'Garantiezins' },
        { evidenceKey: 'contractStartYear', label: 'Vertragsbeginn' },
      ]
    case 'basisrente':
      return [
        { evidenceKey: 'monthlyGrossContribution', label: 'Monatlicher Beitrag' },
        { evidenceKey: 'fees.wrapperAssetFee', label: 'Versicherungskosten (Mantel)' },
        { evidenceKey: 'fees.fundAssetFee', label: 'Fondskosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Vertragswert' },
      ]
    case 'altersvorsorgedepot':
      return [
        { evidenceKey: 'monthlyOwnContribution', label: 'Eigenbeitrag pro Monat' },
        { evidenceKey: 'fees.wrapperAssetFee', label: 'Depotkosten' },
        { evidenceKey: 'fees.fundAssetFee', label: 'Fondskosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Depotwert' },
        { evidenceKey: 'subtype', label: 'AVD-Variante' },
      ]
    case 'riester':
      return [
        { evidenceKey: 'monthlyOwnContribution', label: 'Eigenbeitrag pro Monat' },
        { evidenceKey: 'fees.wrapperAssetFee', label: 'Versicherungskosten (Mantel)' },
        { evidenceKey: 'fees.fundAssetFee', label: 'Fondskosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Vertragswert' },
        // not confirmable yet — Garantiezins is a real contract attribute but
        // the wizard does not capture it; the engine uses cohort-based defaults.
        { evidenceKey: 'guaranteedInterestRate', label: 'Garantiezins' },
      ]
    default: {
      const _exhaustive: never = productId
      void _exhaustive
      return []
    }
  }
}

// ---------------------------------------------------------------------------
// Missing core fields (consumed by the page's "Angaben fehlen" note)
// ---------------------------------------------------------------------------

export interface MissingCoreField {
  key: string
  label: string
}

/**
 * The core fields the user declined for this contract: its capital and — for a
 * contract that is still being paid into — its contribution. Same pair the
 * readiness selector blocks the household total on, so the per-contract note
 * and the plan's reason list can never disagree.
 *
 * Labels are reused from the § 2 provenance list, so one contract's capital is
 * called the same thing on both surfaces.
 */
export function missingCoreFields(
  instance: InstanceCommon,
  productId: ProductId,
): MissingCoreField[] {
  const fields = fieldsFor(productId)
  const keys = ['currentValueEUR']
  if (instance.status !== 'paid_up') keys.push(CONTRIBUTION_FIELD_BY_PRODUCT[productId])

  return keys
    .filter(
      (key) =>
        resolveInputStatus(instance.inputStatus, instance.evidenceMap?.[key], key) ===
        'unknown',
    )
    .map((key) => ({
      key,
      label: fields.find((f) => f.evidenceKey === key)?.label ?? key,
    }))
}
