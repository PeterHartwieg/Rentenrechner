import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BarChart3, FileSpreadsheet, Home, Pencil } from 'lucide-react'
import type { ProductId } from './domain'
import type { InstanceTaxModes } from './utils/csvExport'
import { computeBavMinimumEntitlement } from './engine/bavWarnings'
import { deriveBavLumpSumTaxMode } from './engine/bavPayout'
import { deriveInsuranceTaxMode, computeRuntimeYearsAtRetirement } from './engine/insurancePayout'
import { deriveRentenluckeOverviewFromCombine } from './app/simulationSelectors'
import { de2026Rules } from './rules/de2026'
import { useCalculatorState } from './app/useCalculatorState'
import { useScenarioLibrary } from './app/useScenarioLibrary'
import { useDerivedViews } from './app/useDerivedViews'
import { useSimulationResult } from './app/useSimulationResult'
import { useWorkspaceUiState } from './app/useWorkspaceUiState'
import { useWorkspace } from './app/useWorkspace'
import type { WorkspaceView } from './app/useWorkspace'
import { usePortfolioState } from './app/portfolioState'
import { useRoute, detectSavedMode, appViewFromMode } from './app/useRoute'
import type { AppView } from './app/useRoute'
import { PRODUCT_MANIFEST } from './app/productPresentation'
import { InputsPanel } from './features/inputs/InputsPanel'
import { SummaryMetrics } from './features/results/SummaryMetrics'
import { DecisionSummary } from './features/results/DecisionSummary'
import { ProductEditCards } from './features/results/ProductEditCards'
import { ResultWaterfalls } from './features/results/ResultWaterfall'
import { SensitivityPanel } from './features/results/SensitivityPanel'
import { runSensitivity } from './features/results/sensitivity'
import { CapitalChart } from './features/results/CapitalChart'
import { PensionChart } from './features/results/PensionChart'
import { BreakEvenChart } from './features/results/BreakEvenChart'
import { FairnessPanel } from './features/results/FairnessPanel'
import { FeeDragChart } from './features/results/FeeDragChart'
import { MonteCarloHighlights } from './features/results/MonteCarloHighlights'
import { MonteCarloPanel } from './features/results/MonteCarloPanel'
import { CalculationWarnings } from './features/results/CalculationWarnings'
import { DetailComparisonTable } from './features/results/DetailComparisonTable'
import { CombineDetailView } from './features/results/CombineDetailView'
import { PrintReport } from './features/results/PrintReport'
import { CashflowTable } from './features/cashflows/CashflowTable'
import { AssumptionsPanel } from './features/assumptions/AssumptionsPanel'
import { AssumptionReviewPanel } from './features/results/AssumptionReviewPanel'
import { ComparisonPicker } from './features/workspace/ComparisonPicker'
import { EmptyComparison } from './features/workspace/EmptyComparison'
import { DisclaimerBanner } from './features/workspace/DisclaimerBanner'
import { ScenarioToolbar } from './features/workspace/ScenarioToolbar'
import { LandingPage } from './features/landing/LandingPage'
import type { LandingChoice } from './features/landing/LandingPage'
import { InventoryWizard } from './features/inventory/InventoryWizard'
import { CombineDashboardSidebar, AddVertragSection } from './features/inventory/CombineDashboardSidebar'
import { CombineIncomePanel } from './features/inventory/CombineIncomePanel'
import { useCombineSimulation } from './app/useCombineSimulation'
import { LueckeSchliessenModal } from './features/dashboard/LueckeSchliessenModal'
import { RentenluckeDashboard } from './features/dashboard/RentenluckeDashboard'
import { ContractDecisionMenu } from './features/dashboard/ContractDecisionMenu'
import { buildWhatIfFromCandidate } from './app/recommender'
import {
  buildPortfolioLifecycleViews,
  PORTFOLIO_LIFECYCLE_ID,
} from './features/results/portfolioLifecycle'
import { LIFECYCLE_HORIZON_AGE } from './features/results/lifecycleHorizon'
import { ImpressumPage } from './features/legal/ImpressumPage'
import { DatenschutzPage } from './features/legal/DatenschutzPage'
import { LegalFooter } from './features/legal/LegalFooter'
import { QaFeedbackProvider, QaModeIndicator, setQaWorkspaceContext } from './features/qa-feedback'
import './App.css'

const PRODUCT_COLORS = Object.fromEntries(PRODUCT_MANIFEST.map(m => [m.id, m.color]))
const PORTFOLIO_COLOR = '#1f2937'

type ShellTabDef = {
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

type ShellWorkspaceTabsProps = {
  activeView: WorkspaceView
  combineMode: boolean
  onSelect: (view: WorkspaceView) => void
}

function ShellWorkspaceTabs({ activeView, combineMode, onSelect }: ShellWorkspaceTabsProps) {
  return (
    <nav className="workspace-tabs" aria-label="Ansicht wählen">
      <div className="workspace-tabs-inner" role="tablist">
        {SHELL_TABS.map((tab) => {
          const Icon = tab.icon
          const active = tab.id === activeView
          const label = combineMode ? tab.combineLabel : tab.compareLabel
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? 'workspace-tab active' : 'workspace-tab'}
              onClick={() => onSelect(tab.id)}
              data-qa-target={`workspace.tabs.${tab.id}`}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function App() {
  const { route, navigate } = useRoute()
  let body: ReactNode
  if (route === '/impressum') body = <ImpressumPage navigate={navigate} />
  else if (route === '/datenschutz') body = <DatenschutzPage navigate={navigate} />
  else body = <Calculator navigate={navigate} />
  // QA feedback mode (issue 02 — Phase 1 Lane A). Wraps the entire route
  // surface so the overlay can target legal pages too. Inert when disabled
  // (?qa=1 / ?qa=0 controls activation; sessionStorage persists per session).
  return (
    <QaFeedbackProvider>
      {body}
      <QaModeIndicator />
    </QaFeedbackProvider>
  )
}

interface CalculatorProps {
  navigate: (target: '/' | '/impressum' | '/datenschutz') => void
}

function Calculator({ navigate }: CalculatorProps) {
  // AppView controls the landing vs dashboard decision for route `/`.
  // Reads saved mode once on mount; thereafter in-memory state drives transitions.
  const [appView, setAppView] = useState<AppView>(() => appViewFromMode(detectSavedMode()))
  const [showInventoryWizard, setShowInventoryWizard] = useState(false)
  const [showLueckeModal, setShowLueckeModal] = useState(false)
  const [activeMenuInstanceId, setActiveMenuInstanceId] = useState<string | null>(null)
  // Issue 23: product tab to pre-select when navigating from a ProductEditCard
  // default-state notice to the InputsPanel ("Einstellungen anpassen").
  const [requestedInputsTab, setRequestedInputsTab] = useState<ProductId | null>(null)

  const {
    profile,
    setProfile,
    assumptions,
    setAssumptions,
    resetToDefaults,
    setSyncedMonthlyContribution,
  } = useCalculatorState()
  const portfolioState = usePortfolioState()
  const workspace = useWorkspace()

  // Push the live workspace view + mode into the QA-feedback context ref so
  // `?qa=1` reports include "Aktive Ansicht" / "Mode" instead of dashes.
  // No simulation deps; the ref read is cheap and runs only when these change.
  useEffect(() => {
    setQaWorkspaceContext({ activeView: workspace.activeView })
  }, [workspace.activeView])

  const combineSimulation = useCombineSimulation(portfolioState.workspace)
  const scenarioLib = useScenarioLibrary(profile, assumptions, setProfile, setAssumptions)
  const ui = useWorkspaceUiState()
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
    // Per-instance tax modes for Section 3 after-tax columns (issue #24 follow-up).
    // Mirrors the derivation in simulationContext.ts / simulationSelectors.ts but
    // applied per-instance so each contract's era/Durchführungsweg is respected.
    const perInstanceTaxModes: Record<string, InstanceTaxModes> = {}
    for (const inst of wa.bav) {
      perInstanceTaxModes[inst.instanceId] = {
        bavTaxMode: deriveBavLumpSumTaxMode(inst.durchfuehrungsweg, inst.pre2005EligibleTaxFree),
      }
    }
    for (const inst of wa.insurance) {
      const runtimeYears = computeRuntimeYearsAtRetirement(
        inst.contractStartYear,
        de2026Rules.year,
        combineProfile.age,
        combineProfile.retirementAge,
      )
      perInstanceTaxModes[inst.instanceId] = {
        insuranceTaxMode: deriveInsuranceTaxMode(
          inst.contractStartYear,
          runtimeYears,
          combineProfile.retirementAge,
          inst.oldContractTaxFreeEligible,
        ),
      }
    }
    for (const inst of wa.etf) {
      perInstanceTaxModes[inst.instanceId] = {
        equityPartialExemption: inst.equityPartialExemption,
      }
    }
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
  const views = useDerivedViews(profile, assumptions, result, {
    showRealValues: ui.showRealValues,
    cashflowProductId: ui.cashflowProductId,
  }, {
    combineMode: isCombineMode,
    combine: combineExportBundle,
  })
  const { simulation, monteCarloResult, selectedScenario, taxModes } = result
  const {
    visibleProducts,
    selectedResults,
    capitalChartData,
    pensionBars,
    bestCapital,
    bestPension,
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

  // -------------------------------------------------------------------------
  // Landing page handlers (Group G issue 04)
  // -------------------------------------------------------------------------

  /**
   * Handle the user's choice from the landing page.
   * - combine: opens the InventoryWizard which handles both "I have contracts"
   *   and "I'm starting fresh" via its "Weiter ohne Verträge" finish button.
   * - compare: direct entry to the compare dashboard.
   */
  function handleLandingChoice(choice: LandingChoice) {
    if (choice.kind === 'compare') {
      portfolioState.setMode('compare')
      setAppView('compare')
      workspace.setActiveView('vergleich')
      return
    }
    if (choice.kind === 'combine') {
      portfolioState.setMode('combine')
      setShowInventoryWizard(true)
      return
    }
    const _exhaustive: never = choice
    void _exhaustive
    throw new Error(`Unhandled landing choice: ${String((_exhaustive as { kind: string }).kind)}`)
  }

  /**
   * "Startseite" link: return to the landing page. Clears in-memory navigation
   * state but does NOT delete localStorage (returning users keep their data).
   */
  function handleGoHome() {
    setAppView('landing')
  }

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
  const portfolioLifecycleViews = useMemo(() => {
    if (!isCombineMode) return []
    return buildPortfolioLifecycleViews({
      workspace: portfolioState.workspace,
      perInstance: combineSimulation.perInstance,
      scenarioId: combineBasisScenarioId,
      startAge: profile.age,
      retirementAge: profile.retirementAge,
      horizonAge: Math.max(
        LIFECYCLE_HORIZON_AGE,
        portfolioState.workspace.baseline.assumptions.retirementEndAge,
      ),
    })
  }, [
    isCombineMode,
    portfolioState.workspace,
    combineSimulation.perInstance,
    combineBasisScenarioId,
    profile.age,
    profile.retirementAge,
  ])

  // Show landing page when no saved state exists (or when returning to it).
  if (appView === 'landing') {
    return (
      <>
        <LandingPage onChoice={handleLandingChoice} />
        {showInventoryWizard && (
          <InventoryWizard
            grossSalaryYear={profile.grossSalaryYear}
            childBirthYears={profile.childBirthYears}
            age={profile.age}
            retirementAge={profile.retirementAge}
            publicHealthInsurance={profile.publicHealthInsurance}
            onComplete={(workspace) => {
              // #09: write the wizard's workspace into portfolioState BEFORE
              // setMode so the first combine-mode render sees the new data, not
              // stale defaults (replaceWorkspace is atomic; setMode would
              // otherwise overwrite with the old in-memory workspace).
              portfolioState.replaceWorkspace(workspace)
              // Mirror the personal details into the singleton profile +
              // statutoryPension so a later switch to compare-mode (or a
              // returning user clicking "Vergleich starten") sees the same
              // baseline rather than the engine defaults.
              setProfile((current) => ({
                ...current,
                age: workspace.baseline.profile.age,
                retirementAge: workspace.baseline.profile.retirementAge,
                grossSalaryYear: workspace.baseline.profile.grossSalaryYear,
                publicHealthInsurance: workspace.baseline.profile.publicHealthInsurance,
                childBirthYears: [...workspace.baseline.profile.childBirthYears],
              }))
              setAssumptions((current) => ({
                ...current,
                statutoryPension: {
                  ...current.statutoryPension,
                  pensionBaselineType: workspace.baseline.assumptions.statutoryPension.pensionBaselineType,
                  currentEntgeltpunkte: workspace.baseline.assumptions.statutoryPension.currentEntgeltpunkte,
                  manualMonthlyGross: workspace.baseline.assumptions.statutoryPension.manualMonthlyGross,
                },
              }))
              setShowInventoryWizard(false)
              portfolioState.setMode('combine')
              setAppView('combine')
            }}
            onDismiss={() => {
              setShowInventoryWizard(false)
            }}
          />
        )}
      </>
    )
  }

  const vergleichView = (
    <section
      className="workspace-view workspace-view--vergleich"
      data-qa-target="results.section"
      data-qa-section="true"
    >
      {toolbar}

      {portfolioState.mode === 'combine' && combineBasisResult && (
        <>
          {/* Issue #20 — top-of-page Rentenlücke dashboard. Combine-mode is
              where users have multiple Verträge aimed at a target net pension
              and need the gap as their headline figure. Compare-mode is
              product-vs-product head-to-head and deliberately omits this. */}
          <RentenluckeDashboard
            profile={combineProfile}
            overview={deriveRentenluckeOverviewFromCombine(
              portfolioState.workspace,
              combineBasisResult,
              combineProfile,
            )}
            onTargetChange={(next) =>
              portfolioState.patchBaseline({
                profile: {
                  ...combineProfile,
                  desiredNetMonthlyPension: next,
                },
              })
            }
            onAdjustContributions={() => setShowLueckeModal(true)}
          />
          {portfolioLifecycleViews.length > 0 && (
            <BreakEvenChart
              selectedResults={portfolioLifecycleViews.map((view) => view.result)}
              productColors={{
                ...PRODUCT_COLORS,
                [PORTFOLIO_LIFECYCLE_ID]: PORTFOLIO_COLOR,
              }}
              startAge={profile.age}
              retirementAge={profile.retirementAge}
              retirementEndAge={portfolioState.workspace.baseline.assumptions.retirementEndAge}
              bestProductId={PORTFOLIO_LIFECYCLE_ID}
              singleSelection
              title="Mein Plan: Kapital und Auszahlungen"
              description="Zeigt dein zusätzliches Vorsorgeportfolio ohne gesetzliche Rente."
            />
          )}
          {showLueckeModal && (
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
          <CombineIncomePanel
            combinedResult={combineBasisResult}
            perInstanceResults={combineSimulation.perInstance}
            scenarioId={combineBasisScenarioId}
            scenarioLabel={combineBasisLabel}
          />
          <AddVertragSection
            addInstance={portfolioState.addInstance}
            addPopulatedInstance={portfolioState.addPopulatedInstance}
          />
        </>
      )}
      {portfolioState.mode === 'combine' && !combineBasisResult && (
        <AddVertragSection
          addInstance={portfolioState.addInstance}
          addPopulatedInstance={portfolioState.addPopulatedInstance}
        />
      )}

      {/* Singleton-compare sections gated to compare-mode (Group G issue 11).
          In combine mode the Lücke-schließen modal + CombineIncomePanel above are
          the source of truth — the user is modelling actual contracts, not
          comparing product candidates. */}
      {!isCombineMode && (
        <>
          <ComparisonPicker
            visible={assumptions.visibleProducts}
            onChange={(next) =>
              setAssumptions((current) => ({ ...current, visibleProducts: next }))
            }
          />

          {hasComparisonSet ? (
            <>
              <DecisionSummary
                results={selectedResults}
                bestCapital={bestCapital}
                bestPension={bestPension}
              />

              <MonteCarloHighlights result={monteCarloResult} />

              <SummaryMetrics
                grvNetMonthlyPension={simulation.statutoryPension.netMonthlyPension}
                grvProjectedEp={simulation.statutoryPension.projectedEntgeltpunkte}
                grvGrossMonthlyPension={simulation.statutoryPension.grossMonthlyPension}
                bavMonthlyNetCost={simulation.bavFunding.monthlyNetCost}
                bavTotalMonthlyContribution={
                  simulation.bavFunding.monthlyGrossConversion +
                  simulation.bavFunding.monthlyEmployerContribution
                }
                showBav={assumptions.visibleProducts.includes('bav')}
              />

              <ProductEditCards
                selectedResults={selectedResults}
                assumptions={assumptions}
                onAssumptionsChange={setAssumptions}
                avdCappedAtContractMax={simulation.altersvorsorgedepotFunding.cappedAtContractMax}
                avdContractCapAnnual={de2026Rules.altersvorsorgedepot.contractContributionCapAnnual}
                onOpenInputsForProduct={(productId) => {
                  setRequestedInputsTab(productId)
                  workspace.setActiveView('angebot')
                }}
              />

              <ResultWaterfalls
                results={selectedResults}
                grvNetMonthlyPension={simulation.statutoryPension.netMonthlyPension}
              />

              <CapitalChart
                capitalChartData={capitalChartData}
                selectedScenario={selectedScenario}
                selectedResults={selectedResults}
                productColors={PRODUCT_COLORS}
              />

              <PensionChart
                pensionBars={pensionBars}
                retirementEndAge={assumptions.retirementEndAge}
              />

              <BreakEvenChart
                selectedResults={selectedResults}
                productColors={PRODUCT_COLORS}
                startAge={profile.age}
                retirementAge={profile.retirementAge}
                retirementEndAge={assumptions.retirementEndAge}
                bestProductId={bestCapital?.productId}
              />
            </>
          ) : (
            <EmptyComparison onOpenAngebot={() => workspace.setActiveView('angebot')} />
          )}
        </>
      )}
    </section>
  )

  const detailsView = (
    <section
      className="workspace-view workspace-view--details"
      data-qa-target="results.details.section"
      data-qa-section="true"
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p>{topbarCopy.kicker}</p>
          <h1>{topbarCopy.title}</h1>
        </div>
        <div className="topbar-actions">
          {appView === 'combine' && (
            <span className="topbar-mode-badge topbar-mode-badge--combine" aria-label="Mein Plan aktiv">
              Mein Plan
            </span>
          )}
          <button
            type="button"
            className="topbar-help-btn"
            onClick={handleGoHome}
            title="Zur Startseite"
          >
            <Home size={16} aria-hidden="true" />
            Startseite
          </button>
        </div>
      </header>

      <DisclaimerBanner />

      <ShellWorkspaceTabs
        activeView={workspace.activeView}
        combineMode={isCombineMode}
        onSelect={workspace.setActiveView}
      />

      <section className="workspace">
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
      />

      <LegalFooter navigate={navigate} />

    </main>
  )
}

export default App
