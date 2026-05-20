import type { ProductId } from '../../domain'
import { getProductMeta } from '../../engine/productRegistry'
import { proContraCopy } from '../../content/proContraCopy'

interface Props {
  /** Product ids to render, in the desired display order. */
  products: ReadonlyArray<ProductId>
}

/**
 * Vergleich pro/contra grid (PR 9).
 *
 * Six narrow cards (PRO / CONTRA pair per product), arranged 3-wide on
 * desktop → 2-wide on tablet → 1-col on phone. Copy lives in
 * `src/content/proContraCopy.ts`; this component is presentation only.
 *
 * Neutral: no winner highlight, no recommendation copy. Mirrors the
 * Sober artboard's pro/contra section (`direction-d.jsx` `dProsCons` block).
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
