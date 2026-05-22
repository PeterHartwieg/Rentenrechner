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
import { useDerivedViews } from './app/useDerivedViews'
import { useSimulationResult } from './app/useSimulationResult'
import type { WorkspaceUiState } from './app/useWorkspaceUiState'
import { usePortfolioState } from './app/portfolioState'
import { ROUTES } from './app/useRoute'
import type { Route } from './app/useRoute'
import { PRODUCT_MANIFEST } from './app/productPresentation'
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
import { useCombineSimulation } from './app/useCombineSimulation'
import { LueckeSchliessenModal } from './features/dashboard/LueckeSchliessenModal'
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
// `VergleichPage`.
//
// Workspace-tabs collapse (this PR): the per-workspace nav strip
// (`Eingaben/Vergleich/Details & Export` and the combine-mode swap) is gone.
// Inputs (compare + combine) moved to `/eingaben` § 5 via
// `AngabenProduktSection`. Vergleich and Details & Export now render as one
// linear surface here, scrolled via the chrome nav's existing routing.

// Workspace-context value pushed into the QA-feedback ref. The legacy
// `activeView` field tracked the now-removed workspace tab; passing a stable
// `'vergleich'` keeps QA reports populated without claiming a tab still
// exists. Defined as a module constant so the `useEffect` below sees a stable
// reference and never re-fires.
const QA_WORKSPACE_CONTEXT = { activeView: 'vergleich' } as const

interface CalculatorProps {
  navigate: (target: Route, search?: string, hash?: string) => void
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
   * Workspace UI toggles owned by `App` so `selectedScenarioId` survives SPA
   * navigation to `/vergleich/details` (PR 290 Codex P1 fix). When the user
   * picks a non-basis scenario on `VergleichPage`, the drill-in receives the
   * same id from App's lifted `useWorkspaceUiState` call.
   */
  workspaceUi: WorkspaceUiState
}

function Calculator({ navigate, pendingChoice, onPendingChoiceConsumed, workspaceUi: ui }: CalculatorProps) {
  const [showInventoryWizard, setShowInventoryWizard] = useState(false)
  const [showLueckeModal, setShowLueckeModal] = useState(false)
  // PR 6: combine-mode Mein-Plan pane switcher removed — the Sober D
  // `MeinPlanPage` renders all sections inline. PR 9: compare-mode Vergleich
  // pane switcher likewise gone — `VergleichPage` is now a single linear
  // surface. No per-pane state needed.

  const {
    profile,
    setProfile,
    assumptions,
    setAssumptions,
    invalidLink,
    dismissInvalidLink,
  } = useCalculatorState()
  const portfolioState = usePortfolioState()

  // Workspace-tabs collapse (this PR): the pre-existing `?view=<WorkspaceView>`
  // deep-link is gone — the tab strip it routed to was removed. Any legacy
  // share-URL that still carries `?view=…` is silently ignored; the chrome
  // nav owns route-level navigation, and Inputs live at `/eingaben`.
  //
  // PR 9: the `?pane=<VergleichPaneSlug>` deep-linking is gone — the legacy
  // pane switcher has been collapsed into a single Sober D `VergleichPage`
  // surface, so there is no per-pane URL fragment to honour.

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

  // Workspace chrome QA instrumentation — mode badge.
  const { enabled: qaEnabled } = useQaMode()

  // Section-fallback targets for the two main workspace surfaces. The hook
  // gates the data-qa-* attributes behind QA mode so non-QA sessions render
  // no extra attributes (PRD US-33 / "inert when disabled"). The legacy
  // workspace-tab nav is gone (this PR) but the section ids stay so existing
  // QA report selectors keep resolving against the inlined surface below.
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

  // Push a stable workspace context into the QA-feedback ref. The pre-collapse
  // implementation stamped the live tab id; with tabs gone the constant keeps
  // `?qa=1` reports populated (the field is still read by the report
  // assembler) without claiming a tab still exists.
  useEffect(() => {
    setQaWorkspaceContext(QA_WORKSPACE_CONTEXT)
  }, [])

  const combineSimulation = useCombineSimulation(portfolioState.workspace)
  // Workspace-tabs collapse: `useScenarioLibrary` was wired into the
  // `InputsPanel` that moved to `/eingaben` § 5; the singleton scenario lib
  // is now mounted there. The dashboard no longer needs it.
  //
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
  const { simulation, monteCarloResult } = result
  const {
    visibleProducts,
    selectedResults,
    cashflowResult,
    effectiveCashflowProductId,
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

  // Workspace-tabs collapse (this PR): the page body renders as a single
  // linear surface — the Vergleich/Mein-Plan headline view followed by the
  // Details & Export section. Inputs (compare) and the per-contract sidebar
  // (combine) moved to `/eingaben` § 5; the old `angebot` tab + workspace
  // tab strip are gone, along with the per-tab scroll-on-change effect
  // (chrome nav's `navigate()` already scrolls).
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
          onOpenAngebot={() => navigate(ROUTES.eingaben, undefined, '#produkt')}
          navigate={navigate}
        />
      )}
    </section>
  )

  const detailsView = (
    <section
      id="details"
      className="workspace-view workspace-view--details"
      {...detailsSectionProps}
    >
      {/* No second toolbar — the linear layout already shows it above. */}

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
            <EmptyComparison onOpenAngebot={() => navigate(ROUTES.eingaben, undefined, '#produkt')} />
          )}
        </>
      )}
    </section>
  )

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
        + title + optional Mein-Plan badge). PrintReport + LegalFooter
        remain siblings of the body so the printable A4 report stays
        available regardless of route.

        Workspace-tabs collapse (this PR): the `WorkspaceTabs` segmented
        control between the meta strip and the body is removed. The chrome
        nav (AppHeader) already exposes Startseite as its first tab, so the
        duplicate "Startseite" button on the meta strip is gone too.
      */}
      <div className="rw-dashboard-meta">
        <div className="rw-dashboard-meta__copy">
          <p className="rw-dashboard-meta__kicker">{topbarCopy.kicker}</p>
          <h1 className="rw-dashboard-meta__title">{topbarCopy.title}</h1>
        </div>
        {isCombineMode && (
          <div className="rw-dashboard-meta__actions">
            <span
              className="rw-dashboard-meta__badge"
              aria-label="Mein Plan aktiv"
              {...qaTargetAttrs(qaEnabled, { id: 'workspace.chrome.modeBadge', label: 'Mein Plan (Modus-Badge)' })}
            >
              Mein Plan
            </span>
          </div>
        )}
      </div>

      {invalidLink && (
        <ErrorStatePanel
          tone="error"
          message="Dieser Link ist ungültig oder abgelaufen. Es werden stattdessen die gespeicherten oder Standard-Eingaben angezeigt."
          onDismiss={dismissInvalidLink}
          className="rw-error-state--banner"
        />
      )}

      <section className="rw-dashboard-body">
        {vergleichView}
        {detailsView}
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
