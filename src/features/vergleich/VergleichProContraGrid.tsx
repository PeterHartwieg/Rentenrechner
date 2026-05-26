import type { ProductId } from '../../domain'
import { getProductMeta } from '../../engine/productRegistry'
import { proContraCopy } from '../../content/proContraCopy'

interface Props {
  /** Product ids to render, in the desired display order. */
  products: ReadonlyArray<ProductId>
}

/**
 * Vergleich pro/contra grid (R1 rewrite).
 *
 * Six narrow cards (PRO / CONTRA pair per product), arranged 3-wide on
 * desktop (per Decision A — 3 across × 2 rows), 2-wide on tablet, 1-col on
 * phone. The grid uses `align-items: stretch` (default for `display: grid`)
 * so both desktop rows pad to the same height — long contra text on one
 * card no longer leaves a sibling card looking truncated.
 *
 * Copy lives in `src/content/proContraCopy.ts`; this component is pure
 * presentation. Neutral: no winner highlight, no "recommended" framing,
 * CONTRA label rendered in `var(--rw-accent)` so the trade-off side reads
 * with a deliberate visual weight without crowning a side.
 */
export function VergleichProContraGrid({ products }: Props) {
  if (products.length === 0) return null
  return (
    <div className="vergleich-pro-contra-grid">
      {products.map((productId) => {
        const meta = getProductMeta(productId)
        const copy = proContraCopy[productId]
        if (!meta || !copy) return null
        return (
          <article key={productId} className="vergleich-pro-contra-card" data-product={productId}>
            <div className="vergleich-pro-contra-card__short">{meta.shortLabel}</div>
            <div className="vergleich-pro-contra-card__body">
              <p className="vergleich-pro-contra-card__row vergleich-pro-contra-card__row--pro">
                <strong>PRO</strong>
                <br />
                {copy.pro}
              </p>
              <p className="vergleich-pro-contra-card__row vergleich-pro-contra-card__row--contra">
                <strong>CONTRA</strong>
                <br />
                {copy.contra}
              </p>
            </div>
          </article>
        )
      })}
    </div>
  )
}
