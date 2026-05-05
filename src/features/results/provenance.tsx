import type { ReactNode } from 'react'

/**
 * Provenance primitives used by `ProductEditCards` and reusable by Group G's
 * inventory cards to surface contract-evidence states (model estimate vs.
 * default vs. user-confirmed vs. user-overridden).
 *
 * Kept in a small focused file so the same vocabulary is shared between the
 * result-side mini-edit cards (today) and the inventory-side cards (Group G).
 *
 * ## Shared confidence vocabulary (issue 13)
 *
 * The domain-to-display mapping lives in `provenanceHelpers.ts` (pure, no React)
 * so it can be imported from non-component files without violating the
 * react-refresh/only-export-components ESLint rule:
 *
 *   - `evidenceStateToProvKind` — maps EvidenceState → ProvKind for all
 *     UI surfaces that render a provenance pill.
 *   - `formatEvidenceStateForExport` — maps EvidenceState → German label
 *     for CSV/PDF exports.
 *
 * `ProvKind` is the display-layer representation used by `ProvLabel`:
 *   - `'user'`      — user explicitly modified the field away from default.
 *   - `'confirmed'` — user confirmed (or statement) without modifying.
 *   - `'model'`     — model estimate, not yet reviewed.
 *   - `'default'`   — system default, no evidence at all.
 */

export type ProvKind = 'user' | 'default' | 'model' | 'confirmed'

export function ProvLabel({
  isModified,
  isModel = false,
  isConfirmed = false,
}: {
  isModified: boolean
  isModel?: boolean
  isConfirmed?: boolean
}) {
  const kind: ProvKind = isModified
    ? 'user'
    : isConfirmed
      ? 'confirmed'
      : isModel
        ? 'model'
        : 'default'
  const label =
    kind === 'user'
      ? 'von dir'
      : kind === 'confirmed'
        ? 'geprüft'
        : kind === 'model'
          ? 'Modellwert'
          : 'Standardwert'
  return <span className={`pec-prov pec-prov--${kind}`}>{label}</span>
}

interface FieldWithProvProps {
  modified: boolean
  isModel?: boolean
  isConfirmed?: boolean
  /**
   * When provided, renders a "Wert stimmt" / "↺ als Schätzwert" toggle next to
   * the provenance pill. The toggle only appears for model fields whose value
   * still equals the default (user-typed values are already "von dir").
   */
  onConfirmToggle?: () => void
  children: ReactNode
}

export function FieldWithProv({
  modified,
  isModel = false,
  isConfirmed = false,
  onConfirmToggle,
  children,
}: FieldWithProvProps) {
  const showConfirmAction = isModel && !modified && onConfirmToggle !== undefined
  return (
    <div className={`pec-field-row${modified ? ' pec-field-row--modified' : ''}`}>
      {children}
      <div className="pec-field-meta">
        <ProvLabel
          isModified={modified}
          isModel={isModel}
          isConfirmed={isConfirmed && !modified}
        />
        {showConfirmAction && (
          <button
            type="button"
            className="pec-confirm-btn"
            onClick={onConfirmToggle}
            title={
              isConfirmed
                ? 'Wieder als Schätzwert markieren'
                : 'Wert stimmt mit deinem Angebot — als geprüft markieren'
            }
          >
            {isConfirmed ? '↺ als Schätzwert' : '✓ Wert stimmt'}
          </button>
        )}
      </div>
    </div>
  )
}
