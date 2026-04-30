import type { ProductId } from '../../domain'
import { PRODUCT_FOCUS } from '../../content/productFocus'
import { getProductMeta } from '../../app/productPresentation'

interface Props {
  productId: ProductId
}

/**
 * UX10: small focus block placed above each product input section in the
 * Angebot eingeben view. Summarises purpose, liquidity, and tax treatment in
 * plain language so the user knows why this product is in their comparison
 * before editing its inputs.
 */
export function ProductFocusHeader({ productId }: Props) {
  const focus = PRODUCT_FOCUS[productId]
  const meta = getProductMeta(productId)
  if (!focus || !meta) return null

  return (
    <aside className="product-focus" aria-label={`${meta.label} — Überblick`}>
      <div className="product-focus-bar" style={{ background: meta.color }} aria-hidden />
      <div className="product-focus-body">
        <strong className="product-focus-title">{meta.label}</strong>
        <p className="product-focus-line">{focus.purpose}</p>
        <dl className="product-focus-grid">
          <div>
            <dt>Verfügbarkeit</dt>
            <dd>{focus.liquidity}</dd>
          </div>
          <div>
            <dt>Steuern</dt>
            <dd>{focus.taxLine}</dd>
          </div>
        </dl>
      </div>
    </aside>
  )
}
