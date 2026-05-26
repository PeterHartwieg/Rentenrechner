import { formatPercent } from '../../utils/format'
import { DMoneyRow } from './DMoneyRow'
import type { VergleichDetailSection } from './vergleichDetailRows'

interface Props {
  section: VergleichDetailSection
}

/**
 * One labeled section inside a `/vergleich/details` card (PR R2 rewrite).
 *
 * Pure presentation. Layout per `direction-d-pages.jsx` `DProductBreakdown`:
 *
 *   - Section heading: mono uppercase, small (~10 px), `--rw-ink-faint`.
 *     No `§ N` prefix any more — the design treats the three sections
 *     (Ansparphase / Mit {retirementAge} / Im Alter) as labeled bands,
 *     not numbered statutory paragraphs.
 *   - Row body: one `<DMoneyRow>` per row.
 *
 * Per CLAUDE.md "UI rounding boundary": every currency goes through
 * `formatCurrency`; we never round in the data layer. `info` rows that
 * carry a pre-formatted display (e.g. `"1,2 %"`) are forwarded as-is.
 */
export function VergleichDetailCardSection({ section }: Props) {
  return (
    <section className="vd-card-section">
      <header className="vd-card-section__head">
        <span className="vd-card-section__heading">{section.heading}</span>
      </header>
      <div className="vd-card-section__rows">
        {section.rows.map((row, idx) => {
          const isAddSummand = row.kind === 'add' && row.label.startsWith('+')
          const isPlainAdd = row.kind === 'add' && !isAddSummand
          // PR R2 visual mapping per `DMoneyRow` reference (`direction-d-pages.jsx`):
          //   - `add` rows that are "+" summands (e.g. `+ Arbeitgeber`,
          //     `+ Steuerrückerstattung`) render muted to soften the
          //     vertical column of additive labels.
          //   - `add` rows that are leading lines (e.g. `Du selbst`,
          //     `Kapital brutto`, `Brutto-Rente`) render at the default ink.
          //   - `sub` rows always render muted (the leading `−` carries the
          //     deduction emphasis; muting the label colour avoids competing
          //     with the deduction tint on the value).
          //   - `total` rows render bold + border-top. The accent flag
          //     paints the value in oxblood (net-Rente).
          //   - `info` rows are no longer produced by `vergleichDetailRows`
          //     (PR R2 collapsed the Effektivkosten-info row into the
          //     `− Kosten p.a.` label suffix); the branch is kept for
          //     defensive forward-compatibility.
          const muted = isAddSummand || row.kind === 'sub' || row.kind === 'info'
          const bold = row.kind === 'total' || (isPlainAdd && row.label === 'Kapital brutto')
          const border = row.kind === 'total'
          // Stable key — labels are unique within a section by construction
          // (each section's row set is hand-built in vergleichDetailRows.ts).
          const key = `${row.label}-${idx}`

          if (row.kind === 'info') {
            const display = row.display ?? formatPercent(row.value, 2)
            return (
              <DMoneyRow
                key={key}
                label={row.label}
                value={display}
                kind="info"
                muted
                labelSuffix={row.labelSuffix}
              />
            )
          }

          return (
            <DMoneyRow
              key={key}
              label={row.label}
              value={row.value}
              kind={row.kind}
              muted={muted}
              bold={bold}
              border={border}
              accent={row.accent}
              labelSuffix={row.labelSuffix}
            />
          )
        })}
      </div>
    </section>
  )
}
