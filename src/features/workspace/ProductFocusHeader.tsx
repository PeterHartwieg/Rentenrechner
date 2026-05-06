import type { ProductId } from '../../domain'
import { PRODUCT_FOCUS } from '../../content/productFocus'
import { getProductMeta } from '../../app/productPresentation'
import { useFeedbackTarget } from '../qa-feedback'

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
  const { targetProps: sectionTargetProps } = useFeedbackTarget({
    id: `workspace.productFocus.${productId}`,
    label: `Produkt-Fokus ${productId}`,
    precision: 'section',
  })
  const { targetProps: titleProps } = useFeedbackTarget({
    id: `workspace.productFocus.${productId}.title`,
    label: `Produkt-Fokus Titel ${productId}`,
  })
  const { targetProps: purposeProps } = useFeedbackTarget({
    id: `workspace.productFocus.${productId}.purpose`,
    label: `Produkt-Fokus Zweck ${productId}`,
  })
  const { targetProps: liquidityProps } = useFeedbackTarget({
    id: `workspace.productFocus.${productId}.liquidity`,
    label: `Produkt-Fokus Verfügbarkeit ${productId}`,
  })
  const { targetProps: taxProps } = useFeedbackTarget({
    id: `workspace.productFocus.${productId}.tax`,
    label: `Produkt-Fokus Steuern ${productId}`,
  })
  if (!focus || !meta) return null

  return (
    <aside className="product-focus" aria-label={`${meta.label} — Überblick`} {...sectionTargetProps}>
      <div className="product-focus-bar" style={{ background: meta.color }} aria-hidden />
      <div className="product-focus-body">
        <strong className="product-focus-title" {...titleProps}>{meta.label}</strong>
        <p className="product-focus-line" {...purposeProps}>{focus.purpose}</p>
        <dl className="product-focus-grid">
          <div>
            <dt>Verfügbarkeit</dt>
            <dd {...liquidityProps}>{focus.liquidity}</dd>
          </div>
          <div>
            <dt>Steuern</dt>
            <dd {...taxProps}>{focus.taxLine}</dd>
          </div>
        </dl>
      </div>
    </aside>
  )
}
