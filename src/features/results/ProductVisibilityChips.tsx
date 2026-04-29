import './ProductVisibilityChips.css'
import { Check } from 'lucide-react'
import type { ProductId } from '../../domain'
import { PRODUCT_MANIFEST } from '../../app/productPresentation'

interface Props {
  visible: ProductId[]
  onChange: (next: ProductId[]) => void
}

export function ProductVisibilityChips({ visible, onChange }: Props) {
  const visibleSet = new Set(visible)

  function toggle(id: ProductId) {
    const next = new Set(visible)
    if (next.has(id)) {
      // Prevent emptying the comparison: keep at least one product visible.
      if (next.size <= 1) return
      next.delete(id)
    } else {
      next.add(id)
    }
    onChange([...next])
  }

  return (
    <section className="product-chips" aria-label="Produkte im Vergleich">
      <h3>Produkte im Vergleich</h3>
      <p className="product-chips-hint">
        Wähle, welche Produkte in Charts, Tabelle und Export angezeigt werden. Mindestens
        eines bleibt sichtbar.
      </p>
      <div className="product-chips-row" role="group">
        {PRODUCT_MANIFEST.map((meta) => {
          const isOn = visibleSet.has(meta.id)
          const disabled = isOn && visibleSet.size <= 1
          return (
            <button
              key={meta.id}
              type="button"
              className={`product-chip${isOn ? ' on' : ''}`}
              style={isOn ? { borderColor: meta.color, color: meta.color } : undefined}
              onClick={() => toggle(meta.id)}
              aria-pressed={isOn}
              disabled={disabled}
              title={
                disabled
                  ? 'Mindestens ein Produkt muss sichtbar bleiben.'
                  : isOn
                    ? `${meta.label} ausblenden`
                    : `${meta.label} einblenden`
              }
            >
              <span className="product-chip-dot" style={{ background: meta.color }} aria-hidden />
              <span>{meta.shortLabel}</span>
              {isOn && <Check size={12} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}
