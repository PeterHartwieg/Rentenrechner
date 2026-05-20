import { useViewport } from '../../ui/chrome/useViewport'
import { formatCurrency, formatPercent } from '../../utils/format'
import { productTaglines } from './productTaglines'
import type { VergleichTableRow } from './vergleichRows'

interface Props {
  rows: ReadonlyArray<VergleichTableRow>
  /** User's configured retirement age — used for the "Kapital mit N" column label. */
  retirementAge: number
}

/**
 * Vergleich 6-product comparison table (PR 9).
 *
 * Desktop / tablet: 6-column table — Sparform | Wie es funktioniert |
 * Kapital mit 67 | Kosten p.a. | Brutto-Rente | Abzüge | Netto/Monat.
 * Phone: vertical product cards with the same fields as label/value pairs
 * (mirrors `KapitalWendepunkteTable` and `MVergleich` from the responsive
 * artboard).
 *
 * Neutral: no winner highlight, no sorting by netto, no ranking badges.
 * The bar inside the netto cell is a visual aid only, scaled to the row
 * with the highest net payout in the current set.
 */
export function VergleichComparisonTable({ rows, retirementAge }: Props) {
  const viewport = useViewport()

  if (rows.length === 0) {
    return null
  }

  const maxNet = Math.max(1, ...rows.map((r) => r.netMonthlyPayout))

  if (viewport === 'phone') {
    return (
      <ul className="vergleich-product-cards" aria-label="Produktvergleich">
        {rows.map((row) => (
          <ProductCard key={row.productId} row={row} maxNet={maxNet} retirementAge={retirementAge} />
        ))}
      </ul>
    )
  }

  return (
    <table className="vergleich-comparison-table" aria-label="Produktvergleich">
      <thead>
        <tr>
          <th scope="col">Sparform</th>
          <th scope="col" className="vergleich-col-tagline">Wie es funktioniert</th>
          <th scope="col" className="vergleich-cell--num">{`Kapital mit ${retirementAge}`}</th>
          <th scope="col" className="vergleich-cell--num">Kosten p. a.</th>
          <th scope="col" className="vergleich-cell--num">Brutto-Rente</th>
          <th scope="col" className="vergleich-cell--num">Abzüge</th>
          <th scope="col" className="vergleich-cell--num">Netto pro Monat</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.productId}>
            <td>
              <div className="vergleich-cell-product">
                <span className="vergleich-cell-product__name">{row.label}</span>
                <span className="vergleich-cell-product__short">{row.shortLabel}</span>
              </div>
            </td>
            <td className="vergleich-cell-tagline vergleich-col-tagline">{productTaglines[row.productId]}</td>
            <td className="vergleich-cell--num">{formatCurrency(row.capitalAtRetirement, 0)}</td>
            <td className="vergleich-cell--num">{formatPercent(row.effectiveAnnualCost, 2)}</td>
            <td className="vergleich-cell--num">{formatCurrency(row.grossMonthlyPayout, 0)}</td>
            <td className="vergleich-cell--num vergleich-cell--abzuege">
              −{formatCurrency(row.deductionsMonthly, 0)}
            </td>
            <td className="vergleich-cell--num">
              <div className="vergleich-cell-netto">
                <span className="vergleich-cell-netto__value">{formatCurrency(row.netMonthlyPayout, 0)}</span>
                <span className="vergleich-cell-netto__bar" aria-hidden="true">
                  <span
                    className="vergleich-cell-netto__bar-fill"
                    style={{ width: `${(row.netMonthlyPayout / maxNet) * 100}%` }}
                  />
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface CardProps {
  row: VergleichTableRow
  maxNet: number
  retirementAge: number
}

function ProductCard({ row, maxNet, retirementAge }: CardProps) {
  return (
    <li className="vergleich-product-card" data-product={row.productId}>
      <div className="vergleich-product-card__head">
        <div>
          <div className="vergleich-product-card__name">{row.label}</div>
          <div className="vergleich-product-card__short">{row.shortLabel}</div>
        </div>
        <div>
          <div className="vergleich-product-card__netto">{formatCurrency(row.netMonthlyPayout, 0)}</div>
        </div>
      </div>
      <div className="vergleich-product-card__bar" aria-hidden="true">
        <div
          className="vergleich-product-card__bar-fill"
          style={{ width: `${(row.netMonthlyPayout / maxNet) * 100}%` }}
        />
      </div>
      <p className="vergleich-product-card__tagline">{productTaglines[row.productId]}</p>
      <dl className="vergleich-product-card__grid">
        <div>
          <dt>{`Kapital mit ${retirementAge}`}</dt>
          <dd>{formatCurrency(row.capitalAtRetirement, 0)}</dd>
        </div>
        <div>
          <dt>Kosten p. a.</dt>
          <dd>{formatPercent(row.effectiveAnnualCost, 2)}</dd>
        </div>
        <div>
          <dt>Brutto-Rente</dt>
          <dd>{formatCurrency(row.grossMonthlyPayout, 0)}</dd>
        </div>
        <div>
          <dt>Abzüge</dt>
          <dd className="vergleich-cell--abzuege">−{formatCurrency(row.deductionsMonthly, 0)}</dd>
        </div>
      </dl>
    </li>
  )
}
