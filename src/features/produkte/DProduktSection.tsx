import type { ReactNode } from 'react'

interface Props {
  legend: string
  note: string
  children: ReactNode
}

/**
 * `DProduktSection` — Sober D section wrapper for the new `/eingaben/produkte`
 * compare-mode body. Ported from `direction-d-pages.jsx` L497-523 of the v3
 * design bundle. Renders a top-bordered `<fieldset>` with a left-aligned
 * `<legend>` and right-aligned grey note, plus a vertically-stacked content
 * column for `<DProduktRow>` and `<DSparformOption>` children.
 *
 * Layout is owned by CSS (`ProdukteEingabenPanel.css`); the component carries
 * no inline styles per CLAUDE.md "no new design tokens" + the React port
 * convention used elsewhere in this codebase.
 */
export function DProduktSection({ legend, note, children }: Props) {
  return (
    <fieldset className="d-produkt-section">
      <div className="d-produkt-section__head">
        <legend className="d-produkt-section__legend">{legend}</legend>
        <span className="d-produkt-section__note">{note}</span>
      </div>
      <div className="d-produkt-section__body">{children}</div>
    </fieldset>
  )
}
