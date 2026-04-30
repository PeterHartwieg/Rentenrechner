import type { CSSProperties } from 'react'
import type { ProductId } from '../../domain'
import { getProductMeta } from '../../app/productPresentation'
import './ProductTabs.css'

type ProductTabsProps = {
  visible: ProductId[]
  active: ProductId | null
  onChange: (id: ProductId) => void
}

/**
 * Horizontal tab strip for navigating per-product inputs (Idea A).
 *
 * Each tab is colour-coded with the product's manifest color (filled when
 * active, outlined when inactive). Renders nothing when no products are
 * visible — the parent shows a hint instead.
 */
export function ProductTabs({ visible, active, onChange }: ProductTabsProps) {
  if (visible.length === 0) return null

  return (
    <div className="product-tabs" role="tablist" aria-label="Produktdetails">
      {visible.map((id) => {
        const meta = getProductMeta(id)
        if (!meta) return null
        const isActive = id === active
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`product-tab${isActive ? ' product-tab--active' : ''}`}
            style={{ ['--product-color' as string]: meta.color } as CSSProperties}
            onClick={() => onChange(id)}
          >
            {meta.shortLabel}
          </button>
        )
      })}
    </div>
  )
}
