import { useViewport } from '../../ui/chrome/useViewport'
import { formatCurrency } from '../../utils/format'
import type { WendepunktRow } from './wendepunkte'

interface Props {
  rows: WendepunktRow[]
}

/**
 * Wendepunkte table for the `/kapital` page (PR 8).
 *
 * Desktop / tablet: 5-column table (Alter / Ereignis / Kapital / Eingezahlt
 * / Ausgezahlt). Phone: vertical row blocks, label/value pairs — matches
 * the mobile artboard (`MKapital`'s grid-of-three condensed form).
 *
 * The table is the metadata surface for the page (there is no right-rail
 * aside on /kapital — see the PR 8 design notes for the deviation from the
 * usual RightRailAccordion pattern).
 */
export function KapitalWendepunkteTable({ rows }: Props) {
  const viewport = useViewport()

  if (rows.length === 0) {
    return (
      <p className="kapital-empty">
        Keine Wendepunkte verfügbar — wähle einen Vertrag oder eine Produktgruppe aus.
      </p>
    )
  }

  if (viewport === 'phone') {
    return (
      <ul className="kapital-wendepunkte-list" aria-label="Wendepunkte im Verlauf">
        {rows.map((row) => (
          <li key={row.kind} className="kapital-wendepunkte-card" data-row={row.kind}>
            <div className="kapital-wendepunkte-card-head">
              <span className="kapital-wendepunkte-card-age">{formatAge(row.age)}</span>
              <span className="kapital-wendepunkte-card-label">{row.label}</span>
            </div>
            <dl className="kapital-wendepunkte-card-grid">
              <div>
                <dt>Kapital</dt>
                <dd>{formatEUR(row.capital)}</dd>
              </div>
              <div>
                <dt>Eingezahlt</dt>
                <dd>{formatEUR(row.paidIn)}</dd>
              </div>
              <div>
                <dt>Ausgezahlt</dt>
                <dd>{formatEUR(row.payout)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <table className="kapital-wendepunkte-table">
      <thead>
        <tr>
          <th scope="col" className="kapital-wendepunkte-age">Alter</th>
          <th scope="col">Ereignis</th>
          <th scope="col" className="kapital-num">Kapital</th>
          <th scope="col" className="kapital-num">Eingezahlt</th>
          <th scope="col" className="kapital-num">Ausgezahlt</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.kind} data-row={row.kind}>
            <td className="kapital-wendepunkte-age">{formatAge(row.age)}</td>
            <td>{row.label}</td>
            <td className="kapital-num">{formatEUR(row.capital)}</td>
            <td className="kapital-num">{formatEUR(row.paidIn)}</td>
            <td className="kapital-num">{formatEUR(row.payout)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Format an age cell. `null` (not applicable / not reached) → `–`. */
function formatAge(age: number | null): string {
  if (age === null) return '–'
  return String(age)
}

/**
 * Format a EUR amount for the table. `null` (no data) → `–`; otherwise
 * delegates to `formatCurrency` with 0 decimals (matches the rest of the
 * Sober D mono numerals).
 */
function formatEUR(value: number | null): string {
  if (value === null) return '–'
  return formatCurrency(value, 0)
}
