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
import { CombineDetailView } from './features/results/CombineDetailView'
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
  const isCombineMode = portfolioState.mode === 'combine'
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
    const scenarioLabels: Record<string, string> = {}
    for (const s of portfolioState.workspace.baseline.assumptions.returnScenarios) {
      scenarioLabels[s.id] = s.label
    }
    return {
      perInstance: combineSimulation.perInstance,
      combinedByScenarioId: combineSimulation.combinedByScenarioId,
      scenarioLabels,
    }
  }, [
    isCombineMode,
    combineSimulation.perInstance,
    combineSimulation.combinedByScenarioId,
    portfolioState.workspace.baseline.assumptions.returnScenarios,
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
            onComplete={(workspace) => {
              // #09: write the wizard's workspace into portfolioState BEFORE
              // setMode so the first combine-mode render sees the new data, not
              // stale defaults (replaceWorkspace is atomic; setMode would
              // otherwise overwrite with the old in-memory workspace).
              portfolioState.replaceWorkspace(workspace)
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
      showRealValues={ui.showRealValues}
      onShowRealValuesChange={ui.setShowRealValues}
    />
  ) : (
    <ScenarioToolbar
      assumptions={assumptions}
      onAssumptionsChange={(updater) => {
        setAssumptions((current) => ({ ...current, ...updater(current) }))
      }}
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
          factors={derivePostHintFactors(
            isCombineMode
              ? {
                  // In combine mode, source factors from the portfolio simulation so the
                  // hint reflects the instances the user actually built, not the singleton
                  // compare state (Group G issue #35).
                  results: Object.values(combineSimulation.perInstance)
                    .map((arr) => arr.find((r) => r.scenarioId === combineBasisScenarioId))
                    .filter((r): r is NonNullable<typeof r> => r !== undefined),
                  bavFunding: {
                    ...simulation.bavFunding,
                    // Aggregate employer contributions across all bAV instances.
                    monthlyEmployerContribution: Object.values(
                      combineSimulation.portfolioFunding.bavByInstanceId,
                    ).reduce((sum, f) => sum + f.monthlyEmployerContribution, 0),
                  },
                }
              : {
                  results: selectedResults,
                  bavFunding: simulation.bavFunding,
                },
          )}
        />
      )}

      {/* Singleton-compare sections gated to compare-mode (Group G issue 11).
          In combine mode the RecommenderCard + CombineIncomePanel above are
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
    <section className="workspace-view workspace-view--details">
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
      />

      <LegalFooter navigate={navigate} />

      {guidedSetup.showOverlay && (
        <GuidedSetup
          profile={profile}
          assumptions={assumptions}
          onApply={(nextProfile, nextAssumptions) => {
            setProfile(nextProfile)
            setAssumptions(nextAssumptions)
            // #10: in combine-new path the guided setup must also seed the
            // workspace baseline so simulatePortfolio picks up the user's
            // inputs. Only the global (non-per-product-singleton) fields are
            // patched — per-product data lives in the workspace instance arrays
            // and must not be overwritten with singleton assumptions.
            if (appView === 'combine') {
              portfolioState.patchBaseline({
                profile: nextProfile,
                assumptions: {
                  ...portfolioState.workspace.baseline.assumptions,
                  statutoryPension: nextAssumptions.statutoryPension,
                  inflationRate: nextAssumptions.inflationRate,
                  retirementEndAge: nextAssumptions.retirementEndAge,
                  returnScenarios: nextAssumptions.returnScenarios,
                  monteCarlo: nextAssumptions.monteCarlo,
                  visibleProducts: nextAssumptions.visibleProducts,
                },
              })
            }
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
