import type { InstanceCommon } from '../../domain/instances'
import type { ProductId } from '../../domain/products/common'
import type { InputStatus } from '../../domain/inputStatus'
import { inputStatusToProvKind, resolveInputStatus } from '../results/provenanceHelpers'
// Imported for the `.pec-prov` pill styles; the label text comes from the plan vocabulary below.
import '../results/provenance'
import { fieldsFor } from './vertragProvenanceFields'

/**
 * The plan surface and the contract editor say "Von dir angegeben",
 * "Angenommen", "lt. Beleg" and "Unbekannt" for the same four states. The
 * detail page used the older pill vocabulary ("geprüft" / "Modellwert"), so
 * a value entered a minute ago read as "geprüft" here and "Von dir
 * angegeben" on the plan. One vocabulary, same wording as `planSummary.ts`.
 */
function provenanceStatusLabel(status: InputStatus): string {
  switch (status) {
    case 'unknown':
      return 'Unbekannt'
    case 'assumed':
      return 'Angenommen'
    case 'document':
      return 'lt. Beleg'
    default:
      return 'Von dir angegeben'
  }
}

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
        Die folgenden Eingaben fließen in die Hochrechnung dieses Vertrags. <em>Angenommen</em>{' '}
        sind Standard&shy;annahmen, die du noch prüfen kannst; <em>Von dir angegeben</em> hast du
        selbst eingetragen; <em>lt. Beleg</em> stammt aus einem Dokument. <em>Unbekannt</em> heißt,
        dass du hier „weiß ich nicht“ angegeben hast; wir rechnen an dieser Stelle mit der Annahme.
        Dieselben Begriffe stehen auf der Planseite und im Bearbeiten-Formular.
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
                <span className={`pec-prov pec-prov--${inputStatusToProvKind(status)}`}>
                  {provenanceStatusLabel(status)}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
