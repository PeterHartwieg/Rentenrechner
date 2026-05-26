import { useMemo } from 'react'
import './VergleichPage.css'
import type { ProductId, ScenarioAssumptions, PersonalProfile } from '../../domain'
import type { SimulationResultBundle } from '../../app/useSimulationResult'
import type { Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { resolveEffectiveScenarioId } from '../../app/simulationSelectors'
import { ErrorStatePanel } from '../../ui/chrome/ErrorStatePanel'
import { formatCurrency } from '../../utils/format'
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
  /** Setter so the rendite chips can swap scenario / future picker re-introductions. */
  onAssumptionsChange: (updater: (current: ScenarioAssumptions) => ScenarioAssumptions) => void
  /** Selected return-scenario id from `useWorkspaceUiState`. */
  selectedScenarioId: string
  /** Setter for the selected scenario id (workspace UI state, not assumptions). */
  onSelectScenario: (id: string) => void
  /** Used by the empty-state CTA to switch to the "Eingaben" tab. */
  onOpenAngebot: () => void
  /**
   * Optional SPA navigator. When provided, the "Wohin geht das Geld →"
   * drill-in link uses SPA navigation to `/vergleich/details`; when absent,
   * the link still works as a real anchor (progressive enhancement).
   *
   * The optional `search` argument carries the query string (e.g.
   * `?scenario=basis`) so SPA navigation pushes the same URL the `href`
   * would (the URL is the source of truth for shareable state).
   */
  navigate?: (target: Route, search?: string) => void
}

// ---------------------------------------------------------------------------
// VergleichPage — compare-mode results surface (R1 rewrite, May 2026).
//
// Sober D visual treatment shared with MeinPlanPage / VertragDetailPage /
// KapitalPage. The R1 rewrite (issue #319) drops the ComparisonPicker — the
// page now shows all six products always — and switches the table sort to
// `netMonthlyPayout` desc with PRODUCT_REGISTRY order as tiebreak. The
// rendite-annahme strip is reduced to bracket-wrapped rates per the
// direction-d design. There is ONE section heading (§ 1 above the
// pro/contra grid); the table has no section number above it.
//
// Layout:
//   1. Kicker + H1 + lead paragraph (live Beitrag / Laufzeit / Renteneintritt)
//   2. Rendite-Annahme chip strip (terse, rate-only)
//   3. Comparison table — six products, sorted by net payout desc
//   4. § 1 Pro/Contra grid — 3-wide → 2-wide → 1-col
//   5. "Wohin geht das Geld? →" drill-in link
//
// Mode: compare-mode only. Combine-mode renders `MeinPlanPage` from
// Calculator.tsx; this page is never reached in combine.
//
// Engine boundary: this page consumes the existing `useSimulationResult`
// bundle. No new engine entry points. Each table row is built from one
// `ProductResult` (filtered to the effective scenario).
// ---------------------------------------------------------------------------

const SECTION_PRO_CONTRA = {
  id: 'vergleich-pro-contra',
  n: '§ 1',
  title: 'Wofür welche Sparform spricht — und wogegen',
}

// `onAssumptionsChange` is intentionally absent from this destructure.
// R1 removed the in-page ComparisonPicker, so no caller-mutation hook
// remains on the surface. The prop stays declared on `Props` for shape
// stability with the workspace dispatch in Calculator.tsx and for
// future re-introduction (e.g. inline tax-mode toggles).
export function VergleichPage({
  profile,
  assumptions,
  result,
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

    // R1: sort by `netMonthlyPayout` desc; ties broken by PRODUCT_REGISTRY
    // order so the table is stable when payouts coincide. NOT a "winner"
    // ranking — the bar in the Netto cell is the only visualization; no row
    // highlight, no badge. The top row's bar reaches the right edge as a
    // natural consequence of bar scaling, not a special case.
    const orderById = new Map(PRODUCT_REGISTRY.map((entry) => [entry.metadata.id, entry.metadata.order]))
    const built = products
      .map(rowFromResult)
      .filter((row): row is VergleichTableRow => row !== null)
    return built.sort((a, b) => {
      const delta = b.netMonthlyPayout - a.netMonthlyPayout
      if (delta !== 0) return delta
      return (orderById.get(a.productId) ?? 99) - (orderById.get(b.productId) ?? 99)
    })
  }, [hasComparisonSet, result.simulation.products, effectiveScenarioId])

  const productsForProContra = useMemo<ProductId[]>(
    () => rows.map((row) => row.productId),
    [rows],
  )

  // Live lead-copy figures.
  //
  // Beitrag: `bavFunding.monthlyNetCost` — the same net cash the user pays
  // for bAV, which the compare-mode fair-comparison invariant pins ETF +
  // insurance to. This is the "Netto-Aufwand" the lead paragraph names.
  //
  // Laufzeit: full years between current age and retirement age.
  //
  // Renteneintritt: retirement age. Never hardcoded — `profile.retirementAge`
  // is the single source of truth across the page (lead copy, table column
  // header, scenario hooks).
  const monthlyContribution = result.simulation.bavFunding.monthlyNetCost
  const runtimeYears = Math.max(0, profile.retirementAge - profile.age)
  const retirementAge = profile.retirementAge

  // Pre-encode the drill-in URL/query in one place so `href` and `navigate`
  // cannot drift. Encoding the scenario id preserves it on Cmd/Ctrl-click,
  // middle-click, JS-disabled fallback, and reload (the detail page reads
  // `?scenario=<id>` on first mount).
  const scenarioQuery = `?scenario=${encodeURIComponent(selectedScenarioId)}`
  const drillInHref = `${routeToPath(ROUTES.vergleichDetail)}${scenarioQuery}`

  return (
    <section className="vergleich-shell" aria-label="Vergleich">
      <div className="vergleich-main">
        <article className="vergleich-body">
          <div className="vergleich-kicker">Persönliche Auskunft · ohne Empfehlung</div>
          <h1 className="vergleich-headline">Sechs Wege, fürs Alter zu sparen</h1>
          <p className="vergleich-lead">
            Sechs Sparformen, sechs Steuersystematiken: Vergleich bei gleichem
            Netto-Aufwand von <strong>{formatCurrency(monthlyContribution, 0)}</strong> pro
            Monat, Laufzeit <strong>{runtimeYears} Jahre</strong>, Renteneintritt
            mit <strong>{retirementAge}</strong>. Welcher der beste ist, hängt
            davon ab, was du gewichtest: <em>Rendite, Sicherheit, Flexibilität</em>.
            Wir nennen keine Empfehlung.
          </p>

          <VergleichRenditeStrip
            scenarios={assumptions.returnScenarios}
            selectedId={effectiveScenarioId}
            onSelect={onSelectScenario}
          />

          {hasComparisonSet ? (
            <>
              <VergleichComparisonTable rows={rows} retirementAge={retirementAge} />

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
