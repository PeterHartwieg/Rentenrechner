import { formatCurrency, formatPercent } from '../../utils/format'
import type { VergleichDetailSection } from './vergleichDetailRows'

interface Props {
  section: VergleichDetailSection
  /** Section ordinal — drives the `§ N` mono prefix. */
  index: number
}

/**
 * One labeled section inside a `/vergleich/details` card (PR 10).
 *
 * Pure presentation. The row kinds (`add` / `sub` / `total` / `info`) drive
 * the small visual differences:
 *   - `add` rows are plain currency.
 *   - `sub` rows render with a leading `−` glyph + the oxblood-ish soft tint.
 *   - `total` is bold with a `border-top: 1px` and may carry the oxblood accent.
 *   - `info` (Effektivkosten p. a.) renders as a percent ratio via
 *     `formatPercent(value, 2)`.
 *
 * Per CLAUDE.md "UI rounding boundary": every currency goes through
 * `formatCurrency`; we never round in the data layer.
 */
export function VergleichDetailCardSection({ section, index }: Props) {
  return (
    <section className="vd-card-section">
      <header className="vd-card-section__head">
        <span className="vd-card-section__num">§ {index}</span>
        <span className="vd-card-section__heading">{section.heading}</span>
      </header>
      <dl className="vd-card-section__rows">
        {section.rows.map((row, idx) => {
          const rowClass = `vd-card-section__row vd-card-section__row--${row.kind}${
            row.accent ? ' vd-card-section__row--accent' : ''
          }`
          // Stable key — labels are unique within a section by construction
          // (each section's row set is hand-built in vergleichDetailRows.ts).
          // Fall back to the index for the degenerate case.
          const key = `${row.label}-${idx}`
          return (
            <div key={key} className={rowClass}>
              <dt className="vd-card-section__label">{row.label}</dt>
              <dd className="vd-card-section__value">{formatRowValue(row)}</dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

function formatRowValue(row: VergleichDetailSection['rows'][number]): string {
  if (row.kind === 'info') {
    return row.display ?? formatPercent(row.value, 2)
  }
  if (row.kind === 'sub') {
    return `− ${formatCurrency(row.value, 0)}`
  }
  return formatCurrency(row.value, 0)
}
