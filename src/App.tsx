import { useMemo } from 'react'
import { HelpCircle } from 'lucide-react'
import type { ProductId } from './domain'
import { computeBavMinimumEntitlement } from './engine/bavWarnings'
import { de2026Rules } from './rules/de2026'
import { useCalculatorState } from './app/useCalculatorState'
import { useGuidedSetup } from './app/useGuidedSetup'
import { useScenarioLibrary } from './app/useScenarioLibrary'
import { useSimulationViewModel } from './app/useSimulationViewModel'
import { useWorkspace } from './app/useWorkspace'
import { useRoute } from './app/useRoute'
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
  const {
    profile,
    setProfile,
    assumptions,
    setAssumptions,
    resetToDefaults,
    setSyncedMonthlyContribution,
  } = useCalculatorState()
  const guidedSetup = useGuidedSetup()
  const workspace = useWorkspace()
  const scenarioLib = useScenarioLibrary(profile, assumptions, setProfile, setAssumptions)
  const vm = useSimulationViewModel(profile, assumptions)
  const {
    selectedScenarioId, setSelectedScenarioId,
    showRealValues, setShowRealValues,
    cashflowProductId, setCashflowProductId,
    tarifgebunden, setTarifgebunden,
    showAssumptions, setShowAssumptions,
    linkCopied,
    simulation,
    selectedScenario,
    monteCarloResult,
    selectedResults,
    capitalChartData,
    pensionBars,
    bestCapital,
    bestPension,
    cashflowResult,
    insuranceResult,
    cashflowAnnualTaxSvSavings,
    visibleProducts,
    insuranceTaxMode,
    kvdrMember,
    bavLumpSumTaxMode,
    rowAfterTaxBalance,
    handleCopyLink,
    handleExportCsv,
  } = vm

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

  const toolbar = (
    <ScenarioToolbar
      assumptions={assumptions}
      onAssumptionsChange={setAssumptions}
      selectedScenarioId={selectedScenarioId}
      onSelectScenario={setSelectedScenarioId}
      showRealValues={showRealValues}
      onShowRealValuesChange={setShowRealValues}
    />
  )

  const vergleichView = (
    <section className="workspace-view workspace-view--vergleich">
      {toolbar}

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
            cashflowProductId={cashflowProductId}
            cashflowAnnualTaxSvSavings={cashflowAnnualTaxSvSavings}
            onChangeCashflowProduct={(id) => setCashflowProductId(id as ProductId)}
            rowAfterTaxBalance={rowAfterTaxBalance}
          />

          <AssumptionsPanel
            show={showAssumptions}
            onToggle={() => setShowAssumptions((v) => !v)}
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

  const angebotView = (
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
        kvdrMember={kvdrMember}
        bavLumpSumTaxMode={bavLumpSumTaxMode}
        insuranceTaxMode={insuranceTaxMode}
        insuranceResult={insuranceResult}
        tarifgebunden={tarifgebunden}
        onTarifgebundenChange={setTarifgebunden}
      />
    </section>
  )

  const views = {
    vergleich: vergleichView,
    details: detailsView,
    angebot: angebotView,
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p>Rentenrechner Deutschland 2026</p>
          <h1>ETF, bAV und private Versicherung vergleichen</h1>
        </div>
        <div className="topbar-actions">
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
        {views[workspace.activeView] ?? vergleichView}
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
