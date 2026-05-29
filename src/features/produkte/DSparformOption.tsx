interface Props {
  /** Product label (left-aligned headline, bold). */
  name: string
  /** Short subtitle / Schicht hint underneath. */
  sub: string
  /** Click handler — usually toggles the product onto `visibleProducts`. */
  onClick?: () => void
}

/**
 * `DSparformOption` — Sober D quick-add tile for the § 3 "Sparformen, die du
 * noch hinzufügen kannst" grid. Ported from `direction-d-pages.jsx` L629-650
 * of the v3 design bundle.
 *
 * Rendered as a real `<button>` (not a `<div>` with `cursor: pointer`) so it
 * picks up keyboard activation (Enter / Space) and announces correctly to AT.
 * `aria-label` repeats the product name + intent ("…hinzufügen") so screen
 * readers don't depend on the subtitle for context.
 */
export function DSparformOption({ name, sub, onClick }: Props) {
  return (
    <button
      type="button"
      className="d-sparform-option"
      onClick={onClick}
      aria-label={`${name} hinzufügen`}
    >
      <span className="d-sparform-option__body">
        <span className="d-sparform-option__name">{name}</span>
        <span className="d-sparform-option__sub">{sub}</span>
      </span>
      <span className="d-sparform-option__plus" aria-hidden="true">+</span>
    </button>
  )
}
