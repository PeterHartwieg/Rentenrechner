import { useState } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { ProductId } from '../../domain'
import { PRODUCT_MANIFEST } from '../../app/productPresentation'

/**
 * UX10: replaces the old ProductVisibilityChips. Frames the chips as an explicit
 * "Vergleich zusammenstellen" step instead of a hide/show toggle, with a
 * recommended baseline (ETF + bAV + pAV) on the primary row and the rest of the
 * products behind a "Weitere Produkte" disclosure.
 *
 * Min-one-product enforcement and the chip styling match the old chips.
 */

const PRIMARY_IDS: readonly ProductId[] = ['etf', 'bav', 'versicherung'] as const
const SECONDARY_IDS: readonly ProductId[] = ['basisrente', 'altersvorsorgedepot', 'riester'] as const

interface Props {
  visible: ProductId[]
  onChange: (next: ProductId[]) => void
  /** Heading override per host view (e.g. "Welche Produkte vergleichst du?" in Angebot view). */
  heading?: string
  /** Hint copy override. */
  hint?: string
}

export function ComparisonPicker({
  visible,
  onChange,
  heading = 'Vergleich zusammenstellen',
  hint = 'Wähle ein bis drei Produkte für den Vergleich. ETF + bAV ist die häufigste Kombination.',
}: Props) {
  const visibleSet = new Set(visible)
  const anySecondaryActive = SECONDARY_IDS.some((id) => visibleSet.has(id))
  const [showSecondary, setShowSecondary] = useState<boolean>(anySecondaryActive)

  function toggle(id: ProductId) {
    const next = new Set(visible)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onChange([...next])
  }

  function renderChip(id: ProductId) {
    const meta = PRODUCT_MANIFEST.find((m) => m.id === id)
    if (!meta) return null
    const isOn = visibleSet.has(id)
    return (
      <button
        key={id}
        type="button"
        className={`product-chip${isOn ? ' on' : ''}`}
        style={isOn ? { borderColor: meta.color, color: meta.color } : undefined}
        onClick={() => toggle(id)}
        aria-pressed={isOn}
        title={isOn ? `${meta.label} aus dem Vergleich entfernen` : `${meta.label} zum Vergleich hinzufügen`}
      >
        <span className="product-chip-dot" style={{ background: meta.color }} aria-hidden />
        <span>{meta.shortLabel}</span>
        {isOn && <Check size={12} aria-hidden="true" />}
      </button>
    )
  }

  const secondaryActiveCount = SECONDARY_IDS.filter((id) => visibleSet.has(id)).length

  return (
    <section className="comparison-picker" aria-label="Vergleich zusammenstellen">
      <div className="comparison-picker-header">
        <h3>{heading}</h3>
        <p className="comparison-picker-hint">{hint}</p>
      </div>

      <div className="product-chips-row" role="group" aria-label="Hauptauswahl">
        {PRIMARY_IDS.map((id) => renderChip(id))}
      </div>

      <button
        type="button"
        className="comparison-picker-expander"
        onClick={() => setShowSecondary((v) => !v)}
        aria-expanded={showSecondary}
      >
        {showSecondary ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        <span>
          {showSecondary
            ? 'Weitere Produkte ausblenden'
            : `Weitere Produkte anzeigen${secondaryActiveCount > 0 ? ` (${secondaryActiveCount} aktiv)` : ''}`}
        </span>
      </button>

      {showSecondary && (
        <div className="product-chips-row product-chips-row--secondary" role="group" aria-label="Weitere Produkte">
          {SECONDARY_IDS.map((id) => renderChip(id))}
        </div>
      )}
    </section>
  )
}
