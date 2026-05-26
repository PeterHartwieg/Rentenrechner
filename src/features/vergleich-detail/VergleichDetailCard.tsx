import { VergleichDetailCardSection } from './VergleichDetailCardSection'
import { getAvailabilityEntry } from './vergleichDetailAvailability'
import type { VergleichDetailCardData } from './vergleichDetailRows'

interface Props {
  data: VergleichDetailCardData
}

/**
 * One per-product breakdown card on `/vergleich/details` (PR R2 rewrite).
 *
 * Layout per `direction-d-pages.jsx` `DProductBreakdown` + the responsive
 * variants (`TBreakdown` / `MBreakdown` in `responsive-views.jsx`):
 *
 *   - Header: short mono code + long product label, bottom-bordered.
 *   - Three labeled sections (built upstream by
 *     `buildVergleichDetailCardData`):
 *       ANSPARPHASE, PRO MONAT
 *       MIT {retirementAge}, EINMALIG  ← dynamic age
 *       IM ALTER, PRO MONAT
 *   - Footer: `Verfügbar ab: <text>` from `vergleichDetailAvailability.ts`,
 *     mono 11 px, paper-soft background, top-bordered.
 *
 * The component is pure presentation — all values arrive pre-built via
 * `data: VergleichDetailCardData`. The card never reads simulation results
 * or scenario state directly.
 */
export function VergleichDetailCard({ data }: Props) {
  // PR 290 Codex P2: pass the live `insuranceContractStartYear` so the
  // `versicherung` registry entry resolves the correct minimum payout age
  // (pre-2012 contracts → 60, post-2011 → 62 per §52 Abs. 28 Satz 7 EStG).
  // Other products ignore the context — the registry only consults it for
  // `versicherung`. Threading it unconditionally keeps the call site
  // product-agnostic.
  const availability = getAvailabilityEntry(data.productId, {
    insuranceContractStartYear: data.insuranceContractStartYear,
  })

  return (
    <article className="vd-card" data-product={data.productId}>
      <header className="vd-card__head">
        <span className="vd-card__short">{data.shortLabel}</span>
        <h3 className="vd-card__label">{data.label}</h3>
      </header>

      <div className="vd-card__body">
        {data.sections.map((section) => (
          <VergleichDetailCardSection key={section.heading} section={section} />
        ))}
      </div>

      <footer className="vd-card__footer">
        <span className="vd-card__footer-key">Verfügbar ab</span>
        <span className="vd-card__footer-value">{availability.label}</span>
        {availability.note && (
          <p className="vd-card__footer-note">{availability.note}</p>
        )}
      </footer>
    </article>
  )
}
