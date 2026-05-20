import { useEffect, useMemo } from 'react'
import './VergleichDetailPage.css'
import type { Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { usePortfolioState } from '../../app/portfolioState'
import { useCalculatorState } from '../../app/useCalculatorState'
import { useSimulationResult } from '../../app/useSimulationResult'
import { resolveEffectiveScenarioId } from '../../app/simulationSelectors'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { VergleichDetailCard } from './VergleichDetailCard'
import {
  buildVergleichDetailCardData,
  type VergleichDetailCardData,
} from './vergleichDetailRows'

interface Props {
  /** SPA navigator threaded from `App.tsx`. Used by the back-link + empty-state CTA. */
  navigate: (target: Route) => void
}

// ---------------------------------------------------------------------------
// VergleichDetailPage — `/vergleich/details` per-product breakdown (PR 10).
//
// Compare-mode-only drill-in from `VergleichPage`. Renders one card per
// product in `assumptions.visibleProducts`, ordered by registry sort. Each
// card stacks three sections — Ansparphase / Mit {retirementAge} / Im Alter
// — built by `buildVergleichDetailCardData` from a single `ProductResult`.
//
// Hooks always run unconditionally so empty-state branches still observe the
// Rules of Hooks. Mode gate uses `workspace.mode` (not `detectSavedMode()`).
//
// Engine boundary: this page consumes the existing
// `useSimulationResult` bundle — no new engine entry points, no schema
// changes. The legacy `simulateRetirementComparison` path stays the only
// source of `ProductResult[]` for compare-mode (CLAUDE.md "Engine
// untouched", "schemaVersion: 2 unchanged").
// ---------------------------------------------------------------------------

export function VergleichDetailPage({ navigate }: Props) {
  // ---- 1. Hook prelude — runs unconditionally before any early return. ----
  const portfolioState = usePortfolioState()
  const compareState = useCalculatorState()
  const { profile, assumptions } = compareState

  // Compare-mode simulation. We must call this even when we're going to render
  // the combine-mode empty state — Rules of Hooks require a stable call order.
  // The cost is the standard `simulateRetirementComparison` pass, which the
  // existing compare-mode `Calculator` already runs.
  const result = useSimulationResult(profile, assumptions, '')
  const effectiveScenarioId = resolveEffectiveScenarioId(assumptions, result.effectiveScenarioId)

  // Doc title — `/vergleich/details` is workspace-state-dependent and not
  // in `publicRouteRegistry`, so the title is set here. Must precede every
  // conditional return.
  useEffect(() => {
    document.title = 'Wohin geht das Geld | RentenWiki.de'
  }, [])

  const cardData = useMemo<ReadonlyArray<VergleichDetailCardData>>(() => {
    const products = result.simulation.products.filter(
      (p) => p.scenarioId === effectiveScenarioId,
    )
    // Sort by registry order so the cards render in canonical product order
    // regardless of `visibleProducts` insertion order. Mirrors VergleichPage.
    const orderById = new Map(
      PRODUCT_REGISTRY.map((entry) => [entry.metadata.id, entry.metadata.order]),
    )
    const sorted = [...products].sort(
      (a, b) => (orderById.get(a.productId) ?? 99) - (orderById.get(b.productId) ?? 99),
    )
    return sorted
      .map((r) =>
        buildVergleichDetailCardData({
          result: r,
          retirementAge: profile.retirementAge,
          assumptions,
        }),
      )
      .filter((d): d is VergleichDetailCardData => d !== null)
  }, [result.simulation.products, effectiveScenarioId, profile.retirementAge, assumptions])

  const hasComparisonSet = assumptions.visibleProducts.length > 0
  // `workspace.mode` is the canonical mode signal — never `detectSavedMode()`.
  const isCombineMode = portfolioState.workspace.mode === 'combine'

  // ---- 2. Empty states. ---------------------------------------------------
  if (isCombineMode) {
    return (
      <EmptyState
        title="Wohin geht das Geld — nur im Vergleichs-Modus"
        body="Diese Detailansicht zerlegt die sechs Sparformen gegeneinander. Im Plan-Modus rechnest du mit deinen tatsächlichen Verträgen — die Aufschlüsselung pro Vertrag findest du auf der Vertrag-Detail-Seite, erreichbar über Mein Plan."
        ctaLabel="Zu Mein Plan wechseln"
        ctaTarget={ROUTES.home}
        navigate={navigate}
      />
    )
  }

  if (!hasComparisonSet || cardData.length === 0) {
    return (
      <EmptyComparisonState navigate={navigate} />
    )
  }

  // ---- 3. Render. ---------------------------------------------------------
  return (
    <div className="vd-shell">
      <div className="vd-main">
        <article className="vd-body">
          <div className="vd-kicker">Vergleich › Wohin geht das Geld</div>
          <h1 className="vd-headline">Wohin geht jeder Euro?</h1>
          <p className="vd-lead">
            Jede Sparform verteilt deinen monatlichen Aufwand anders auf Eigenanteil,
            Förderung, Kosten und Steuer. Diese Aufschlüsselung zeigt für jedes
            Produkt, was eingezahlt wird, was am Renteneintritt steht und was im
            Alter monatlich übrig bleibt — bei deinem aktuellen Renteneintrittsalter
            von {profile.retirementAge}.
          </p>

          <div className="vd-backline">
            <a
              href={routeToPath(ROUTES.home)}
              className="vd-backlink"
              onClick={(event) => {
                if (!shouldUseSpaNavigation(event)) return
                event.preventDefault()
                navigate(ROUTES.home)
              }}
            >
              ← Zurück zum Vergleich
            </a>
          </div>

          <div
            className="vd-card-grid"
            // Phone view: CSS scroll-snap. The container's
            // `scroll-snap-type: x mandatory` plus each card's
            // `scroll-snap-align: start` is pure CSS — no JS carousel.
            // role="list" / aria-label make the swipe row navigable.
            role="list"
            aria-label="Produkt-Aufschlüsselungen"
          >
            {cardData.map((data) => (
              <div key={data.productId} role="listitem" className="vd-card-grid__item">
                <VergleichDetailCard data={data} />
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmptyState — combine-mode user landing on the compare-only surface.
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  title: string
  body: string
  ctaLabel: string
  ctaTarget: Route
  navigate: (target: Route) => void
}

function EmptyState({ title, body, ctaLabel, ctaTarget, navigate }: EmptyStateProps) {
  return (
    <div className="vd-shell">
      <div className="vd-main">
        <article className="vd-empty">
          <h1 className="vd-empty-title">{title}</h1>
          <p className="vd-empty-body">{body}</p>
          <a
            href={routeToPath(ctaTarget)}
            className="vd-empty-cta"
            onClick={(event) => {
              if (!shouldUseSpaNavigation(event)) return
              event.preventDefault()
              navigate(ctaTarget)
            }}
          >
            {ctaLabel}
          </a>
        </article>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmptyComparisonState — compare-mode user with no visibleProducts selected.
// ---------------------------------------------------------------------------

interface EmptyComparisonProps {
  navigate: (target: Route) => void
}

function EmptyComparisonState({ navigate }: EmptyComparisonProps) {
  return (
    <div className="vd-shell">
      <div className="vd-main">
        <article className="vd-empty">
          <h1 className="vd-empty-title">Noch keine Produkte ausgewählt</h1>
          <p className="vd-empty-body">
            Wähle im Vergleich mindestens ein Produkt aus, um die Aufschlüsselung
            pro Euro zu sehen — wer wieviel zahlt, was Kosten und Steuer
            wegnehmen und was monatlich im Alter übrig bleibt.
          </p>
          <a
            href={routeToPath(ROUTES.home)}
            className="vd-empty-cta"
            onClick={(event) => {
              if (!shouldUseSpaNavigation(event)) return
              event.preventDefault()
              navigate(ROUTES.home)
            }}
          >
            Zurück zum Vergleich
          </a>
        </article>
      </div>
    </div>
  )
}
