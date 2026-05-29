import type { ReactNode } from 'react'

export interface ProduktRowField {
  /** Display key (left column, label-soft colour). */
  key: string
  /** Display value (right column, mono font). Already-formatted string. */
  value: string
}

interface Props {
  /** Mono kicker label above the title (e.g. "ETF-Sparplan · Schicht 3"). */
  kind: string
  /** Headline. May contain a non-breaking space character. */
  title: string
  /** Field rows shown in a 2-col grid with dotted underlines. */
  fields: readonly ProduktRowField[]
  /** Status badge top-right (uppercase mono, bordered). */
  status?: string
  /** Optional italic accent line below the fields. */
  accent?: ReactNode
  /** Primary CTA label (right sidebar, paper background). */
  primary: string
  /** Primary CTA click handler. */
  onPrimary?: () => void
  /** Optional secondary CTA label. */
  secondary?: string
  /** Secondary CTA click handler. */
  onSecondary?: () => void
  /** When true, the secondary CTA is rendered as destructive (accent ink). */
  destructive?: boolean
  /** Disable the primary CTA and prevent its clicks. The secondary CTA is
   *  unaffected (e.g. DRV card keeps "Manuell überschreiben" clickable). */
  primaryDisabled?: boolean
  /** Tooltip for the primary button (e.g. when disabled). */
  primaryTitle?: string
}

/**
 * `DProduktRow` — Sober D contract / DRV card for the new `/eingaben/produkte`
 * compare-mode body. Ported from `direction-d-pages.jsx` L525-600 of the v3
 * design bundle.
 *
 * IMPORTANT: the bundle's implementation uses `dangerouslySetInnerHTML` on the
 * title because the source string contains a `&nbsp;` HTML entity. In React
 * we receive the title as a plain string with the literal non-breaking space
 * character (`' '`), so we can render it inside a normal `<div>` — no
 * sanitisation hazard and no XSS surface.
 *
 * Layout (CSS-driven, no inline styles): 2-col grid `1fr 240px`. Left card
 * carries the kind kicker, status badge, title, 2-col field grid with
 * dotted-underline rows, and an optional italic accent line. Right sidebar
 * (paper background, left border) carries a short caption + primary CTA +
 * optional secondary CTA (destructive variant uses accent colour).
 */
export function DProduktRow({
  kind,
  title,
  fields,
  status,
  accent,
  primary,
  onPrimary,
  secondary,
  onSecondary,
  destructive,
  primaryDisabled,
  primaryTitle,
}: Props) {
  return (
    <div className="d-produkt-row">
      <div className="d-produkt-row__main">
        <div className="d-produkt-row__topline">
          <span className="d-produkt-row__kind">{kind}</span>
          {status && <span className="d-produkt-row__status">{status}</span>}
        </div>
        <div className="d-produkt-row__title">{title}</div>
        <div className="d-produkt-row__fields">
          {fields.map((field) => (
            <div key={field.key} className="d-produkt-row__field">
              <span className="d-produkt-row__field-key">{field.key}</span>
              <span className="d-produkt-row__field-val">{field.value}</span>
            </div>
          ))}
        </div>
        {accent && <div className="d-produkt-row__accent">{accent}</div>}
      </div>
      <div className="d-produkt-row__aside">
        <div className="d-produkt-row__aside-copy">
          Diese Werte fließen direkt in dein Mein-Plan-Ergebnis ein.
        </div>
        <div className="d-produkt-row__aside-actions">
          <button
            type="button"
            className="d-produkt-row__btn d-produkt-row__btn--primary"
            onClick={onPrimary}
            disabled={primaryDisabled}
            title={primaryTitle}
          >
            {primary}
          </button>
          {secondary && (
            <button
              type="button"
              className={
                destructive
                  ? 'd-produkt-row__btn d-produkt-row__btn--secondary d-produkt-row__btn--destructive'
                  : 'd-produkt-row__btn d-produkt-row__btn--secondary'
              }
              onClick={onSecondary}
            >
              {secondary}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
