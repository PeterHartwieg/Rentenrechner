// Calculator dashboard — extracted from App.tsx so the static-content routes
// (homepage landing, topic pages, /impressum, /datenschutz, /404) can ship a
// much smaller initial JS bundle.
//
// App.tsx imports this module via React.lazy(); the dashboard, engine,
// inventory components, charts and Monte Carlo only enter the network when
// the user is on `/` and the App resolves to a non-`landing` view.
//
// Landing-page rendering and the landing → dashboard transition live in
// App.tsx (RootRouter). When the user clicks a CTA, App stores the
// LandingChoice in `pendingChoice` and flips its internal view; this
// component receives the choice via props and applies it on mount.

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, FileSpreadsheet, Home, Pencil } from 'lucide-react'
import { WorkspaceTabs } from './ui/chrome/WorkspaceTabs'
import type { WorkspaceTabDef } from './ui/chrome/WorkspaceTabs'
// PR 6: `MeinPlanSidebar` removed from the combine-mode render path. PR 9:
// the per-pane Vergleich sidebar + its pane registry are likewise gone — the
// compare-mode surface is now the linear Sober D `VergleichPage`.
import { MeinPlanPage } from './features/mein-plan/MeinPlanPage'
import { VergleichPage } from './features/vergleich/VergleichPage'
import type { ProductId } from './domain'
import { computeBavMinimumEntitlement } from './engine/bavWarnings'
import { deriveCombinePerInstanceTaxModes } from './app/combineCsvWiring'
import { de2026Rules } from './rules/de2026'
import { useCalculatorState } from './app/useCalculatorState'
import { useScenarioLibrary } from './app/useScenarioLibrary'
import { useDerivedViews } from './app/useDerivedViews'
import { useSimulationResult } from './app/useSimulationResult'
import type { WorkspaceUiState } from './app/useWorkspaceUiState'
import { useWorkspace } from './app/useWorkspace'
import { WORKSPACE_VIEWS } from './app/useWorkspace'
import type { WorkspaceView } from './app/useWorkspace'
import { usePortfolioState } from './app/portfolioState'
import type { Route } from './app/useRoute'
import { PRODUCT_MANIFEST } from './app/productPresentation'
import { InputsPanel } from './features/inputs/InputsPanel'
import { SensitivityPanel } from './features/results/SensitivityPanel'
import { runSensitivity } from './features/results/sensitivity'
import { FairnessPanel } from './features/results/FairnessPanel'
import { FeeDragChart } from './features/results/FeeDragChart'
import { MonteCarloPanel } from './features/results/MonteCarloPanel'
import { CalculationWarnings } from './features/results/CalculationWarnings'
import { DetailComparisonTable } from './features/results/DetailComparisonTable'
import { CombineDetailView } from './features/results/CombineDetailView'
import { PrintReport } from './features/results/PrintReport'
import { usePrintSensitivityRows } from './app/usePrintSensitivityRows'
import { CashflowTable } from './features/cashflows/CashflowTable'
import { AssumptionsPanel } from './features/assumptions/AssumptionsPanel'
import { AssumptionReviewPanel } from './features/results/AssumptionReviewPanel'
import { ComparisonPicker } from './features/workspace/ComparisonPicker'
import { EmptyComparison } from './features/workspace/EmptyComparison'
import { ScenarioToolbar } from './features/workspace/ScenarioToolbar'
import type { LandingChoice } from './features/landing/LandingPage'
import { InventoryWizard } from './features/inventory/InventoryWizard'
import { CombineDashboardSidebar } from './features/inventory/CombineDashboardSidebar'
import { useCombineSimulation } from './app/useCombineSimulation'
import { LueckeSchliessenModal } from './features/dashboard/LueckeSchliessenModal'
import { ContractDecisionMenu } from './features/dashboard/ContractDecisionMenu'
import { buildWhatIfFromCandidate } from './app/recommender'
import { LegalFooter } from './features/legal/LegalFooter'
import { ErrorStatePanel } from './ui/chrome/ErrorStatePanel'
import {
  qaTargetAttrs,
  setQaWorkspaceContext,
  useFeedbackTarget,
  useQaMode,
} from './features/qa-feedback'

const PRODUCT_COLORS = Object.fromEntries(PRODUCT_MANIFEST.map(m => [m.id, m.color]))
// PR 6: PORTFOLIO_COLOR / PORTFOLIO_LIFECYCLE_ID / buildPortfolioLifecycleViews
// were tied to the removed combine-mode lifecycle pane. PR 8 (Kapital &
// Auszahlungen) re-introduces them on a dedicated `/kapital` route.
//
// PR 9: the compare-mode `vergleichPane` switcher + `VERGLEICH_STUB_PANES`
// set are likewise gone. The compare-mode surface is now the linear Sober D
// `VergleichPage` (see `src/features/vergleich/VergleichPage.tsx`).

interface ShellTabDef {
  id: WorkspaceView
  compareLabel: string
  combineLabel: string
  icon: typeof BarChart3
}

const SHELL_TABS: readonly ShellTabDef[] = [
  { id: 'angebot', compareLabel: 'Eingaben', combineLabel: 'Meine Verträge', icon: Pencil },
  { id: 'vergleich', compareLabel: 'Vergleich', combineLabel: 'Übersicht', icon: BarChart3 },
  { id: 'details', compareLabel: 'Details & Export', combineLabel: 'Details & Export', icon: FileSpreadsheet },
] as const

/**
 * Map the shared `SHELL_TABS` definition to the mode-aware label set
 * consumed by the Sober D `<WorkspaceTabs>` segmented control. The
 * combine-mode labels swap "Eingaben → Meine Verträge" and "Vergleich →
 * Übersicht"; the "Details & Export" leg is identical across modes.
 */
function buildWorkspaceTabs(combineMode: boolean): ReadonlyArray<WorkspaceTabDef<WorkspaceView>> {
  return SHELL_TABS.map((tab) => ({
    id: tab.id,
    label: combineMode ? tab.combineLabel : tab.compareLabel,
    icon: tab.icon,
  }))
}

interface CalculatorProps {
  navigate: (target: Route) => void
  /**
   * Optional landing-page choice forwarded from App.RootRouter. Applied once
   * on mount via useEffect: sets the workspace mode, optionally seeds
   * `visibleProducts` (compare-mode), or opens the InventoryWizard
   * (combine-mode). `onPendingChoiceConsumed` is invoked once the choice has
   * been applied so the parent can clear the pending state.
   */
  pendingChoice?: LandingChoice | null
  onPendingChoiceConsumed?: () => void
  /**
   * Called when the user clicks the topbar "Startseite" button. The parent
   * is expected to flip back to the landing view (which unmounts this
   * component). In-memory navigation state is dropped intentionally;
   * localStorage is preserved so a returning user keeps their data.
   */
  onGoHome: () => void
  /**
   * Workspace UI toggles owned by `App` so `selectedScenarioId` survives SPA
   * navigation to `/vergleich/details` (PR 290 Codex P1 fix). When the user
   * picks a non-basis scenario on `VergleichPage`, the drill-in receives the
   * same id from App's lifted `useWorkspaceUiState` call.
   */
  workspaceUi: WorkspaceUiState
}

function Calculator({ navigate, pendingChoice, onPendingChoiceConsumed, onGoHome, workspaceUi: ui }: CalculatorProps) {
  const [showInventoryWizard, setShowInventoryWizard] = useState(false)
  const [showLueckeModal, setShowLueckeModal] = useState(false)
  const [activeMenuInstanceId, setActiveMenuInstanceId] = useState<string | null>(null)
  // Issue 23: product tab to pre-select when navigating from a ProductEditCard
  // default-state notice to the InputsPanel ("Einstellungen anpassen").
  const [requestedInputsTab, setRequestedInputsTab] = useState<ProductId | null>(null)
  // PR 6: combine-mode Mein-Plan pane switcher removed — the Sober D
  // `MeinPlanPage` renders all sections inline. PR 9: compare-mode Vergleich
  // pane switcher likewise gone — `VergleichPage` is now a single linear
  // surface. No per-pane state needed.

  const {
    profile,
    setProfile,
    assumptions,
    setAssumptions,
    resetToDefaults,
    setSyncedMonthlyContribution,
    invalidLink,
    dismissInvalidLink,
  } = useCalculatorState()
  const portfolioState = usePortfolioState()
  const workspace = useWorkspace()

  // Issue #6: read `?view=<WorkspaceView>` query param once on mount and
  // override `activeView`. The override fires after useWorkspace has
  // initialised from localStorage so the stored value does not win.
  // `history.replaceState` removes the param so a refresh sees the
  // truly-saved state. Use the transient setter so the override does NOT
  // overwrite the user's previously-saved tab in localStorage.
  //
  // PR 9: the `?pane=<VergleichPaneSlug>` deep-linking is gone — the legacy
  // pane switcher has been collapsed into a single Sober D `VergleichPage`
  // surface, so there is no per-pane URL fragment to honour.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const viewParam = params.get('view')
    if (viewParam && (WORKSPACE_VIEWS as readonly string[]).includes(viewParam)) {
      workspace.setActiveViewTransient(viewParam as WorkspaceView)
      params.delete('view')
      const newSearch = params.toString()
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '')
      window.history.replaceState(null, '', newUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty: run once on mount only

  // Issue #13: landing-CTA preselection. App stores the LandingChoice and
  // mounts us; we apply mode + visibleProducts (compare) or open the wizard
  // (combine) on first effect-pass. Identical semantics to the old
  // `handleLandingChoice` that lived in App.tsx.
  const [wizardInitialProducts, setWizardInitialProducts] = useState<readonly ProductId[] | undefined>(
    undefined,
  )

  useEffect(() => {
    if (!pendingChoice) return
    if (pendingChoice.kind === 'compare') {
      portfolioState.setMode('compare')
      if (pendingChoice.visibleProducts) {
        const seed = [...pendingChoice.visibleProducts]
        setAssumptions((current) => ({ ...current, visibleProducts: seed }))
      }
      workspace.setActiveView('vergleich')
    } else if (pendingChoice.kind === 'combine') {
      portfolioState.setMode('combine')
      // One-shot initialization from a parent-provided choice. Calling
      // setState here is intentional: the wizard's initialEnabledProducts is
      // only read on its first render (after setShowInventoryWizard(true)),
      // and `onPendingChoiceConsumed` clears the prop so this effect runs
      // exactly once. The lint rule's "cascading renders" concern doesn't
      // apply to a one-shot mount-time hand-off like this.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWizardInitialProducts(pendingChoice.visibleProducts)
      setShowInventoryWizard(true)
    }
    onPendingChoiceConsumed?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChoice])

  // Workspace chrome QA instrumentation — topbar home button and mode badge.
  const { enabled: qaEnabled } = useQaMode()

  // Section-fallback targets for the two main workspace views. The hook gates
  // the data-qa-* attributes behind QA mode so non-QA sessions render no extra
  // attributes (PRD US-33 / "inert when disabled").
  const { targetProps: vergleichSectionProps } = useFeedbackTarget({
    id: 'results.section',
    label: 'Vergleich',
    precision: 'section',
  })
  const { targetProps: detailsSectionProps } = useFeedbackTarget({
    id: 'results.details.section',
    label: 'Details',
    precision: 'section',
  })

  // Push the live workspace view + mode into the QA-feedback context ref so
  // `?qa=1` reports include "Aktive Ansicht" / "Mode" instead of dashes.
  // No simulation deps; the ref read is cheap and runs only when these change.
  useEffect(() => {
    setQaWorkspaceContext({ activeView: workspace.activeView })
  }, [workspace.activeView])

  // Issue #91: reset scroll position to top on every main app view change so
  // users don't land halfway down an unrelated view (e.g. scrolled deep into
  // Vergleich charts then tapping Details & Export). `behavior: 'instant'`
  // avoids animation — the view swap already provides enough visual context.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [workspace.activeView])

  const combineSimulation = useCombineSimulation(portfolioState.workspace)
  const scenarioLib = useScenarioLibrary(profile, assumptions, setProfile, setAssumptions)
  // `ui` (WorkspaceUiState) is owned by `App` and threaded in via the
  // `workspaceUi` prop so `selectedScenarioId` survives SPA navigation to
  // `/vergleich/details` (PR 290 Codex P1).
  const result = useSimulationResult(profile, assumptions, ui.selectedScenarioId)
  const isCombineMode = portfolioState.mode === 'combine'
  const combineProfile = portfolioState.workspace.baseline.profile
  // In combine mode, resolve the effective scenario id against workspace
  // assumptions (not singleton) so custom scenarios added via the toolbar pill
  // are found and the pill highlights correctly. (#25 round 2)
  const combineEffectiveScenarioId = (() => {
    const scenarios = portfolioState.workspace.baseline.assumptions.returnScenarios
    return scenarios.some((s) => s.id === ui.selectedScenarioId)
      ? ui.selectedScenarioId
      : (scenarios.find((s) => s.id === 'basis')?.id ?? scenarios[0]?.id ?? 'basis')
  })()
  // In combine mode the CSV / print exports must consume portfolio output
  // rather than singleton-compare data (Group G issue 11). The bundle is
  // assembled lazily so compare-mode never pays the cost.
  const combineExportBundle = useMemo(() => {
    if (!isCombineMode) return undefined
    const wa = portfolioState.workspace.baseline.assumptions
    const scenarioLabels: Record<string, string> = {}
    for (const s of wa.returnScenarios) {
      scenarioLabels[s.id] = s.label
    }
    // Per-instance tax modes for Section 3 after-tax columns. Pure derivation
    // lives in combineCsvWiring so the production flow is unit-tested.
    const perInstanceTaxModes = deriveCombinePerInstanceTaxModes(wa, combineProfile)
    return {
      perInstance: combineSimulation.perInstance,
      combinedByScenarioId: combineSimulation.combinedByScenarioId,
      scenarioLabels,
      perInstanceTaxModes,
      inflationRate: wa.inflationRate,
    }
  }, [
    isCombineMode,
    combineSimulation.perInstance,
    combineSimulation.combinedByScenarioId,
    portfolioState.workspace.baseline.assumptions,
    combineProfile,
  ])

  // Sensitivity perturbation rows for the combine-mode print (PR 11 R1
  // scope restore + R2 perf fix). Each row drives a full
  // `runCombineSimulation` pass — up to 4 extra simulations per build.
  //
  // PR 11 R2 (Codex P1): the previous `useMemo` keyed on
  // `portfolioState.workspace` recomputed on every combine-mode workspace
  // mutation, so users paid the cost during normal editing even when they
  // never printed. The work is now deferred to `window.beforeprint` inside
  // `usePrintSensitivityRows` — initial value is `undefined`, the listener
  // computes + caches on first print, and subsequent workspace edits do not
  // trigger a recompute. PrintReport's `sensitivityRows && length > 0`
  // guard handles the empty / undefined branch gracefully.
  const printSensitivityRows = usePrintSensitivityRows({
    isCombineMode,
    workspace: portfolioState.workspace,
    combinedByScenarioId: combineSimulation.combinedByScenarioId,
    rules: de2026Rules,
  })
  const views = useDerivedViews(profile, assumptions, result, {
    showRealValues: ui.showRealValues,
    cashflowProductId: ui.cashflowProductId,
  }, {
    combineMode: isCombineMode,
    combine: combineExportBundle,
  })
  const { simulation, monteCarloResult, taxModes } = result
  const {
    visibleProducts,
    selectedResults,
    cashflowResult,
    effectiveCashflowProductId,
    insuranceResult,
    cashflowAnnualTaxSvSavings,
    rowAfterTaxBalance,
    linkCopied,
    handleCopyLink,
    handleExportCsv,
  } = views

  const { annualMin: bavMinAnnual, monthlyMin: bavMinMonthly } = computeBavMinimumEntitlement(de2026Rules)

  const hasComparisonSet = assumptions.visibleProducts.length > 0

  const sensitivityResult = useMemo(() => {
    if (!hasComparisonSet) return undefined
    return runSensitivity({
      profile,
      assumptions,
      rules: de2026Rules,
      visibleProducts: assumptions.visibleProducts,
    })
  }, [profile, assumptions, hasComparisonSet])

  // In combine mode the toolbar must read from and write to the workspace
  // baseline assumptions so that scenario/MC changes propagate to
  // `useCombineSimulation` (which reads `workspace.baseline.assumptions`).
  // The singleton `assumptions` / `setAssumptions` must NOT be used here —
  // those drive the compare-mode simulation only.  (#25)
  //
  // `ScenarioToolbar` uses a narrow `ToolbarAssumptions` interface
  // (returnScenarios + monteCarlo only) so it is structurally compatible with
  // both `ScenarioAssumptions` (compare) and `WorkspaceAssumptionsV2` (combine).
  // Each branch wraps the state setter with a merge so only the two touched
  // fields are updated while all other assumption fields are preserved.
  const toolbar = isCombineMode ? (
    <ScenarioToolbar
      assumptions={portfolioState.workspace.baseline.assumptions}
      onAssumptionsChange={(updater) => {
        const current = portfolioState.workspace.baseline.assumptions
        portfolioState.patchBaseline({
          assumptions: { ...current, ...updater(current) },
        })
      }}
      selectedScenarioId={combineEffectiveScenarioId}
      onSelectScenario={ui.setSelectedScenarioId}
    />
  ) : (
    <ScenarioToolbar
      assumptions={assumptions}
      onAssumptionsChange={(updater) => {
        setAssumptions((current) => ({ ...current, ...updater(current) }))
      }}
      selectedScenarioId={result.effectiveScenarioId}
      onSelectScenario={ui.setSelectedScenarioId}
    />
  )

  // In combine mode, pick the selected scenario (or 'basis' as fallback) from
  // the combined simulation bundle to drive the income summary panel and the
  // Lücke-schließen recommender. Using the selected scenario ensures the
  // modal result step reacts when the user switches the scenario picker (#08).
  // `combineEffectiveScenarioId` is already resolved against workspace
  // assumptions so custom scenarios are visible here too (#25 round 2).
  const combineSelectedScenarioId = combineSimulation.combinedByScenarioId[combineEffectiveScenarioId]
    ? combineEffectiveScenarioId
    : (portfolioState.workspace.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')?.id ??
       portfolioState.workspace.baseline.assumptions.returnScenarios[0]?.id ??
       'basis')
  const combineBasisScenarioId = combineSelectedScenarioId
  const combineBasisResult = combineSimulation.combinedByScenarioId[combineBasisScenarioId]
  const combineBasisLabel =
    portfolioState.workspace.baseline.assumptions.returnScenarios.find(
      (s) => s.id === combineBasisScenarioId,
    )?.label ?? 'Basis'
  // PR 9: compare-mode no longer renders a BreakEvenChart inline — the
  // lifecycle chart now lives on `/kapital` (PR 8), driven from its own
  // GRV-contribution timeline. The legacy `compareGrvContributionTimeline`
  // memo is therefore dropped.

  const vergleichView = (
    <section
      className="workspace-view workspace-view--vergleich"
      {...vergleichSectionProps}
    >
      {portfolioState.mode === 'combine' && (
        <div className="mein-plan-host">
          {/* Scenario toolbar stays above the Sober D page surface so the
              user can still switch scenarios and toggle Monte-Carlo without
              leaving Mein Plan. The pre-PR-6 `MeinPlanSidebar` + pane switcher
              is gone — every section now renders linearly inside MeinPlanPage. */}
          {toolbar}

          <MeinPlanPage
            workspace={portfolioState.workspace}
            perInstance={combineSimulation.perInstance}
            selectedScenarioId={combineBasisScenarioId}
            selectedScenarioLabel={combineBasisLabel}
            combinedForScenario={combineBasisResult}
            rules={de2026Rules}
            navigate={navigate}
          />

          {/* "Wo geht mein nächster Euro hin?" CTA. The previous
              "Optimiere deine Vorsorge" portfolio-audit modal was replaced
              in PR 7 by the per-instance `/vertrag/:instanceId` drill-in
              reached via the Mein Plan § 1 Zusammensetzung row links; the
              modal entry point is gone here. */}
          {combineBasisResult && (
            <div className="mein-plan-cta-row" role="group" aria-label="Plan anpassen">
              <button
                type="button"
                className="mein-plan-cta"
                onClick={() => setShowLueckeModal(true)}
              >
                Beiträge anpassen
              </button>
            </div>
          )}

          {showLueckeModal && combineBasisResult && (
            <LueckeSchliessenModal
              workspace={portfolioState.workspace}
              baselineCombined={combineBasisResult}
              baselinePerInstance={combineSimulation.perInstance}
              grvGrossMonthlyPension={combineSimulation.statutoryPension.grossMonthlyPension}
              selectedScenarioId={combineSelectedScenarioId}
              onClose={() => setShowLueckeModal(false)}
              onSaveAsPlan={(candidate) => {
                const whatIf = buildWhatIfFromCandidate(portfolioState.baseline, candidate)
                portfolioState.addWhatIf(whatIf)
              }}
            />
          )}
        </div>
      )}

      {/* Compare-mode surface (Group G issue 11): the new Sober D
          `VergleichPage` renders a single linear surface — rendite strip,
          neutral 6-product comparison table, pro/contra grid. Replaces the
          legacy pane switcher + per-pane chart components (PR 9).
          PR 10 threads `navigate` so the "Wohin geht das Geld →" drill-in
          link uses SPA navigation to `/vergleich/details`. */}
      {!isCombineMode && (
        <VergleichPage
          profile={profile}
          assumptions={assumptions}
          result={result}
          onAssumptionsChange={(updater) =>
            setAssumptions((current) => ({ ...current, ...updater(current) }))
          }
          selectedScenarioId={result.effectiveScenarioId}
          onSelectScenario={ui.setSelectedScenarioId}
          onOpenAngebot={() => workspace.setActiveView('angebot')}
          navigate={navigate}
        />
      )}
    </section>
  )

  const detailsView = (
    <section
      className="workspace-view workspace-view--details"
      {...detailsSectionProps}
    >
      {toolbar}

      {/* Combine-mode (Group G issue 11): the singleton compare detail panels
          (sensitivity, fairness, comparison table tied to visibleProducts) do
          not apply to a portfolio of actual contracts. Render the same
          export/print/assumption affordances driven from portfolio data. */}
      {isCombineMode ? (
        <>
          <CalculationWarnings />

          <CombineDetailView
            workspace={portfolioState.workspace}
            perInstance={combineSimulation.perInstance}
            selectedScenarioId={combineBasisScenarioId}
            selectedScenarioLabel={combineBasisLabel}
            combinedForScenario={combineSimulation.combinedByScenarioId[combineBasisScenarioId]}
            onExportCsv={handleExportCsv}
            onPrint={() => window.print()}
          />

          <AssumptionsPanel
            show={ui.showAssumptions}
            onToggle={() => ui.setShowAssumptions((v) => !v)}
            rules={de2026Rules}
            bavMinAnnual={bavMinAnnual}
            bavMinMonthly={bavMinMonthly}
          />
        </>
      ) : (
        <>
          <ComparisonPicker
            visible={assumptions.visibleProducts}
            onChange={(next) =>
              setAssumptions((current) => ({ ...current, visibleProducts: next }))
            }
          />

          {hasComparisonSet ? (
            <>
              <FeeDragChart
                selectedResults={selectedResults}
                productColors={PRODUCT_COLORS}
                retirementAge={profile.retirementAge}
                retirementEndAge={assumptions.retirementEndAge}
              />

              <MonteCarloPanel result={monteCarloResult} />

              <SensitivityPanel
                profile={profile}
                assumptions={assumptions}
                visibleProducts={assumptions.visibleProducts}
                precomputed={sensitivityResult}
              />

              <FairnessPanel
                profile={profile}
                assumptions={assumptions}
                bavFunding={simulation.bavFunding}
                rules={de2026Rules}
              />

              <CalculationWarnings />

              <AssumptionReviewPanel
                profile={profile}
                assumptions={assumptions}
                visibleProducts={assumptions.visibleProducts}
              />

              <DetailComparisonTable
                products={visibleProducts}
                linkCopied={linkCopied}
                onCopyLink={handleCopyLink}
                onExportCsv={handleExportCsv}
                onPrint={() => window.print()}
              />

              <CashflowTable
                cashflowResult={cashflowResult}
                selectedResults={selectedResults}
                cashflowProductId={effectiveCashflowProductId}
                cashflowAnnualTaxSvSavings={cashflowAnnualTaxSvSavings}
                onChangeCashflowProduct={(id) => ui.setCashflowProductId(id as ProductId)}
                rowAfterTaxBalance={rowAfterTaxBalance}
              />

              <AssumptionsPanel
                show={ui.showAssumptions}
                onToggle={() => ui.setShowAssumptions((v) => !v)}
                rules={de2026Rules}
                bavMinAnnual={bavMinAnnual}
                bavMinMonthly={bavMinMonthly}
              />
            </>
          ) : (
            <EmptyComparison onOpenAngebot={() => workspace.setActiveView('angebot')} />
          )}
        </>
      )}
    </section>
  )

  // Approach B (per orchestrator brief): branch in App.tsx so combine-mode renders
  // CombineDashboardSidebar (reads workspace state via usePortfolioState) while
  // compare-mode keeps the existing InputsPanel (reads singleton useCalculatorState).
  // useCalculatorState itself is NOT modified — it keeps driving compare-mode.
  const angebotView =
    portfolioState.mode === 'combine' ? (
      <section className="workspace-view workspace-view--angebot">
        <CombineDashboardSidebar
          baseline={portfolioState.baseline}
          assumptions={portfolioState.baseline.assumptions}
          whatIfs={portfolioState.whatIfs}
          onPatchAssumptions={(patch) =>
            portfolioState.patchBaseline({ assumptions: { ...portfolioState.baseline.assumptions, ...patch } })
          }
          onPatchBaseline={portfolioState.patchBaseline}
          addInstance={portfolioState.addInstance}
          removeInstance={portfolioState.removeInstance}
          onRebaseWhatIf={portfolioState.rebaseWhatIf}
          onFreezeWhatIf={portfolioState.freezeWhatIf}
          onArchiveAndRestart={() => portfolioState.archiveAndRestart()}
          onOpenDecisionMenu={setActiveMenuInstanceId}
        />
        {portfolioState.mode === 'combine' && activeMenuInstanceId !== null && (
          <ContractDecisionMenu
            workspace={portfolioState.workspace}
            instanceId={activeMenuInstanceId}
            onClose={() => setActiveMenuInstanceId(null)}
            onCreatePlans={(whatIfs) => {
              whatIfs.forEach((wi) => portfolioState.addWhatIf(wi))
              setActiveMenuInstanceId(null)
            }}
          />
        )}
      </section>
    ) : (
      <section className="workspace-view workspace-view--angebot">
        <InputsPanel
          profile={profile}
          onProfileChange={setProfile}
          assumptions={assumptions}
          onAssumptionsChange={setAssumptions}
          onSyncMonthlyContribution={setSyncedMonthlyContribution}
          resetToDefaults={resetToDefaults}
          simulation={simulation}
          selectedResults={selectedResults}
          scenarioLib={scenarioLib}
          kvdrMember={taxModes.kvdrMember}
          bavLumpSumTaxMode={taxModes.bavLumpSumTaxMode}
          insuranceTaxMode={taxModes.insuranceTaxMode}
          insuranceResult={insuranceResult}
          tarifgebunden={ui.tarifgebunden}
          onTarifgebundenChange={ui.setTarifgebunden}
          requestActiveTab={requestedInputsTab}
          onActiveTabConsumed={() => setRequestedInputsTab(null)}
        />
      </section>
    )

  const viewsByTab = {
    vergleich: vergleichView,
    details: detailsView,
    angebot: angebotView,
  }

  const topbarCopy = isCombineMode
    ? {
        kicker: 'Deine Verträge und Rentenlücke in Deutschland 2026',
        title: 'Mein Plan',
      }
    : {
        kicker: 'RentenWiki.de Deutschland 2026',
        title: 'ETF, bAV und private Versicherung vergleichen',
      }

  // The InventoryWizard is `position: fixed` so rendering it as a sibling of
  // <main> is fine — it covers the dashboard whenever showInventoryWizard is
  // true (whether triggered by a landing-CTA pendingChoice or by a returning
  // user opening it via the sidebar in the future).
  return (
    <>
      {showInventoryWizard && (
        <InventoryWizard
          grossSalaryYear={profile.grossSalaryYear}
          childBirthYears={profile.childBirthYears}
          age={profile.age}
          retirementAge={profile.retirementAge}
          publicHealthInsurance={profile.publicHealthInsurance}
          initialEnabledProducts={wizardInitialProducts}
          onComplete={(workspaceFromWizard) => {
            // #09: write the wizard's workspace into portfolioState BEFORE
            // setMode so the first combine-mode render sees the new data, not
            // stale defaults (replaceWorkspace is atomic; setMode would
            // otherwise overwrite with the old in-memory workspace).
            portfolioState.replaceWorkspace(workspaceFromWizard)
            // Mirror the personal details into the singleton profile +
            // statutoryPension so a later switch to compare-mode (or a
            // returning user clicking "Vergleich starten") sees the same
            // baseline rather than the engine defaults.
            setProfile((current) => ({
              ...current,
              age: workspaceFromWizard.baseline.profile.age,
              retirementAge: workspaceFromWizard.baseline.profile.retirementAge,
              grossSalaryYear: workspaceFromWizard.baseline.profile.grossSalaryYear,
              publicHealthInsurance: workspaceFromWizard.baseline.profile.publicHealthInsurance,
              childBirthYears: [...workspaceFromWizard.baseline.profile.childBirthYears],
            }))
            setAssumptions((current) => ({
              ...current,
              statutoryPension: {
                ...current.statutoryPension,
                pensionBaselineType: workspaceFromWizard.baseline.assumptions.statutoryPension.pensionBaselineType,
                currentEntgeltpunkte: workspaceFromWizard.baseline.assumptions.statutoryPension.currentEntgeltpunkte,
                manualMonthlyGross: workspaceFromWizard.baseline.assumptions.statutoryPension.manualMonthlyGross,
              },
            }))
            setShowInventoryWizard(false)
            setWizardInitialProducts(undefined)
            portfolioState.setMode('combine')
          }}
          onDismiss={() => {
            setShowInventoryWizard(false)
            setWizardInitialProducts(undefined)
          }}
        />
      )}
      {/*
        R3.1 (Batch 1): the legacy `<main class="app-shell">` +
        `<header class="topbar">` chrome is gone. The outer `AppShell`
        from `App.tsx` carries the brand chrome (PR 1); below that the
        dashboard renders an inline Sober D meta strip (mode-aware kicker
        + title + optional Mein-Plan badge + Home button), the
        token-driven `WorkspaceTabs` segmented control, and the per-view
        body. PrintReport + LegalFooter remain siblings of the body so
        the printable A4 report stays available regardless of the active
        tab.
      */}
      <div className="rw-dashboard-meta">
        <div className="rw-dashboard-meta__copy">
          <p className="rw-dashboard-meta__kicker">{topbarCopy.kicker}</p>
          <h1 className="rw-dashboard-meta__title">{topbarCopy.title}</h1>
        </div>
        <div className="rw-dashboard-meta__actions">
          {isCombineMode && (
            <span
              className="rw-dashboard-meta__badge"
              aria-label="Mein Plan aktiv"
              {...qaTargetAttrs(qaEnabled, { id: 'workspace.chrome.modeBadge', label: 'Mein Plan (Modus-Badge)' })}
            >
              Mein Plan
            </span>
          )}
          <button
            type="button"
            className="rw-dashboard-meta__home-btn"
            onClick={onGoHome}
            title="Zur Startseite"
            {...qaTargetAttrs(qaEnabled, { id: 'workspace.chrome.homeButton', label: 'Startseite / Moduswechsel' })}
          >
            <Home size={16} aria-hidden="true" />
            Startseite
          </button>
        </div>
      </div>

      {invalidLink && (
        <ErrorStatePanel
          tone="error"
          message="Dieser Link ist ungültig oder abgelaufen. Es werden stattdessen die gespeicherten oder Standard-Eingaben angezeigt."
          onDismiss={dismissInvalidLink}
          className="rw-error-state--banner"
        />
      )}

      <WorkspaceTabs
        tabs={buildWorkspaceTabs(isCombineMode)}
        activeId={workspace.activeView}
        onSelect={workspace.setActiveView}
      />

      <section className="rw-dashboard-body">
        {viewsByTab[workspace.activeView as keyof typeof viewsByTab] ?? vergleichView}
      </section>

      <PrintReport
        profile={profile}
        assumptions={assumptions}
        simulation={simulation}
        combineMode={isCombineMode}
        portfolio={combineExportBundle}
        combineProfile={isCombineMode ? portfolioState.workspace.baseline.profile : undefined}
        combineGrv={isCombineMode ? combineSimulation.statutoryPension : undefined}
        combineReturnScenarios={
          isCombineMode
            ? portfolioState.workspace.baseline.assumptions.returnScenarios
            : undefined
        }
        combineWorkspace={isCombineMode ? portfolioState.workspace : undefined}
        combineSensitivityRows={printSensitivityRows}
      />

      <LegalFooter navigate={navigate} />
    </>
  )
}

export default Calculator
