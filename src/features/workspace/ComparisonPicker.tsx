import { useState } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { ProductId } from '../../domain'
import { PRODUCT_MANIFEST } from '../../app/productPresentation'
import { PRIMARY_PRODUCT_IDS, SECONDARY_PRODUCT_IDS } from '../../content/triggers'
import { useFeedbackTarget, qaTarget, useQaMode } from '../qa-feedback'

/**
 * UX10: replaces the old ProductVisibilityChips. Frames the chips as an explicit
 * "Vergleich zusammenstellen" step instead of a hide/show toggle, with a
 * recommended baseline (ETF + bAV + pAV) on the primary row and the rest of the
 * products behind a "Weitere Produkte" disclosure.
 *
 * Primary/secondary groupings live in `src/content/triggers.ts`.
 */

interface Props {
  visible: ProductId[]
  onChange: (next: ProductId[]) => void
  /** Heading override per host view (e.g. "Welche Produkte vergleichst du?" in Angebot view). */
  heading?: string
}

export function ComparisonPicker({
  visible,
  onChange,
  heading = 'Vergleich zusammenstellen',
}: Props) {
  const visibleSet = new Set(visible)
  const anySecondaryActive = SECONDARY_PRODUCT_IDS.some((id) => visibleSet.has(id))
  const [showSecondary, setShowSecondary] = useState<boolean>(anySecondaryActive)
  const { enabled: qaEnabled } = useQaMode()
  const { targetProps: sectionTargetProps } = useFeedbackTarget({
    id: 'workspace.comparisonPicker.section',
    label: 'Vergleich zusammenstellen',
    precision: 'section',
  })
  const { targetProps: headingProps } = useFeedbackTarget({
    id: 'workspace.comparisonPicker.heading',
    label: 'Vergleich-Picker Überschrift',
  })
  const { targetProps: expanderProps } = useFeedbackTarget({
    id: 'workspace.comparisonPicker.expander',
    label: 'Weitere Produkte ein-/ausblenden',
  })

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
        {...qaTarget(qaEnabled, `workspace.comparisonPicker.chip.${id}`, { label: `Chip ${meta.label}` })}
      >
        <span className="product-chip-dot" style={{ background: meta.color }} aria-hidden />
        <span>{meta.shortLabel}</span>
        {isOn && <Check size={12} aria-hidden="true" />}
      </button>
    )
  }

  const secondaryActiveCount = SECONDARY_PRODUCT_IDS.filter((id) => visibleSet.has(id)).length

  return (
    <section className="comparison-picker" aria-label="Vergleich zusammenstellen" {...sectionTargetProps}>
      <div className="comparison-picker-header">
        <h3 {...headingProps}>{heading}</h3>
      </div>

      <div className="product-chips-row" role="group" aria-label="Hauptauswahl">
        {PRIMARY_PRODUCT_IDS.map((id) => renderChip(id))}
      </div>

      <button
        type="button"
        className="comparison-picker-expander"
        onClick={() => setShowSecondary((v) => !v)}
        aria-expanded={showSecondary}
        {...expanderProps}
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
          {SECONDARY_PRODUCT_IDS.map((id) => renderChip(id))}
        </div>
      )}
    </section>
  )
}
