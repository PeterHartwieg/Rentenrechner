import type { InstanceCommon } from '../../domain/instances'
import type { ProductId } from '../../domain/products/common'
import { inputStatusToProvKind, resolveInputStatus } from '../results/provenanceHelpers'
import { ProvKindLabel } from '../results/provenance'
import { fieldsFor } from './vertragProvenanceFields'

interface Props {
  instance: InstanceCommon
  productId: ProductId
}

/**
 * VertragProvenanceList — § 3 "Wie wir das berechnen" on Vertrag-Detail (PR 7).
 *
 * Lists the input fields flowing into this contract's projection along with
 * their resolved `InputStatus`. The status comes from `resolveInputStatus`,
 * so an explicit "weiß ich nicht" (`inputStatus`) wins over the older
 * `evidenceMap` signal and renders as "Unbekannt" instead of the misleading
 * "Standardwert" the evidence-only path produced. This is the only surface
 * where the user can see which numbers we trust and which are still model
 * defaults — or missing entirely.
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
        bedeutet, dass du den Wert bestätigt hast. <em>Unbekannt</em> heißt, dass du hier
        „weiß ich nicht“ angegeben hast — wir rechnen an dieser Stelle mit dem Modellwert.
      </p>

      <ul className="vertrag-provenance-list">
        {fields.map((field) => {
          const status = resolveInputStatus(
            instance.inputStatus,
            evidence[field.evidenceKey],
            field.evidenceKey,
          )
          return (
            <li key={field.evidenceKey} className="vertrag-provenance-row">
              <span className="vertrag-provenance-key">{field.label}</span>
              <span className="vertrag-provenance-pill">
                <ProvKindLabel kind={inputStatusToProvKind(status)} />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
