import { useMemo } from 'react'
import './VergleichPage.css'
import type { ProductId, ScenarioAssumptions, PersonalProfile } from '../../domain'
import type { SimulationResultBundle } from '../../app/useSimulationResult'
import type { Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { resolveEffectiveScenarioId } from '../../app/simulationSelectors'
import { simulateRetirementComparison } from '../../engine/simulate'
import { buildAllProductsSimulation } from '../../app/buildAllProductsSimulation'
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
  /**
   * Bundle from `useSimulationResult`. R1 fix (Codex P2): the page no longer
   * reads `simulation.products` from this bundle — it runs its own local
   * simulation with `visibleProducts` forced to all 6 so `/vergleich` is
   * independent of the user's portfolio selection. The prop stays declared
   * for shape stability with `Calculator.tsx` and future re-introduction
   * (Monte Carlo overlay, taxModes consumers); same pattern as
   * `onAssumptionsChange` below.
   */
  result: SimulationResultBundle
  /**
   * Optional pre-built all-6-products simulation lifted from Calculator
   * (PR 332 R2 — Codex P2). When provided, VergleichPage uses this instead
   * of running its own local simulation; this keeps CSV export and the
   * on-screen table in sync (Calculator builds the CSV from the same
   * result). When omitted, the page falls back to its internal useMemo so
   * tests / standalone callers still work without wiring the prop.
   */
  allProductsSimulation?: ReturnType<typeof simulateRetirementComparison>
  /** Setter so the rendite chips can swap scenario / future picker re-introductions. */
  onAssumptionsChange: (updater: (current: ScenarioAssumptions) => ScenarioAssumptions) => void
  /** Selected return-scenario id from `useWorkspaceUiState`. */
  selectedScenarioId: string
  /** Setter for the selected scenario id (workspace UI state, not assumptions). */
  onSelectScenario: (id: string) => void
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
  /**
   * Compare-mode export handlers. Wired from Calculator.tsx. The
   * `onExportCsv` handler is built from the same all-6-products simulation
   * that the page renders (PR 332 R2), so the file matches the screen.
   * Rendered as a small action bar at the bottom of the page
   * (Sober D footer pattern).
   */
  onExportCsv?: () => void
  onCopyLink?: () => void
  onPrint?: () => void
  /** True for ~1.5s after the user clicks "Link kopieren" — for transient feedback. */
  linkCopied?: boolean
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

// `onAssumptionsChange` and `result` are intentionally absent from the
// destructure. R1 removed the in-page ComparisonPicker (no caller-mutation
// hook on the surface) AND switched the page to a local simulation with all
// 6 products forced visible (no longer reads `result.simulation`). Both
// props stay declared on `Props` for shape stability with the workspace
// dispatch in Calculator.tsx and for future re-introduction (e.g. inline
// tax-mode toggles, Monte Carlo overlay).
export function VergleichPage({
  profile,
  assumptions,
  allProductsSimulation,
  selectedScenarioId,
  onSelectScenario,
  navigate,
  onExportCsv,
  onCopyLink,
  onPrint,
  linkCopied,
}: Props) {
  // R1 fix (Codex P2): the page contract is "shows all 6 products always".
  // `simulateRetirementComparison` filters by `assumptions.visibleProducts`,
  // so a user who deselected products on /eingaben would have silently seen
  // a subset here. Force `visibleProducts` to the full registry list before
  // simulating; this makes /vergleich independent of the portfolio selection.
  //
  // PR 332 R2 (Codex P2): when Calculator passes `allProductsSimulation`,
  // we reuse that result instead of running our own engine pass — this lets
  // Calculator's `handleExportCsvAllProducts` build the CSV from the *same*
  // simulation the page renders (no drift). Standalone callers (tests, or
  // anywhere VergleichPage is mounted without the prop) keep the local
  // memo path so the page still works in isolation.
  //
  // `buildAllProductsSimulation` (PR 332 R3) owns the normalize → sync →
  // simulate contract. The fallback path calls it directly; when Calculator
  // passes `allProductsSimulation`, we reuse that result to avoid a redundant
  // engine pass (Calculator's CSV export is built from the same object).
  const localAllProductsResult = useMemo(
    () => (allProductsSimulation ?? buildAllProductsSimulation(profile, assumptions)),
    [allProductsSimulation, profile, assumptions],
  )
  const allProductsResult = localAllProductsResult

  // Resolve the effective scenario against the LIVE assumptions (so the
  // rendite chip strip and selection stay aligned with what the user sees).
  // `resolveEffectiveScenarioId` is the canonical helper that already handles
  // missing-scenario fallback (see CLAUDE.md "returnScenarios[0] is not
  // necessarily basis" gotcha).
  const effectiveScenarioId = resolveEffectiveScenarioId(assumptions, selectedScenarioId)

  const rows = useMemo<VergleichTableRow[]>(() => {
    const products = allProductsResult.products.filter(
      (p) => p.scenarioId === effectiveScenarioId,
    )

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
  }, [allProductsResult.products, effectiveScenarioId])

  const productsForProContra = useMemo<ProductId[]>(
    () => rows.map((row) => row.productId),
    [rows],
  )

  // Live lead-copy figures.
  //
  // Beitrag: `bavFunding.monthlyNetCost` from the local all-6 simulation —
  // the same net cash the user pays for bAV, which the compare-mode
  // fair-comparison invariant pins ETF + insurance to. Sourced from the
  // local sim (not the parent `result` bundle) so it stays consistent with
  // the table the page actually renders.
  //
  // Laufzeit: full years between current age and retirement age.
  //
  // Renteneintritt: retirement age. Never hardcoded — `profile.retirementAge`
  // is the single source of truth across the page (lead copy, table column
  // header, scenario hooks).
  const monthlyContribution = allProductsResult.bavFunding.monthlyNetCost
  const runtimeYears = Math.max(0, profile.retirementAge - profile.age)
  const retirementAge = profile.retirementAge

  // Pre-encode the drill-in URL/query in one place so `href` and `navigate`
  // cannot drift. CodeRabbit Major (R1): use `effectiveScenarioId` (the
  // value the page actually rendered with), not `selectedScenarioId` —
  // if selection is stale/missing, the drill-in would otherwise carry a
  // different scenario than the user sees. Encoding the scenario id
  // preserves it on Cmd/Ctrl-click, middle-click, JS-disabled fallback,
  // and reload (the detail page reads `?scenario=<id>` on first mount).
  const scenarioQuery = `?scenario=${encodeURIComponent(effectiveScenarioId)}`
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
            <a
              className="vergleich-drilldown__link"
              href={routeToPath(ROUTES.kapital)}
              onClick={(event) => {
                if (!navigate) return
                if (!shouldUseSpaNavigation(event)) return
                event.preventDefault()
                navigate(ROUTES.kapital)
              }}
            >
              Kapital im Verlauf →
            </a>
          </div>

          {(onPrint || onExportCsv || onCopyLink) && (
            <div className="vergleich-actions" role="toolbar" aria-label="Ergebnisse exportieren">
              {onPrint && (
                <button
                  type="button"
                  className="vergleich-actions__button"
                  onClick={onPrint}
                >
                  Drucken
                </button>
              )}
              {onExportCsv && (
                <button
                  type="button"
                  className="vergleich-actions__button"
                  onClick={onExportCsv}
                >
                  CSV exportieren
                </button>
              )}
              {onCopyLink && (
                <button
                  type="button"
                  className="vergleich-actions__button"
                  onClick={onCopyLink}
                  aria-live="polite"
                >
                  {linkCopied ? 'Link kopiert ✓' : 'Link kopieren'}
                </button>
              )}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
