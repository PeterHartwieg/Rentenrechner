import { useId, type ReactNode } from 'react'

interface Props {
  legend: string
  note: string
  children: ReactNode
}

/**
 * `DProduktSection` — Sober D section wrapper for the new `/eingaben/produkte`
 * compare-mode body. Ported from `direction-d-pages.jsx` L497-523 of the v3
 * design bundle. Renders a top-bordered `<fieldset>` with a left-aligned
 * legend label and right-aligned grey note, plus a vertically-stacked content
 * column for `<DProduktRow>` and `<DSparformOption>` children.
 *
 * **Accessibility (CX-PR3-2):** `<legend>` must be the FIRST direct child of
 * `<fieldset>` per HTML5 + WAI-ARIA to function as the group's accessible
 * name. The visual design requires legend and note to share a flex row, so
 * placing `<legend>` inside the head `<div>` was breaking screen-reader
 * association. We use `aria-labelledby` + a `<span>` (styled identically) so
 * browsers announce the § kicker as the group name while the visual layout is
 * preserved. A raw `<legend>` outside `<fieldset>` is invalid HTML, making
 * `aria-labelledby` the standards-compliant alternative here.
 *
 * Layout is owned by CSS (`ProdukteEingabenPanel.css`); the component carries
 * no inline styles per CLAUDE.md "no new design tokens" + the React port
 * convention used elsewhere in this codebase.
 */
export function DProduktSection({ legend, note, children }: Props) {
  const legendId = useId()
  return (
    <fieldset className="d-produkt-section" aria-labelledby={legendId}>
      <div className="d-produkt-section__head">
        <span id={legendId} className="d-produkt-section__legend">{legend}</span>
        <span className="d-produkt-section__note">{note}</span>
      </div>
      <div className="d-produkt-section__body">{children}</div>
    </fieldset>
  )
}
