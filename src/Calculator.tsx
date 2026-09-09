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
import { buildAllProductsSimulation } from './app/buildAllProductsSimulation'
import { buildCombinePortfolioCsv, buildExportCsv, downloadCsv } from './utils/csvExport'
import { hasShareStateInUrl } from './utils/urlShareDetect'
import { householdTotalBlockedLabels, selectResultReadiness } from './app/resultReadiness'
import { selectPlanSummary } from './app/planSummary'
import type { PlanSourceRow } from './app/planSummary'
import { useCalculatorState } from './app/useCalculatorState'
import { useDerivedViews } from './app/useDerivedViews'
import { useSimulationResult } from './app/useSimulationResult'
import type { WorkspaceUiState } from './app/useWorkspaceUiState'
import { hasStartedPlan, usePortfolioState } from './app/portfolioState'
import type { Route } from './app/useRoute'
import { ROUTES } from './app/useRoute'
import { CalculationWarnings } from './features/results/CalculationWarnings'
import { CombineDetailView } from './features/results/CombineDetailView'
import { PrintReport } from './features/results/PrintReport'
import { usePrintSensitivityRows } from './app/usePrintSensitivityRows'
import { AssumptionsPanel } from './features/assumptions/AssumptionsPanel'
import { ScenarioToolbar } from './features/workspace/ScenarioToolbar'
import type { LandingChoice } from './features/landing/LandingPage'
import { InventoryWizard } from './features/inventory/InventoryWizard'
import { createFreshOnboardingScenario } from './features/inventory/onboardingDraft'
import { useCombineSimulation } from './app/useCombineSimulation'
import { LueckeSchliessenModal } from './features/dashboard/LueckeSchliessenModal'
import { buildWhatIfFromCandidate } from './app/recommender'
import { LegalFooter } from './features/legal/LegalFooter'
import { ErrorStatePanel } from './ui/chrome/ErrorStatePanel'
import {
  setQaWorkspaceContext,
  useFeedbackTarget,
} from './features/qa-feedback'

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
  // Which onboarding step the wizard should open on when it is used as the
  // profile / pension editor from the plan.
  const [wizardInitialStep, setWizardInitialStep] = useState<'profile' | 'pension' | null>(null)
  const [freshOnboardingScenario] = useState(createFreshOnboardingScenario)
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
      // The comparison lives at `/vergleich` now and App navigates there, so
      // this branch is only reached by a caller that mounts Calculator with a
      // compare choice directly. Seed `visibleProducts` but do NOT flip the
      // workspace mode — `/` is the plan, and the comparison must never
      // rewrite the plan's mode.
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

  // Which surface `/` renders.
  //
  //   `?s=` share link  → the compare journey, exactly as before (a share URL
  //                       carries singleton compare state and nothing else).
  //   otherwise         → the personal plan, for every saved mode.
  //
  // A user whose saved mode is still `'compare'` (legacy v1 key, or v2 with
  // `mode: 'compare'`) therefore lands on the plan's not-started state rather
  // than on the comparison — the comparison stays reachable at `/vergleich`.
  // Nothing here writes `workspace.mode`; the wizard's `onComplete` is the
  // only place that promotes the workspace to `'combine'`.
  const [isShareView] = useState(() => hasShareStateInUrl())
  const isCombineMode = !isShareView
  const planNotStarted = !hasStartedPlan(portfolioState.workspace)
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

  // PR 332 R2 (Codex P2): compare-mode all-6-products simulation lifted
  // from VergleichPage's local useMemo to here. The Sober D
  // `VergleichPage` (PR 329 R1) renders all 6 products always — even when
  // the user's `visibleProducts` is a subset — and the print compare-mode
  // mirror (PR R3) does the same. Owning the simulation here lets us:
  //   1. Power a new `handleExportCsvAllProducts` so the CSV matches
  //      what the user sees on `/vergleich` (the prior `handleExportCsv`
  //      from `useDerivedViews` was filtered by `assumptions.visibleProducts`).
  //   2. Thread the same result into VergleichPage and PrintReport
  //      (collapses their duplicate useMemos into a shared source).
  //
  // Mirrors `useSimulationResult`'s construction exactly: normalize the
  // monthly netto-belastung, then `syncMonthlyContributions` so the
  // bavFunding two-pass + fair-comparison invariant still hold.
  //
  // Returns null in combine-mode — there is no compare-mode export path
  // there; the combine-mode `handleExportCsv` from useDerivedViews
  // continues to drive the per-instance + combined CSV.
  const compareAllProductsSimulation = useMemo(() => {
    if (isCombineMode) return null
    return buildAllProductsSimulation(profile, assumptions)
  }, [isCombineMode, profile, assumptions])

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
  const { simulation } = result
  const {
    handleCopyLink,
    linkCopied,
  } = views

  // PR 332 R2 (Codex P2): compare-mode CSV export aligned with what
  // VergleichPage actually renders. `useDerivedViews.handleExportCsv` is
  // built from the singleton simulation filtered by
  // `assumptions.visibleProducts`, which can be a subset (the user's
  // `/eingaben` selection). VergleichPage forces all 6 products on screen,
  // so a stale subset would diverge from the CSV. We rebuild the export
  // here against `compareAllProductsSimulation` so the file matches the
  // page byte-for-byte (all 6 rows in registry/payout order).
  //
  // Combine-mode uses `handleExportCsvCombine` above (same per-instance +
  // combined CSV, plus the blocked-total labels); compare-mode swaps in this
  // handler for VergleichPage's action bar.
  function handleExportCsvAllProducts(): void {
    if (!compareAllProductsSimulation) return
    const csv = buildExportCsv({
      products: compareAllProductsSimulation.products,
      bavAnnualTaxSvSavings: compareAllProductsSimulation.bavFunding.annualTaxAndSvSavings,
      bavProfile: profile,
      bavKvdrMember: result.taxModes.kvdrMember,
      bavOtherAnnualIncome: assumptions.bav.monthlyOtherRetirementIncome * 12,
      insuranceTaxMode: result.taxModes.insuranceTaxMode,
      equityPartialExemption: assumptions.etf.equityPartialExemption,
      insuranceOtherAnnualIncome: assumptions.insurance.monthlyOtherRetirementIncome * 12,
      avdOtherAnnualIncome: assumptions.altersvorsorgedepot.monthlyOtherRetirementIncome * 12,
      riesterOtherAnnualIncome: assumptions.riester.monthlyOtherRetirementIncome * 12,
      rules: de2026Rules,
      inflationRate: assumptions.inflationRate,
    })
    downloadCsv('rentenwiki-export.csv', csv)
  }

  const { annualMin: bavMinAnnual, monthlyMin: bavMinMonthly } = computeBavMinimumEntitlement(de2026Rules)

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

  // ---------------------------------------------------------------------------
  // Plan readiness + summary (simplification phase 2D wiring).
  //
  // `selectResultReadiness` decides whether the household total may be shown
  // at all; `householdTotalBlockedLabels` turns a blocking verdict into the
  // German labels the CSV/PDF print instead of a number. Passing them into the
  // export options is what *arms* the suppression delivered in Phase 1 — until
  // this call site existed, exports behaved exactly as before.
  // ---------------------------------------------------------------------------
  const readiness = useMemo(
    () =>
      selectResultReadiness(
        portfolioState.workspace,
        combineSimulation,
        combineSimulation.error,
      ),
    [portfolioState.workspace, combineSimulation],
  )
  const planSummary = useMemo(
    () =>
      selectPlanSummary(portfolioState.workspace, combineSimulation, combineBasisScenarioId, {
        simulationError: combineSimulation.error,
        rules: de2026Rules,
      }),
    [portfolioState.workspace, combineSimulation, combineBasisScenarioId],
  )
  const householdTotalBlocked = useMemo(() => {
    if (readiness.canShowHouseholdTotal) return undefined
    return { reasonLabels: householdTotalBlockedLabels(readiness) }
  }, [readiness])

  // One-level undo, surfaced on the plan. `portfolioState.lastUndo` is a
  // module-level handle, so a contract removed on `/vertrag/:id/bearbeiten`
  // still offers "Rückgängig" here after the redirect back to `/`. Consuming
  // or superseding it clears the handle in `portfolioState`, so the banner
  // disappears on its own.
  const { lastUndo, undo: undoWorkspace } = portfolioState
  const planNotification = useMemo(() => {
    if (!lastUndo) return undefined
    return { message: lastUndo.label, onUndo: () => undoWorkspace(lastUndo) }
  }, [lastUndo, undoWorkspace])

  // Plan navigation callbacks handed to MeinPlanPage.
  function handleAddContract(): void {
    navigate(ROUTES.vorsorgeNeu)
  }
  function handleEditSource(row: PlanSourceRow): void {
    if (row.target) {
      navigate(row.target)
      return
    }
    if (row.instanceId) {
      navigate(ROUTES.vertragBearbeiten(row.instanceId))
    }
  }
  function handleEditProfile(): void {
    setWizardInitialStep('profile')
    setShowInventoryWizard(true)
  }
  function handleEditPension(): void {
    setWizardInitialStep('pension')
    setShowInventoryWizard(true)
  }

  // Combine-mode CSV. Built here rather than through `useDerivedViews` so the
  // blocked-total labels can ride along — `CombineExportBundle` has no slot for
  // them and widening it would touch a file this phase does not own.
  function handleExportCsvCombine(): void {
    if (!combineExportBundle) return
    const csv = buildCombinePortfolioCsv({
      ...combineExportBundle,
      rules: de2026Rules,
      profile: combineProfile,
      inflationRate:
        combineExportBundle.inflationRate ??
        portfolioState.workspace.baseline.assumptions.inflationRate,
      householdTotalBlocked,
    })
    downloadCsv('rentenwiki-export.csv', csv)
  }
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
      {isCombineMode && (
        <div className="mein-plan-host">
          <MeinPlanPage
            workspace={portfolioState.workspace}
            perInstance={combineSimulation.perInstance}
            selectedScenarioId={combineBasisScenarioId}
            selectedScenarioLabel={combineBasisLabel}
            combinedForScenario={combineBasisResult}
            rules={de2026Rules}
            navigate={navigate}
            summary={planSummary}
            readiness={readiness}
            planNotStarted={planNotStarted}
            notification={planNotification}
            onAddContract={handleAddContract}
            onEditSource={handleEditSource}
            onEditProfile={handleEditProfile}
            onEditPension={handleEditPension}
            onSetTarget={(value) => portfolioState.patchBaseline({
              profile: { ...portfolioState.baseline.profile, desiredNetMonthlyPension: value },
            })}
          />

          <div className="rw-plan-secondary">
            <details className="rw-plan-disclosure">
              <summary>Annahmen &amp; Risiko</summary>
              <div className="rw-plan-disclosure__body">
                {toolbar}
                <AssumptionsPanel
                  show={ui.showAssumptions}
                  onToggle={() => ui.setShowAssumptions((v) => !v)}
                  rules={de2026Rules}
                  bavMinAnnual={bavMinAnnual}
                  bavMinMonthly={bavMinMonthly}
                />
                <CalculationWarnings />
              </div>
            </details>

            <details className="rw-plan-disclosure">
              <summary>Empfehlung: Wo geht mein nächster Euro hin?</summary>
              <div className="rw-plan-disclosure__body">
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
              </div>
            </details>
          </div>

          {showLueckeModal && combineBasisResult && (
            <LueckeSchliessenModal
              workspace={portfolioState.workspace}
              baselineCombined={combineBasisResult}
              baselinePerInstance={combineSimulation.perInstance}
              portfolioFunding={combineSimulation.portfolioFunding}
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
          allProductsSimulation={compareAllProductsSimulation ?? undefined}
          onAssumptionsChange={(updater) =>
            setAssumptions((current) => ({ ...current, ...updater(current) }))
          }
          selectedScenarioId={result.effectiveScenarioId}
          onSelectScenario={ui.setSelectedScenarioId}
          navigate={navigate}
          onPrint={() => window.print()}
          onExportCsv={handleExportCsvAllProducts}
          onCopyLink={handleCopyLink}
          linkCopied={linkCopied}
        />
      )}
    </section>
  )

  // PR R4: compare-mode legacy panels (ComparisonPicker, FeeDragChart,
  // MonteCarloPanel, SensitivityPanel, FairnessPanel, AssumptionReviewPanel,
  // DetailComparisonTable, CashflowTable, AssumptionsPanel, EmptyComparison)
  // have been removed. The Sober D VergleichPage (in vergleichView above) is
  // now the single linear surface for compare-mode. Combine-mode is unchanged.
  const detailsView = isCombineMode ? (
    <section
      id="details"
      className="workspace-view workspace-view--details rw-plan-secondary"
      {...detailsSectionProps}
    >
      <details className="rw-plan-disclosure">
        <summary>Details &amp; Export</summary>
        <div className="rw-plan-disclosure__body">
          {!readiness.canShowHouseholdTotal && (
            <p>Diese Zahlen rechnen vorläufig mit Modellwerten für unbekannte Angaben; die Gesamtsumme oben bleibt offen.</p>
          )}
          <CombineDetailView
            workspace={portfolioState.workspace}
            perInstance={combineSimulation.perInstance}
            selectedScenarioId={combineBasisScenarioId}
            selectedScenarioLabel={combineBasisLabel}
            combinedForScenario={combineSimulation.combinedByScenarioId[combineBasisScenarioId]}
            onExportCsv={handleExportCsvCombine}
            onPrint={() => window.print()}
          />
        </div>
      </details>
    </section>
  ) : null

  // The InventoryWizard is `position: fixed` so rendering it as a sibling of
  // <main> is fine — it covers the dashboard whenever showInventoryWizard is
  // true (whether triggered by a landing-CTA pendingChoice or by a returning
  // user opening it via the sidebar in the future).
  return (
    <>
      {showInventoryWizard && (
        <InventoryWizard
          scenario={hasStartedPlan(portfolioState.workspace) ? portfolioState.baseline : freshOnboardingScenario}
          initialStep={wizardInitialStep ?? 'profile'}
          mode={hasStartedPlan(portfolioState.workspace) ? 'edit' : 'onboarding'}
          onComplete={(scenario) => {
            portfolioState.replaceWorkspace({
              ...portfolioState.workspace,
              mode: 'combine',
              baseline: scenario,
            })
            // Keep the compare singleton's existing profile/pension mirror.
            setProfile((current) => ({
              ...current,
              age: scenario.profile.age,
              retirementAge: scenario.profile.retirementAge,
              grossSalaryYear: scenario.profile.grossSalaryYear,
              publicHealthInsurance: scenario.profile.publicHealthInsurance,
              childBirthYears: [...scenario.profile.childBirthYears],
            }))
            setAssumptions((current) => ({
              ...current,
              statutoryPension: {
                ...current.statutoryPension,
                ...scenario.assumptions.statutoryPension,
              },
            }))
            const firstProduct = wizardInitialProducts?.[0]
            setShowInventoryWizard(false)
            setWizardInitialProducts(undefined)
            setWizardInitialStep(null)
            portfolioState.setMode('combine')
            if (firstProduct) navigate(ROUTES.vorsorgeNeu, `?produkt=${encodeURIComponent(firstProduct)}`)
          }}
          onDismiss={() => {
            setShowInventoryWizard(false)
            setWizardInitialProducts(undefined)
            setWizardInitialStep(null)
          }}
        />
      )}
      {/*
        R3.1 (Batch 1) introduced an inline Sober D meta strip (mode-aware
        kicker + title + optional Mein-Plan badge). The strip was removed
        in a later iteration because both surfaces below — `VergleichPage`
        (compare) and `MeinPlanPage` (combine) — now render their own
        kicker + H1 inside the Sober D shell, so the chrome heading became
        a duplicate "two-headers" pattern. The outer `AppShell` from
        `App.tsx` still carries the brand chrome (PR 1); PrintReport +
        LegalFooter remain siblings of the body so the printable A4 report
        stays available regardless of route.
      */}
      {portfolioState.storageError && (
        <ErrorStatePanel
          tone="error"
          message="Speichern nicht möglich. Deine Änderungen sind noch nicht dauerhaft gesichert."
          className="rw-error-state--banner"
        />
      )}

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
        compareAllProductsSimulation={compareAllProductsSimulation ?? undefined}
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
        combineHouseholdTotalBlocked={isCombineMode ? householdTotalBlocked : undefined}
        selectedScenarioId={!isCombineMode ? result.effectiveScenarioId : undefined}
      />

      <LegalFooter navigate={navigate} />
    </>
  )
}

export default Calculator
