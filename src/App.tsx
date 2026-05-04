import { useMemo, useState } from 'react'
import { HelpCircle, Home } from 'lucide-react'
import type { ProductId } from './domain'
import { computeBavMinimumEntitlement } from './engine/bavWarnings'
import { de2026Rules } from './rules/de2026'
import { useCalculatorState } from './app/useCalculatorState'
import { useGuidedSetup } from './app/useGuidedSetup'
import { useScenarioLibrary } from './app/useScenarioLibrary'
import { useDerivedViews } from './app/useDerivedViews'
import { useSimulationResult } from './app/useSimulationResult'
import { useWorkspaceUiState } from './app/useWorkspaceUiState'
import { useWorkspace } from './app/useWorkspace'
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
import { PrintReport } from './features/results/PrintReport'
import { CashflowTable } from './features/cashflows/CashflowTable'
import { AssumptionsPanel } from './features/assumptions/AssumptionsPanel'
import { AssumptionReviewPanel } from './features/results/AssumptionReviewPanel'
import { GuidedSetup, GuidedSetupPostHint } from './features/guidance/GuidedSetup'
import { JourneyStepper } from './features/guidance/JourneyStepper'
import { derivePostHintFactors } from './features/guidance/postHintFactors'
import { WorkspaceTabs } from './features/workspace/WorkspaceTabs'
import { ComparisonPicker } from './features/workspace/ComparisonPicker'
import { EmptyComparison } from './features/workspace/EmptyComparison'
import { DisclaimerBanner } from './features/workspace/DisclaimerBanner'
import { ScenarioToolbar } from './features/workspace/ScenarioToolbar'
import { LandingPage } from './features/landing/LandingPage'
import type { LandingChoice } from './features/landing/LandingPage'
import { InventoryWizard } from './features/inventory/InventoryWizard'
import { CombineDashboardSidebar } from './features/inventory/CombineDashboardSidebar'
import { CombineIncomePanel } from './features/inventory/CombineIncomePanel'
import { useCombineSimulation } from './app/useCombineSimulation'
import { RecommenderCard } from './features/dashboard/RecommenderCard'
import { ContractDecisionMenu } from './features/dashboard/ContractDecisionMenu'
import { buildWhatIfFromCandidate } from './app/recommender'
import { DEFAULT_EQUAL_INPUT_AMOUNT_EUR } from './data/defaultScenario'
import { ImpressumPage } from './features/legal/ImpressumPage'
import { DatenschutzPage } from './features/legal/DatenschutzPage'
import { LegalFooter } from './features/legal/LegalFooter'
import './App.css'

const PRODUCT_COLORS = Object.fromEntries(PRODUCT_MANIFEST.map(m => [m.id, m.color]))

function App() {
  const { route, navigate } = useRoute()
  if (route === '/impressum') return <ImpressumPage navigate={navigate} />
  if (route === '/datenschutz') return <DatenschutzPage navigate={navigate} />
  return <Calculator navigate={navigate} />
}

interface CalculatorProps {
  navigate: (target: '/' | '/impressum' | '/datenschutz') => void
}

function Calculator({ navigate }: CalculatorProps) {
  // AppView controls the landing vs dashboard decision for route `/`.
  // Reads saved mode once on mount; thereafter in-memory state drives transitions.
  const [appView, setAppView] = useState<AppView>(() => appViewFromMode(detectSavedMode()))
  const [showInventoryWizard, setShowInventoryWizard] = useState(false)
  const [activeMenuInstanceId, setActiveMenuInstanceId] = useState<string | null>(null)

  const {
    profile,
    setProfile,
    assumptions,
    setAssumptions,
    resetToDefaults,
    setSyncedMonthlyContribution,
  } = useCalculatorState()
  const guidedSetup = useGuidedSetup()
  const portfolioState = usePortfolioState()
  const workspace = useWorkspace()
  const combineSimulation = useCombineSimulation(portfolioState.workspace)
  const scenarioLib = useScenarioLibrary(profile, assumptions, setProfile, setAssumptions)
  const ui = useWorkspaceUiState()
  const result = useSimulationResult(profile, assumptions, ui.selectedScenarioId)
  const views = useDerivedViews(profile, assumptions, result, {
    showRealValues: ui.showRealValues,
    cashflowProductId: ui.cashflowProductId,
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
   * - combine-new:      no existing contracts → open GuidedSetup, then combine dashboard.
   * - combine-existing: has existing contracts → stub for InventoryWizard (issue 05).
   * - compare:          go straight to today's compare dashboard.
   * - guided-setup:     reopen GuidedSetup from the "Geführter Einstieg" link.
   */
  function handleLandingChoice(choice: LandingChoice) {
    if (choice.kind === 'compare') {
      portfolioState.setMode('compare')
      setAppView('compare')
      workspace.setActiveView('vergleich')
      // Issue 16 — broker-style "Produkte vergleichen" CTA defaults the
      // compare-mode sub-mode to equal-input (€X/Monat across N candidates).
      // Existing entries that already saved a sub-mode keep theirs (only the
      // landing CTA forces this; users can flip back to equal-cash via the
      // input drawer toggle).
      setAssumptions((current) => ({
        ...current,
        compareSubMode: current.compareSubMode === undefined ? 'equal_input' : current.compareSubMode,
        equalInputAmountEUR: current.equalInputAmountEUR ?? DEFAULT_EQUAL_INPUT_AMOUNT_EUR,
      }))
      return
    }
    if (choice.kind === 'combine-new') {
      portfolioState.setMode('combine')
      setAppView('combine')
      // Open the existing GuidedSetup minimum-input flow for clean-slate users.
      guidedSetup.reopen()
      return
    }
    if (choice.kind === 'combine-existing') {
      portfolioState.setMode('combine')
      // Open the InventoryWizard overlay (Group G issue 05).
      setShowInventoryWizard(true)
      return
    }
    if (choice.kind === 'guided-setup') {
      // "Geführter Einstieg" link — open guided setup without committing to a mode yet.
      // Deliberately does NOT set mode: this is a re-entry path, not a first-action choice.
      guidedSetup.reopen()
      return
    }
    // Exhaustiveness guard — TypeScript will flag this assignment when a new
    // LandingChoice variant is added without a corresponding handler above.
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
            onComplete={() => {
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

  const toolbar = (
    <ScenarioToolbar
      assumptions={assumptions}
      onAssumptionsChange={setAssumptions}
      selectedScenarioId={result.effectiveScenarioId}
      onSelectScenario={ui.setSelectedScenarioId}
      showRealValues={ui.showRealValues}
      onShowRealValuesChange={ui.setShowRealValues}
    />
  )

  // In combine mode, pick the selected scenario (or 'basis' as fallback) from
  // the combined simulation bundle to drive the income summary panel and the
  // nächsten-Euro recommender. Using the selected scenario ensures the
  // RecommenderCard reacts when the user switches the scenario picker (#08).
  const combineSelectedScenarioId = (() => {
    const scenarios = portfolioState.workspace.baseline.assumptions.returnScenarios
    // Prefer the UI-selected scenario when it exists in the workspace scenario list.
    if (result.effectiveScenarioId && combineSimulation.combinedByScenarioId[result.effectiveScenarioId]) {
      return result.effectiveScenarioId
    }
    return (
      scenarios.find((s) => s.id === 'basis')?.id ??
      scenarios[0]?.id ??
      'basis'
    )
  })()
  const combineBasisScenarioId = combineSelectedScenarioId
  const combineBasisResult = combineSimulation.combinedByScenarioId[combineBasisScenarioId]
  const combineBasisLabel =
    portfolioState.workspace.baseline.assumptions.returnScenarios.find(
      (s) => s.id === combineBasisScenarioId,
    )?.label ?? 'Basis'

  const vergleichView = (
    <section className="workspace-view workspace-view--vergleich">
      {toolbar}

      {portfolioState.mode === 'combine' && combineBasisResult && (
        <>
          <RecommenderCard
            workspace={portfolioState.workspace}
            baselineCombined={combineBasisResult}
            baselinePerInstance={combineSimulation.perInstance}
            grvGrossMonthlyPension={combineSimulation.statutoryPension.grossMonthlyPension}
            selectedScenarioId={combineSelectedScenarioId}
            onSaveAsPlan={(candidate) => {
              const whatIf = buildWhatIfFromCandidate(portfolioState.baseline, candidate)
              portfolioState.addWhatIf(whatIf)
            }}
          />
          <CombineIncomePanel
            combinedResult={combineBasisResult}
            perInstanceResults={combineSimulation.perInstance}
            scenarioId={combineBasisScenarioId}
            scenarioLabel={combineBasisLabel}
          />
        </>
      )}

      {guidedSetup.journeyState === 'active' && (
        <GuidedSetupPostHint
          onDismiss={guidedSetup.dismissJourney}
          factors={derivePostHintFactors({
            results: selectedResults,
            bavFunding: simulation.bavFunding,
          })}
        />
      )}

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
    </section>
  )

  const detailsView = (
    <section className="workspace-view workspace-view--details">
      {toolbar}

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
        />
      </section>
    )

  const viewsByTab = {
    vergleich: vergleichView,
    details: detailsView,
    angebot: angebotView,
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p>TODO_BRAND_NAME Deutschland 2026</p>
          <h1>ETF, bAV und private Versicherung vergleichen</h1>
        </div>
        <div className="topbar-actions">
          {appView === 'compare' && (
            <span className="topbar-mode-badge topbar-mode-badge--compare" aria-label="Vergleichsmodus aktiv">
              Vergleichsmodus
            </span>
          )}
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
          <button
            type="button"
            className="topbar-help-btn"
            onClick={guidedSetup.reopen}
            title="Geführten Einstieg erneut öffnen"
          >
            <HelpCircle size={16} aria-hidden="true" />
            Geführter Einstieg
          </button>
        </div>
      </header>

      <DisclaimerBanner />

      <WorkspaceTabs
        activeView={workspace.activeView}
        onSelect={workspace.setActiveView}
      />

      {guidedSetup.journeyState === 'active' && (
        <JourneyStepper
          activeView={workspace.activeView}
          onNavigate={workspace.setActiveView}
          onDismiss={guidedSetup.dismissJourney}
        />
      )}

      <section className="workspace">
        {viewsByTab[workspace.activeView as keyof typeof viewsByTab] ?? vergleichView}
      </section>

      <PrintReport profile={profile} assumptions={assumptions} simulation={simulation} />

      <LegalFooter navigate={navigate} />

      {guidedSetup.showOverlay && (
        <GuidedSetup
          profile={profile}
          assumptions={assumptions}
          onApply={(nextProfile, nextAssumptions) => {
            setProfile(nextProfile)
            setAssumptions(nextAssumptions)
          }}
          onComplete={(options) => {
            guidedSetup.completeSetup(options)
            if (options?.suggestedView) {
              workspace.setActiveView(options.suggestedView)
            }
          }}
          onSkipPermanently={guidedSetup.skipPermanently}
          onDismiss={guidedSetup.dismissOverlay}
        />
      )}

    </main>
  )
}

export default App
