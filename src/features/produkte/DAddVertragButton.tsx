interface Props {
  /** Click handler — combine-mode opens the "Vertrag hinzufügen" wizard. */
  onClick?: () => void
}

/**
 * `DAddVertragButton` — dashed-border "+ Vertrag hinzufügen" CTA ported from
 * `direction-d-pages.jsx` L602-627 of the v3 design bundle.
 *
 * **Combine-mode only.** In compare-mode the user does not add concrete
 * contracts; they toggle a `ProductId` on or off via `visibleProducts`, which
 * is exactly what the § 3 `<DSparformOption>` tiles already do. Mounting both
 * a tile grid AND this button would expose two parallel "add" affordances
 * with conflicting mental models. PR 3 therefore omits this button from the
 * compare-mode body — the file exists so PR 4 can mount it when it ports
 * the same panel to combine-mode (`AngabenProduktePage` combine branch).
 *
 * Rendered as a real `<button>` (the bundle's `<div>` with `cursor: pointer`
 * is not keyboard-accessible). The decorative `⌘ + N` hint stays as an
 * `aria-hidden` visual cue — keyboard semantics will be wired in PR 4.
 */
export function DAddVertragButton({ onClick }: Props) {
  return (
    <button
      type="button"
      className="d-add-vertrag-button"
      onClick={onClick}
      aria-label="Vertrag hinzufügen"
    >
      <span className="d-add-vertrag-button__copy">
        <span className="d-add-vertrag-button__title">+ Vertrag hinzufügen</span>
        <span className="d-add-vertrag-button__sub">
          Du wählst die Art, dann fragen wir nur die relevanten Felder ab (10–14,
          je nach Schicht).
        </span>
      </span>
      <span className="d-add-vertrag-button__hint" aria-hidden="true">⌘ + N</span>
    </button>
  )
}
