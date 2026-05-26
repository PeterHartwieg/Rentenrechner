import { formatCurrency } from '../../utils/format'

/**
 * Row kind drives the small visual differences inside a Vergleich-Detail
 * card section. See `direction-d-pages.jsx` `DMoneyRow` for the canvas
 * reference; the `kind` discriminant maps 1:1 onto the four states that
 * carry distinct typography or rule treatment.
 *
 *   - `'add'`   plain currency, ink-soft label, ink value.
 *   - `'sub'`   deduction (rendered with a leading `−`), ink-soft label
 *               + ink-soft value tinted via `--rw-accent` derived colour.
 *   - `'total'` bold border-top row (`= effektiv investiert`, `= Netto-Rente`).
 *               Pair with `accent` for the net-Rente line (oxblood).
 *   - `'info'`  non-monetary annotation; value is rendered verbatim from
 *               the `value` string prop (caller pre-formats — typically a
 *               percentage via `formatPercent`).
 */
export type DMoneyRowKind = 'add' | 'sub' | 'total' | 'info'

interface Props {
  /** German label, e.g. `"Du selbst"`. The leading `+` / `−` is part of
   * the label (no auto-prepending), so the row component stays purely
   * presentational. */
  label: string
  /**
   * Monetary value. When numeric, the component formats via
   * `formatCurrency(value, 0)`; `sub` kinds also prepend `"− "`. Pass a
   * pre-formatted string for `info` rows or any caller-controlled display.
   */
  value: number | string
  /** Visual kind — see `DMoneyRowKind`. */
  kind: DMoneyRowKind
  /** Soft-ink label rendering (Sober D `inkSoft`). */
  muted?: boolean
  /** Bold label + value rendering. */
  bold?: boolean
  /** `border-top: 1px solid var(--rw-rule)` + extra top padding. Pair with
   * `bold` for the `= effektiv investiert` / `= Netto-Rente` close-rows. */
  border?: boolean
  /** Oxblood `--rw-accent` value (net-Rente close-row). */
  accent?: boolean
  /** Optional label suffix appended after the label text (e.g. cost rate
   * `"(1,2 % p.a.)"`) so the row stays one numeric formatter. */
  labelSuffix?: string
}

/**
 * `DMoneyRow` — primitive row inside a `/vergleich/details` card section
 * (PR R2). One per money-line. Pure presentation; the caller (typically
 * `VergleichDetailCardSection`) decides which prop combinations apply.
 *
 * UI rounding boundary: numeric values are formatted via
 * `formatCurrency(value, 0)`. Pre-formatted strings (e.g. percentages from
 * `formatPercent`) are passed through verbatim — never `Number.toFixed`
 * in JSX (per CLAUDE.md "UI rounding boundary").
 */
export function DMoneyRow({
  label,
  value,
  kind,
  muted,
  bold,
  border,
  accent,
  labelSuffix,
}: Props) {
  const classNames = [
    'vd-money-row',
    `vd-money-row--${kind}`,
    muted ? 'vd-money-row--muted' : '',
    bold ? 'vd-money-row--bold' : '',
    border ? 'vd-money-row--border' : '',
    accent ? 'vd-money-row--accent' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classNames}>
      <span className="vd-money-row__label">
        {label}
        {labelSuffix ? <span className="vd-money-row__label-suffix"> {labelSuffix}</span> : null}
      </span>
      <span className="vd-money-row__value">{formatValue(value, kind)}</span>
    </div>
  )
}

function formatValue(value: number | string, kind: DMoneyRowKind): string {
  if (typeof value === 'string') return value
  if (kind === 'sub') return `− ${formatCurrency(value, 0)}`
  return formatCurrency(value, 0)
}
