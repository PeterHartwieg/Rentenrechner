import './SensitivityPanel.css'
import { Fragment, useMemo } from 'react'
import type { ProductId, PersonalProfile, ScenarioAssumptions } from '../../domain'
import { de2026Rules } from '../../rules/de2026'
import { getProductMeta } from '../../app/productPresentation'
import { runSensitivity, type RobustnessBadge, type SensitivityRunResult } from './sensitivity'

interface Props {
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  visibleProducts: ProductId[]
  /** Optional precomputed result — when provided, the panel skips its own simulation. */
  precomputed?: SensitivityRunResult
}

const BADGE_LABEL: Record<RobustnessBadge, string> = {
  robust: 'robust',
  knapp: 'knapp',
  annahmenabhaengig: 'annahmenabhängig',
}

function ProductPill({
  productId,
  changed,
}: {
  productId: ProductId | null
  changed?: boolean
}) {
  if (!productId) return <span className="product-pill">—</span>
  const meta = getProductMeta(productId)
  return (
    <span className={`product-pill${changed ? ' changed' : ''}`}>
      <span className="pill-dot" style={{ background: meta?.color ?? '#94a3b8' }} aria-hidden />
      {meta?.shortLabel ?? productId}
    </span>
  )
}

export function SensitivityPanel({ profile, assumptions, visibleProducts, precomputed }: Props) {
  // Re-running 9 simulations is non-trivial — memoize on the inputs that matter.
  // When App.tsx already computed it (so DecisionSummary can render the personalised
  // caveat from the same data), reuse that result.
  const result = useMemo(
    () =>
      precomputed ??
      runSensitivity({ profile, assumptions, rules: de2026Rules, visibleProducts }),
    [precomputed, profile, assumptions, visibleProducts],
  )

  if (visibleProducts.length === 0) return null

  const baselineCapital = result.baseline.winnerCapital
  const baselinePension = result.baseline.winnerPension

  return (
    <section className="sensitivity-panel" aria-label="Was müsste sich ändern?">
      <header>
        <h3>Was müsste sich ändern?</h3>
        <p>
          Einzelschritt-Tests pro Annahme. Ein orange markiertes Ergebnis zeigt, wann
          ein anderes Produkt vorn liegt als im Basisfall.
        </p>
      </header>

      <div className="sensitivity-grid" role="table">
        <div className="sg-head" role="columnheader">Annahme</div>
        <div className="sg-head" role="columnheader">Bestes Kapital</div>
        <div className="sg-head" role="columnheader">Beste Rente</div>

        <div className="sg-row-label" role="rowheader">
          Basis
          <small>{result.baseline.detail}</small>
        </div>
        <div className="sg-cell">
          <ProductPill productId={baselineCapital} />
        </div>
        <div className="sg-cell">
          <ProductPill productId={baselinePension} />
        </div>

        {result.perturbations.map((p) => (
          <Fragment key={p.id}>
            <div className="sg-row-label" role="rowheader">
              {p.label}
              <small>{p.detail}</small>
            </div>
            <div className="sg-cell">
              <ProductPill
                productId={p.winnerCapital}
                changed={p.winnerCapital !== baselineCapital}
              />
            </div>
            <div className="sg-cell">
              <ProductPill
                productId={p.winnerPension}
                changed={p.winnerPension !== baselinePension}
              />
            </div>
          </Fragment>
        ))}
      </div>

      <div className="robustness-strip" aria-label="Robustheit pro Produkt">
        {result.robustness.map((r) => {
          const meta = getProductMeta(r.productId)
          return (
            <span key={r.productId} className={`robustness-pill ${r.badge}`}>
              <span
                className="pill-dot"
                style={{ background: meta?.color ?? '#94a3b8' }}
                aria-hidden
              />
              {meta?.shortLabel ?? r.productId}: {BADGE_LABEL[r.badge]}
            </span>
          )
        })}
      </div>
    </section>
  )
}
