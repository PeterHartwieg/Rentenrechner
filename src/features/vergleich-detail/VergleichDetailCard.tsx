import { VergleichDetailCardSection } from './VergleichDetailCardSection'
import { getAvailabilityEntry } from './vergleichDetailAvailability'
import type { VergleichDetailCardData } from './vergleichDetailRows'

interface Props {
  data: VergleichDetailCardData
}

/**
 * One per-product breakdown card on `/vergleich/details` (PR 10).
 *
 * Layout:
 *   - Header: short mono code + long product label.
 *   - Three labeled sections (built upstream by `buildVergleichDetailCardData`):
 *       § 1 Ansparphase, pro Monat
 *       § 2 Mit {retirementAge}, einmalig  ← dynamic age
 *       § 3 Im Alter, pro Monat
 *   - Footer: `Verfügbar ab: <text>` from `vergleichDetailAvailability.ts`.
 *
 * The component is pure presentation — all values arrive pre-built via
 * `data: VergleichDetailCardData`. The card never reads simulation results or
 * scenario state directly.
 */
export function VergleichDetailCard({ data }: Props) {
  const availability = getAvailabilityEntry(data.productId)

  return (
    <article className="vd-card" data-product={data.productId}>
      <header className="vd-card__head">
        <span className="vd-card__short">{data.shortLabel}</span>
        <h3 className="vd-card__label">{data.label}</h3>
      </header>

      <div className="vd-card__body">
        {data.sections.map((section, idx) => (
          <VergleichDetailCardSection key={section.heading} section={section} index={idx + 1} />
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
