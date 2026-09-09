import { useEffect, useMemo } from 'react'
import './VergleichDetailPage.css'
import type { Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { useCalculatorState } from '../../app/useCalculatorState'
import { useSimulationResult } from '../../app/useSimulationResult'
import { resolveEffectiveScenarioId } from '../../app/simulationSelectors'
import { detectSavedMode } from '../../app/useRoute'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { PRIMARY_PRODUCT_IDS } from '../../content/triggers'
import { formatCurrency } from '../../utils/format'
import type { ScenarioAssumptions, PersonalProfile } from '../../domain'
import { VergleichDetailCard } from './VergleichDetailCard'
import { LegalFooter } from '../legal/LegalFooter'
import {
  buildVergleichDetailCardData,
  type VergleichDetailCardData,
} from './vergleichDetailRows'

interface Props {
  /** SPA navigator threaded from `App.tsx`. Used by the back-link + empty-state CTA. */
  navigate: (target: Route) => void
  /**
   * Selected return-scenario id from `useWorkspaceUiState` (read-only here —
   * drill-in does not change the scenario). Threaded through App.tsx so the
   * drill-in honours whatever the user picked on `VergleichPage`. Falls back
   * to `'basis'` via `resolveEffectiveScenarioId` when the id is missing or
   * unknown (e.g. test fixtures, legacy saved state).
   */
  selectedScenarioId: string
  /**
   * Setter for the selected scenario id (PR 290 R3 Codex P2 fix). Called
   * exactly once on first mount when the URL carries a `?scenario=<id>`
   * query param AND the value matches one of `assumptions.returnScenarios`.
   * Used so non-SPA navigations (Cmd/Ctrl-click, hard reload, JS-disabled
   * fallback) preserve the scenario chosen on `VergleichPage` instead of
   * silently snapping back to `'basis'`. Without this hook, the in-memory
   * `useWorkspaceUiState` resets to default and the page disagrees with the
   * comparison table the user came from.
   *
   * The param is purely a runtime initialiser — `routeToPath` /
   * `pathToRoute` do NOT carry the scenario id (we intentionally keep the
   * `Route` tagged-union narrow per CLAUDE.md "Add a new app route" lane).
   */
  onSelectScenario: (id: string) => void
}

// ---------------------------------------------------------------------------
// VergleichDetailPage — `/vergleich/details` per-product breakdown (PR 10).
//
// Drill-in from `VergleichPage`. Renders one card per product in the compare
// singleton's `assumptions.visibleProducts`, ordered by registry sort. Each
// card stacks three sections — Ansparphase / Mit {retirementAge} / Im Alter
// — built by `buildVergleichDetailCardData` from a single `ProductResult`.
//
// The page is NOT gated on `workspace.mode`: it belongs to the comparison
// journey, whose state is the compare singleton, and a user with a saved plan
// reaches it from `/vergleich` like everybody else.
//
// Hooks always run unconditionally so the empty-state branch still observes
// the Rules of Hooks.
//
// Engine boundary: this page consumes the existing
// `useSimulationResult` bundle — no new engine entry points, no schema
// changes. The legacy `simulateRetirementComparison` path stays the only
// source of `ProductResult[]` for compare-mode (CLAUDE.md "Engine
// untouched", "schemaVersion: 2 unchanged").
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Demo-mode (R3.3): when the page is loaded without an active comparison
// (empty `visibleProducts` in compare-mode), the page renders a live default-
// assumption demo run so SEO indexes real content and first-time visitors land
// on a populated grid instead of an empty state. Audit decision Q4 (locked
// 2026-05-21): "live default-assumption demo run … real comparison built from
// defaultAssumptions (all primary products visible)".
//
// `DEMO_VISIBLE_PRODUCTS` widens the registry default (`['etf', 'bav']`) to
// the full primary lineup (ETF + bAV + private Rente) so all three Sober D
// breakdown cards appear above the fold. Secondary products (Basisrente,
// AVD, Riester) are intentionally excluded so the demo grid stays digestible.
// ---------------------------------------------------------------------------
const DEMO_VISIBLE_PRODUCTS = PRIMARY_PRODUCT_IDS

function buildDemoAssumptions(): ScenarioAssumptions {
  return { ...defaultAssumptions, visibleProducts: [...DEMO_VISIBLE_PRODUCTS] }
}

export function VergleichDetailPage({ navigate, selectedScenarioId, onSelectScenario }: Props) {
  // ---- 1. Hook prelude — runs unconditionally before any early return. ----
  const compareState = useCalculatorState()
  const { profile: liveProfile, assumptions: liveAssumptions } = compareState

  // Demo-mode gate: with no saved state at all (`detectSavedMode()` is null —
  // first-time visitor or fresh prerender) the page renders a live
  // default-assumption demo run, so SEO crawlers and the SSG prerender pass
  // index a populated card grid instead of an empty state. Audit decision Q4
  // (locked 2026-05-21).
  //
  // `detectSavedMode()` is a pure synchronous read of localStorage that the
  // existing router code already calls on initial paint; reusing it here
  // adds no new I/O. Memoised so re-renders don't re-read storage.
  //
  // The page renders the comparison, always. Gating on `workspace.mode` sent
  // every user with a saved plan to a "nur im Vergleichs-Modus" empty state
  // even though they arrived from `/vergleich` — the comparison and the plan
  // are separate surfaces, and the drill-in belongs to the comparison. Its
  // data source is the compare singleton (`useCalculatorState`), which is
  // exactly what `/vergleich` renders, so the mode tag is irrelevant here.
  const savedMode = useMemo(() => detectSavedMode(), [])
  // Demo-mode fires ONLY when there is no saved state at all (first-time
  // visitor / SEO prerender). Saved-state with empty visibleProducts is now
  // handled by the live branch below, so crawlers and first-time visitors
  // still see PRIMARY_PRODUCT_IDS while returning users see exactly the
  // products their comparison has selected.
  const isDemo = savedMode === null

  const profile: PersonalProfile = isDemo ? defaultProfile : liveProfile
  // Memoise the demo assumptions so the simulation hook's dep array stays
  // stable across renders (avoids re-running `simulateRetirementComparison`
  // on every parent re-render when the page is in demo mode).
  const demoAssumptions = useMemo(() => buildDemoAssumptions(), [])
  // The drill-in shows what the comparison shows: the products the user
  // selected. Forcing all six here made a two-product comparison open onto
  // six breakdown cards, so the detail page disagreed with the page the user
  // came from. Demo-mode (no saved state) keeps PRIMARY_PRODUCT_IDS for SEO.
  const assumptions = isDemo ? demoAssumptions : liveAssumptions

  // Compare-mode simulation. Called unconditionally so the empty-state branch
  // below keeps a stable hook order.
  // The cost is the standard `simulateRetirementComparison` pass, which the
  // existing compare-mode `Calculator` already runs. The hook receives the
  // live `selectedScenarioId` so the simulation pipeline picks the same
  // scenario the user chose on `VergleichPage` (no silent basis-fallback).
  const result = useSimulationResult(profile, assumptions, selectedScenarioId)
  const effectiveScenarioId = resolveEffectiveScenarioId(assumptions, selectedScenarioId)

  // Doc title — kept in sync with publicRouteRegistry's /vergleich/details entry.
  // Must precede every conditional return.
  useEffect(() => {
    document.title = 'Wohin geht das Geld? Vergleich im Detail | RentenWiki.de' // Kept in sync with publicRouteRegistry's /vergleich/details entry.
  }, [])

  // PR 290 R3 Codex P2 fix: read `?scenario=<id>` from the URL on first mount
  // so non-SPA navigations (Cmd/Ctrl-click, middle-click, JS-disabled
  // fallback, hard reload) preserve the scenario the user picked on
  // `VergleichPage`. The empty dep array means this runs exactly once per
  // mount; subsequent scenario changes flow through props (set by the
  // workspace UI elsewhere). Guarded against:
  //   - missing `window` (SSR / non-browser)
  //   - malformed URL (`URLSearchParams` throwing on weird input)
  //   - missing or unknown scenario id (silent no-op)
  useEffect(() => {
    if (typeof window === 'undefined') return
    let parsedId: string | null = null
    try {
      const params = new URLSearchParams(window.location.search)
      parsedId = params.get('scenario')
    } catch {
      // Defensive: a malformed query string should never bubble out of the
      // initialiser. Fall through to the existing prop-driven default.
      return
    }
    if (!parsedId) return
    const isKnownScenario = assumptions.returnScenarios.some((s) => s.id === parsedId)
    if (!isKnownScenario) return
    onSelectScenario(parsedId)
    // Intentionally empty — first-mount only. Subsequent prop / URL drift is
    // not handled here; the user navigates back to `VergleichPage` to change
    // the scenario, which threads through props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // `yearsToRetirement` and the compare-mode `bavFunding` are threaded into
    // the row builder so it can (a) convert the lifetime-accumulated
    // `taxAndSvSavings` into a monthly display value and (b) compensate for
    // the bAV `includeGrvReduction` net-payout deduction when deriving the
    // monthly income-tax row. See PR 290 review fixes.
    const yearsToRetirement = Math.max(0, profile.retirementAge - profile.age)
    return sorted
      .map((r) =>
        buildVergleichDetailCardData({
          result: r,
          retirementAge: profile.retirementAge,
          yearsToRetirement,
          assumptions,
          bavFunding: result.simulation.bavFunding,
        }),
      )
      .filter((d): d is VergleichDetailCardData => d !== null)
  }, [
    result.simulation.products,
    result.simulation.bavFunding,
    effectiveScenarioId,
    profile.retirementAge,
    profile.age,
    assumptions,
  ])

  // ---- 2. Empty state. ----------------------------------------------------
  // Defensive: if the demo seed itself produces zero cards (e.g. registry
  // filter mismatch) we surface the legacy empty state so the page never
  // renders an empty grid silently. This branch should never fire in
  // practice — the primary products always have at least one renderable
  // ProductResult — but it preserves the pre-R3.3 behaviour for any
  // remaining edge case.
  if (cardData.length === 0) {
    return (
      <EmptyComparisonState navigate={navigate} />
    )
  }

  // PR R2 §18: lead paragraph cites the same live Beitrag / Laufzeit /
  // Renteneintritt figures as `VergleichPage`. Beitrag comes from the
  // page-local simulation's `bavFunding.monthlyNetCost` — the same net cash
  // the user pays for bAV, which the compare-mode fair-comparison invariant
  // pins ETF + insurance to. Laufzeit + Renteneintritt come from `profile`.
  // Both paths (demo + live) cite live figures so the lead never disagrees
  // with what the cards show.
  const monthlyContribution = result.simulation.bavFunding.monthlyNetCost
  const runtimeYears = Math.max(0, profile.retirementAge - profile.age)
  const retirementAge = profile.retirementAge

  // ---- 3. Render. ---------------------------------------------------------
  return (
    <div className="vd-shell">
      <div className="vd-main">
        <article className="vd-body">
          <div className="vd-kicker">
            {isDemo ? 'Beispielrechnung · Standardannahmen 2026' : 'Vergleich › Wohin geht das Geld'}
          </div>
          <h1 className="vd-headline">Wohin geht jeder Euro?</h1>
          {isDemo ? (
            <p className="vd-lead">
              Diese Seite zeigt für jede Sparform, wohin jeder eingezahlte Euro
              fließt — Eigenanteil, Förderung oder Arbeitgeberzuschuss, Kosten und
              Steuer — und was im Alter monatlich übrig bleibt. Solange noch kein
              eigener Vergleich angelegt ist, rechnen wir mit Standardannahmen für
              2026: monatlicher Netto-Aufwand{' '}
              <strong>{formatCurrency(monthlyContribution, 0)}</strong>, Laufzeit{' '}
              <strong>{runtimeYears} Jahre</strong>, Renteneintritt mit{' '}
              <strong>{retirementAge}</strong>. Eigene Werte ändern die
              Aufschlüsselung sofort.
            </p>
          ) : (
            <p className="vd-lead">
              Jede Sparform verteilt deinen monatlichen Aufwand anders auf
              Eigenanteil, Förderung, Kosten und Steuer. Bei einem Netto-Aufwand
              von <strong>{formatCurrency(monthlyContribution, 0)}</strong> pro
              Monat, Laufzeit <strong>{runtimeYears} Jahre</strong> und
              Renteneintritt mit <strong>{retirementAge}</strong> zeigt jede
              Karte: was eingezahlt wird, was am Renteneintritt steht und was im
              Alter monatlich übrig bleibt.
            </p>
          )}

          <div className="vd-backline">
            <a
              href={routeToPath(ROUTES.vergleich)}
              className="vd-backlink"
              onClick={(event) => {
                if (!shouldUseSpaNavigation(event)) return
                event.preventDefault()
                navigate(ROUTES.vergleich)
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
      <LegalFooter navigate={navigate} />
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
            pro Euro zu sehen — wer wie viel zahlt, was Kosten und Steuer
            wegnehmen und was monatlich im Alter übrig bleibt.
          </p>
          <a
            href={routeToPath(ROUTES.vergleich)}
            className="vd-empty-cta"
            onClick={(event) => {
              if (!shouldUseSpaNavigation(event)) return
              event.preventDefault()
              navigate(ROUTES.vergleich)
            }}
          >
            Zurück zum Vergleich
          </a>
        </article>
      </div>
      <LegalFooter navigate={navigate} />
    </div>
  )
}
