import type { InstanceCommon } from '../../domain/instances'
import type { ProductId } from '../../domain/products/common'
import { evidenceStateToProvKind } from '../results/provenanceHelpers'
import { ProvLabel } from '../results/provenance'

interface Props {
  instance: InstanceCommon
  productId: ProductId
}

/**
 * VertragProvenanceList — § 3 "Wie wir das berechnen" on Vertrag-Detail (PR 7).
 *
 * Lists the input fields flowing into this contract's projection along with
 * their per-field `EvidenceState` (user_confirmed / model_estimate /
 * statement). Each row gets the shared `ProvLabel` pill via
 * `evidenceStateToProvKind`. This is the only surface where the user can
 * see which numbers we trust and which are still model defaults.
 *
 * The field list is product-specific. We dispatch on `ProductId` with an
 * exhaustive switch (`never` default) so a future product can't ship
 * without a curated field list.
 */
export function VertragProvenanceList({ instance, productId }: Props) {
  const fields = fieldsFor(productId)
  const evidence = instance.evidenceMap ?? {}

  return (
    <section className="vertrag-section" aria-labelledby="vertrag-section-provenance">
      <div className="vertrag-section-head">
        <span className="vertrag-section-num">§ 2</span>
        <h2 id="vertrag-section-provenance" className="vertrag-section-title">
          Wie wir das berechnen
        </h2>
      </div>

      <p className="vertrag-provenance-intro">
        Die folgenden Eingaben fließen in die Hochrechnung dieses Vertrags. Werte mit Label{' '}
        <em>Modellwert</em> sind Standard&shy;annahmen, die du noch prüfen kannst; <em>geprüft</em>{' '}
        bedeutet, dass du den Wert bestätigt hast.
      </p>

      <ul className="vertrag-provenance-list">
        {fields.map((field) => {
          const state = evidence[field.evidenceKey]
          const kind = evidenceStateToProvKind(state)
          return (
            <li key={field.evidenceKey} className="vertrag-provenance-row">
              <span className="vertrag-provenance-key">{field.label}</span>
              <span className="vertrag-provenance-pill">
                <ProvLabel
                  isModified={false}
                  isModel={kind === 'model'}
                  isConfirmed={kind === 'confirmed'}
                />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

interface ProvenanceField {
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
 */
function fieldsFor(productId: ProductId): ReadonlyArray<ProvenanceField> {
  switch (productId) {
    case 'etf':
      return [
        { evidenceKey: 'monthlyContribution', label: 'Monatlicher Sparbeitrag' },
        { evidenceKey: 'annualAssetFee', label: 'Laufende Kosten (TER)' },
        { evidenceKey: 'currentValueEUR', label: 'Aktueller Depotwert' },
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
        { evidenceKey: 'guaranteedInterestRate', label: 'Garantiezins' },
      ]
    default: {
      const _exhaustive: never = productId
      void _exhaustive
      return []
    }
  }
}
