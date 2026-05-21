import { useMemo } from 'react'
import './VergleichPage.css'
import type { ProductId, ScenarioAssumptions, PersonalProfile } from '../../domain'
import type { SimulationResultBundle } from '../../app/useSimulationResult'
import type { Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { resolveEffectiveScenarioId } from '../../app/simulationSelectors'
import { ComparisonPicker } from '../workspace/ComparisonPicker'
import { ErrorStatePanel } from '../../ui/chrome/ErrorStatePanel'
import { VergleichRenditeStrip } from './VergleichRenditeStrip'
import { VergleichComparisonTable } from './VergleichComparisonTable'
import { rowFromResult, type VergleichTableRow } from './vergleichRows'
import { VergleichProContraGrid } from './VergleichProContraGrid'

interface Props {
  /** Live profile from `useCalculatorState`. */
  profile: PersonalProfile
  /** Live assumptions from `useCalculatorState`. */
  assumptions: ScenarioAssumptions
  /** Bundle from `useSimulationResult` — `simulation.products` is filtered by scenario. */
  result: SimulationResultBundle
  /** Setter so the picker can adjust `visibleProducts` and the rendite chips can swap scenario. */
  onAssumptionsChange: (updater: (current: ScenarioAssumptions) => ScenarioAssumptions) => void
  /** Selected return-scenario id from `useWorkspaceUiState`. */
  selectedScenarioId: string
  /** Setter for the selected scenario id (workspace UI state, not assumptions). */
  onSelectScenario: (id: string) => void
  /** Used by the EmptyComparison CTA to switch to the "Eingaben" tab. */
  onOpenAngebot: () => void
  /**
   * Optional SPA navigator. When provided, the "Wohin geht das Geld →"
   * drill-in link uses SPA navigation to `/vergleich/details`; when absent,
   * the link still works as a real anchor (progressive enhancement). The
   * compare-mode `Calculator.tsx` always passes this; tests sometimes omit it.
   *
   * The optional `search` argument carries the query string (e.g.
   * `?scenario=basis`) so SPA navigation pushes the same URL the `href`
   * would (PR 290 R4 Codex P2 — the URL is the source of truth for
   * shareable state in compare mode).
   */
  navigate?: (target: Route, search?: string) => void
}

// ---------------------------------------------------------------------------
// VergleichPage — compare-mode results surface (PR 9).
//
// Sober D visual treatment shared with MeinPlanPage / VertragDetailPage /
// KapitalPage. Replaces the legacy `vergleichPane`-switcher + multi-chart
// dispatch with a single linear surface:
//
//   1. Lead paragraph (neutral framing — no recommendation)
//   2. Rendite-Annahme chip strip (folds in the legacy ScenarioToolbar)
//   3. Comparison picker (existing component, reused as-is)
//   4. § 1 Comparison table — 6 products, neutral
//   5. § 2 Pro/Contra grid — 3-wide → 2-wide → 1-col
//
// Mode: compare-mode only. Combine-mode renders `MeinPlanPage` from
// Calculator.tsx; this page is never reached in combine.
//
// Engine boundary: this page consumes the existing `useSimulationResult`
// bundle. No new engine entry points. Each table row is built from one
// `ProductResult` (filtered to the effective scenario).
// ---------------------------------------------------------------------------

const SECTION_TABLE = {
  id: 'vergleich-tabelle',
  n: '§ 1',
  title: 'Sechs Sparformen im Überblick',
}
const SECTION_PRO_CONTRA = {
  id: 'vergleich-pro-contra',
  n: '§ 2',
  title: 'Wofür welche Sparform spricht — und wogegen',
}

export function VergleichPage({
  profile,
  assumptions,
  result,
  onAssumptionsChange,
  selectedScenarioId,
  onSelectScenario,
  onOpenAngebot,
  navigate,
}: Props) {
  const hasComparisonSet = assumptions.visibleProducts.length > 0

  // The simulation runs every scenario; filter to the effective one so the
  // table renders one row per visible product. `resolveEffectiveScenarioId`
  // is the canonical helper that already handles missing-scenario fallback
  // (see CLAUDE.md "returnScenarios[0] is not necessarily basis" gotcha).
  const effectiveScenarioId = resolveEffectiveScenarioId(assumptions, selectedScenarioId)

  const rows = useMemo<VergleichTableRow[]>(() => {
    if (!hasComparisonSet) return []
    const products = result.simulation.products.filter((p) => p.scenarioId === effectiveScenarioId)
    // Sort registry order so the table is stable regardless of `visibleProducts` order.
    const orderById = new Map(PRODUCT_REGISTRY.map((entry) => [entry.metadata.id, entry.metadata.order]))
    const sorted = [...products].sort(
      (a, b) => (orderById.get(a.productId) ?? 99) - (orderById.get(b.productId) ?? 99),
    )
    return sorted
      .map(rowFromResult)
      .filter((row): row is VergleichTableRow => row !== null)
  }, [hasComparisonSet, result.simulation.products, effectiveScenarioId])

  const productsForProContra = useMemo<ProductId[]>(
    () => rows.map((row) => row.productId),
    [rows],
  )

  // Beitrag / Laufzeit metadata for the rendite strip. The compare-mode
  // fair-comparison invariant pins ETF + insurance to `bavFunding.monthlyNetCost`,
  // but the user's commitment baseline is `equalInputAmountEUR`. Display the
  // user's commitment, not the per-product derivation.
  const monthlyContribution = assumptions.equalInputAmountEUR ?? 0
  const runtimeYears = Math.max(0, profile.retirementAge - profile.age)

  function handleVisibleProductsChange(next: ProductId[]) {
    onAssumptionsChange((current) => ({ ...current, visibleProducts: next }))
  }

  return (
    <section className="vergleich-shell" aria-label="Vergleich">
      <div className="vergleich-main">
        <article className="vergleich-body">
          <div className="vergleich-kicker">Persönliche Auskunft · ohne Empfehlung</div>
          <h1 className="vergleich-headline">Sechs Wege, fürs Alter zu sparen</h1>
          <p className="vergleich-lead">
            Sechs Sparformen, sechs Steuersystematiken. Vergleich bei gleichem
            Netto-Aufwand und gleicher Laufzeit. „Welcher der beste ist" hängt
            davon ab, was du gewichtest — <em>Rendite, Sicherheit, Flexibilität</em>.
            Wir nennen keine Empfehlung.
          </p>

          <VergleichRenditeStrip
            scenarios={assumptions.returnScenarios}
            selectedId={effectiveScenarioId}
            onSelect={onSelectScenario}
            monthlyContribution={monthlyContribution}
            runtimeYears={runtimeYears}
          />

          <ComparisonPicker
            visible={assumptions.visibleProducts}
            onChange={handleVisibleProductsChange}
          />

          {hasComparisonSet ? (
            <>
              <section className="vergleich-section" aria-labelledby={SECTION_TABLE.id}>
                <div className="vergleich-section-head">
                  <span className="vergleich-section-num">{SECTION_TABLE.n}</span>
                  <h2 id={SECTION_TABLE.id} className="vergleich-section-title">
                    {SECTION_TABLE.title}
                  </h2>
                </div>
                <VergleichComparisonTable rows={rows} retirementAge={profile.retirementAge} />
              </section>

              <section className="vergleich-section" aria-labelledby={SECTION_PRO_CONTRA.id}>
                <div className="vergleich-section-head">
                  <span className="vergleich-section-num">{SECTION_PRO_CONTRA.n}</span>
                  <h2 id={SECTION_PRO_CONTRA.id} className="vergleich-section-title">
                    {SECTION_PRO_CONTRA.title}
                  </h2>
                </div>
                <VergleichProContraGrid products={productsForProContra} />
              </section>

              <div className="vergleich-drilldown">
                {/* PR 10: drill-in link to the per-product breakdown page.
                    SPA progressive enhancement — real `href` for direct
                    navigation / new-tab support, `onClick` intercepts only
                    plain primary clicks when a `navigate` callback is
                    available (per `shouldUseSpaNavigation`).
                    PR 290 R3 Codex P2 fix: encode the current scenario id as
                    a `?scenario=<id>` query string so non-SPA navigations
                    (Cmd/Ctrl-click, middle-click, JS-disabled fallback, hard
                    reload) land on the same scenario the user selected on
                    `VergleichPage`. The detail page reads this on first mount
                    via its own `useEffect` and updates the workspace UI
                    state, then routing flows through props as usual. The
                    `scenario` param is purely a runtime initialiser; we do
                    NOT promote it into the `Route` tagged-union — keeping
                    `routeToPath` / `pathToRoute` unchanged.
                    PR 290 R4 Codex P2 fix: also forward the scenario query
                    on SPA navigation. Previously `navigate(ROUTES.vergleichDetail)`
                    pushed `/vergleich/details` without the query, so a reload
                    or share after primary-clicking the link silently fell
                    back to `basis`. Hoisting `scenarioQuery` to a const keeps
                    `href` and `navigate` in lockstep — divergence is
                    structurally impossible. */}
                {(() => {
                  const scenarioQuery = `?scenario=${encodeURIComponent(selectedScenarioId)}`
                  const drillInHref = `${routeToPath(ROUTES.vergleichDetail)}${scenarioQuery}`
                  return (
                    <a
                      href={drillInHref}
                      className="vergleich-drilldown__link"
                      onClick={(event) => {
                        if (!navigate) return
                        if (!shouldUseSpaNavigation(event)) return
                        event.preventDefault()
                        navigate(ROUTES.vergleichDetail, scenarioQuery)
                      }}
                    >
                      Wohin geht das Geld? Aufschlüsselung pro Produkt →
                    </a>
                  )
                })()}
              </div>
            </>
          ) : (
            <ErrorStatePanel
              tone="empty"
              title="Wähle mindestens ein Vorsorgeprodukt zum Vergleich"
              message="Die gesetzliche Rente bildet den Sockel. Ergänze ein privates Produkt — z. B. ETF-Depot oder bAV — um den Unterschied für deine Situation zu sehen."
              cta={{ label: 'Produkte auswählen', onClick: onOpenAngebot }}
            />
          )}
        </article>
      </div>
    </section>
  )
}
