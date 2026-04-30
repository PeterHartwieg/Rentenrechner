import { useEffect, useMemo, useRef, useState } from 'react'
import { HelpCircle, Info, RotateCcw, Settings } from 'lucide-react'
import type { ProductId } from './domain'
import { NumberField } from './ui/NumberField'
import { clampNumber } from './ui/formatting'
import { computeBavMinimumEntitlement } from './engine/bavWarnings'
import { de2026Rules } from './rules/de2026'
import { formatPercent } from './utils/format'
import { useCalculatorState } from './app/useCalculatorState'
import { useGuidedSetup } from './app/useGuidedSetup'
import { useScenarioLibrary } from './app/useScenarioLibrary'
import { useSimulationViewModel } from './app/useSimulationViewModel'
import { useWorkspace } from './app/useWorkspace'
import { PRODUCT_MANIFEST } from './app/productPresentation'
import { ScenarioPresetPanel } from './features/inputs/ScenarioPresetPanel'
import { ScenarioLibraryPanel } from './features/inputs/ScenarioLibraryPanel'
import { GlossaryPanel } from './features/inputs/GlossaryPanel'
import { ProfileInputs } from './features/inputs/ProfileInputs'
import { GRVInputs } from './features/inputs/GRVInputs'
import { BavInputs } from './features/inputs/BavInputs'
import { InsuranceInputs } from './features/inputs/InsuranceInputs'
import { BasisrenteInputs } from './features/inputs/BasisrenteInputs'
import { AltersvorsorgedepotInputs } from './features/inputs/AltersvorsorgedepotInputs'
import { RiesterInputs } from './features/inputs/RiesterInputs'
import { SummaryMetrics } from './features/results/SummaryMetrics'
import { DecisionSummary } from './features/results/DecisionSummary'
import { ProductEditCards } from './features/results/ProductEditCards'
import { ResultWaterfalls } from './features/results/ResultWaterfall'
import { SensitivityPanel } from './features/results/SensitivityPanel'
import { runSensitivity } from './features/results/sensitivity'
import { CapitalChart } from './features/results/CapitalChart'
import { PensionChart } from './features/results/PensionChart'
import { FairnessPanel } from './features/results/FairnessPanel'
import { FeeDragChart } from './features/results/FeeDragChart'
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
import { ProductFocusHeader } from './features/workspace/ProductFocusHeader'
import { EmptyComparison } from './features/workspace/EmptyComparison'
import './App.css'

const PRODUCT_COLORS = Object.fromEntries(PRODUCT_MANIFEST.map(m => [m.id, m.color]))

function App() {
  const { profile, setProfile, assumptions, setAssumptions, resetToDefaults } = useCalculatorState()
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

  const [disclaimerVisible, setDisclaimerVisible] = useState(
    () => localStorage.getItem('disclaimer-dismissed') !== '1',
  )
  const [showDisclaimerPopup, setShowDisclaimerPopup] = useState(false)
  const disclaimerRef = useRef<HTMLDivElement>(null)

  function dismissDisclaimer() {
    localStorage.setItem('disclaimer-dismissed', '1')
    setDisclaimerVisible(false)
    setShowDisclaimerPopup(false)
  }

  useEffect(() => {
    if (!showDisclaimerPopup) return
    function handleClick(event: MouseEvent) {
      if (disclaimerRef.current && !disclaimerRef.current.contains(event.target as Node)) {
        setShowDisclaimerPopup(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showDisclaimerPopup])

  const { annualMin: bavMinAnnual, monthlyMin: bavMinMonthly } = computeBavMinimumEntitlement(de2026Rules)
  const bavEntitlementMax =
    (de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.socialSecurityFreePctOfPensionCap) / 12

  // UX10: visibleProducts is the explicit comparison set. Empty means no private
  // product is selected — Vergleich/Warum/Details views show an empty-state in
  // that case instead of silently rendering all six products.
  const visibleSet = new Set(assumptions.visibleProducts)
  const showEtf = visibleSet.has('etf')
  const showBav = visibleSet.has('bav')
  const showInsurance = visibleSet.has('versicherung')
  const showBasisrente = visibleSet.has('basisrente')
  const showAvd = visibleSet.has('altersvorsorgedepot')
  const showRiester = visibleSet.has('riester')
  const hasComparisonSet = assumptions.visibleProducts.length > 0

  // Sensitivity simulation lifted from SensitivityPanel so DecisionSummary can render
  // a personalised caveat from the same data. Memoized on inputs that affect the result.
  const sensitivityResult = useMemo(() => {
    if (!hasComparisonSet) return undefined
    return runSensitivity({
      profile,
      assumptions,
      rules: de2026Rules,
      visibleProducts: assumptions.visibleProducts,
    })
  }, [profile, assumptions, hasComparisonSet])

  const customScenario = assumptions.returnScenarios.find((s) => s.id === 'custom')
  const updateCustomRate = (annualReturn: number) => {
    setAssumptions((current) => ({
      ...current,
      returnScenarios: current.returnScenarios.map((s) =>
        s.id === 'custom' ? { ...s, annualReturn } : s,
      ),
    }))
  }
  const addCustomScenario = () => {
    setAssumptions((current) => ({
      ...current,
      returnScenarios: [
        ...current.returnScenarios,
        { id: 'custom', label: 'Eigenes', annualReturn: 0.06 },
      ],
    }))
    setSelectedScenarioId('custom')
  }
  const removeCustomScenario = () => {
    setAssumptions((current) => ({
      ...current,
      returnScenarios: current.returnScenarios.filter((s) => s.id !== 'custom'),
    }))
  }

  const scenarioToolbar = (
    <div className="toolbar">
      <div className="scenario-controls">
        <div className="segmented" aria-label="Rendite-Szenario auswählen">
          {assumptions.returnScenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className={scenario.id === selectedScenarioId ? 'active' : ''}
              onClick={() => setSelectedScenarioId(scenario.id)}
            >
              {scenario.label} {formatPercent(scenario.annualReturn)}
            </button>
          ))}
        </div>
        {customScenario ? (
          <div className="scenario-custom-edit">
            <label>
              <span>Eigene Rendite</span>
              <input
                type="number"
                min={-5}
                max={12}
                step={0.25}
                value={Number((customScenario.annualReturn * 100).toFixed(2))}
                onChange={(event) =>
                  updateCustomRate(Number(event.target.value) / 100)
                }
              />
              <em>%</em>
            </label>
            <button
              type="button"
              className="scenario-remove-btn"
              onClick={removeCustomScenario}
            >
              Entfernen
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="scenario-add-btn"
            onClick={addCustomScenario}
          >
            + Eigenes Szenario
          </button>
        )}
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={showRealValues}
          onChange={(event) => setShowRealValues(event.target.checked)}
        />
        inflationsbereinigt
      </label>
    </div>
  )

  const inputsPanel = (
    <aside className="input-panel input-panel--full" aria-label="Eingaben">
      <div className="panel-heading">
        <Settings size={18} aria-hidden="true" />
        <h2>Eingaben</h2>
        <button
          type="button"
          className="reset-btn"
          title="Auf Standardwerte zurücksetzen"
          onClick={resetToDefaults}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Reset
        </button>
      </div>

      <ScenarioPresetPanel onSelectPreset={setAssumptions} />

      <GlossaryPanel />

      <ScenarioLibraryPanel
        library={scenarioLib.library}
        onSave={scenarioLib.save}
        onLoad={scenarioLib.load}
        onDuplicate={scenarioLib.duplicate}
        onDelete={scenarioLib.remove}
        onRename={scenarioLib.rename}
      />

      <ComparisonPicker
        visible={assumptions.visibleProducts}
        onChange={(next) =>
          setAssumptions((current) => ({ ...current, visibleProducts: next }))
        }
        heading="Welche Produkte vergleichst du?"
        hint="Diese Auswahl steuert sowohl die Eingabefelder hier als auch die Charts und Tabellen im Vergleich."
      />

      <ProfileInputs
        profile={profile}
        onProfileChange={setProfile}
        pkv257SubsidyMonthly={simulation.bavFunding.salaryWithoutBav.pkv257SubsidyMonthly}
        pkvNetMonthlyCost={simulation.bavFunding.salaryWithoutBav.pkvNetMonthlyCost}
      />

      <div className="divider" />

      <GRVInputs
        assumptions={assumptions}
        onAssumptionsChange={setAssumptions}
        statutoryPensionResult={simulation.statutoryPension}
      />

      {showBav && (
        <>
          <div className="divider" />
          <ProductFocusHeader productId="bav" />
          <BavInputs
            assumptions={assumptions}
            onAssumptionsChange={setAssumptions}
            profile={profile}
            bavFunding={simulation.bavFunding}
            selectedResults={selectedResults}
            kvdrMember={kvdrMember}
            bavLumpSumTaxMode={bavLumpSumTaxMode}
            tarifgebunden={tarifgebunden}
            onTarifgebundenChange={setTarifgebunden}
            bavMinAnnual={bavMinAnnual}
            bavMinMonthly={bavMinMonthly}
            bavEntitlementMax={bavEntitlementMax}
            rules={de2026Rules}
          />
        </>
      )}

      {showEtf && (
        <>
          <div className="divider" />
          <ProductFocusHeader productId="etf" />
          <div className="field-grid">
            <NumberField
              label="ETF TER"
              value={assumptions.etf.annualAssetFee * 100}
              min={0}
              max={3}
              step={0.05}
              suffix="% p.a."
              onChange={(value) =>
                setAssumptions((current) => ({
                  ...current,
                  etf: { ...current.etf, annualAssetFee: Number(value) / 100 },
                }))
              }
            />
            <label className="field">
              <span>Fondstyp (für Teilfreistellung)</span>
              <select
                value={assumptions.etf.equityPartialExemption}
                onChange={(event) =>
                  setAssumptions((current) => ({
                    ...current,
                    etf: { ...current.etf, equityPartialExemption: Number(event.target.value) },
                  }))
                }
              >
                <option value={0.3}>Aktienfonds (30% steuerfrei)</option>
                <option value={0.15}>Mischfonds (15% steuerfrei)</option>
                <option value={0.6}>Inl. Immobilienfonds (60% steuerfrei)</option>
                <option value={0.8}>Ausl. Immobilienfonds (80% steuerfrei)</option>
                <option value={0}>Anleihe-ETF / Sonstige (0% steuerfrei)</option>
              </select>
            </label>
          </div>
        </>
      )}

      <div className="divider" />
      <h3 className="input-section-title">Globale Annahmen</h3>
      <div className="field-grid">
        <NumberField
          label="Inflation"
          value={assumptions.inflationRate * 100}
          min={0}
          max={8}
          step={0.1}
          suffix="% p.a."
          onChange={(value) =>
            setAssumptions((current) => ({
              ...current,
              inflationRate: Number(value) / 100,
            }))
          }
        />
        <NumberField
          label="Kapital aufgebraucht bis (Alter)"
          value={assumptions.retirementEndAge}
          min={profile.retirementAge + 1}
          max={110}
          step={1}
          suffix="Jahre"
          onCommit={(value) =>
            setAssumptions((current) => ({
              ...current,
              retirementEndAge: clampNumber(Number(value), profile.retirementAge + 1, 110),
            }))
          }
        />
      </div>
      <p className="field-hint">
        „Kapital aufgebraucht bis" gilt nur für ETF und für bAV/pAV im Modus „Selbstgesteuerte Entnahme".
        Im Modus „Lebenslange Rente" oder „Zeitrente" steuert der Vertrag (Rentenfaktor bzw.
        Vertragslaufzeit) die monatliche Auszahlung.
      </p>

      {showInsurance && (
        <>
          <div className="divider" />
          <ProductFocusHeader productId="versicherung" />
          <InsuranceInputs
            assumptions={assumptions}
            onAssumptionsChange={setAssumptions}
            profile={profile}
            insuranceTaxMode={insuranceTaxMode}
            insuranceProductResult={insuranceResult}
            rules={de2026Rules}
          />
        </>
      )}

      {showBasisrente && (
        <>
          <div className="divider" />
          <ProductFocusHeader productId="basisrente" />
          <BasisrenteInputs
            assumptions={assumptions}
            onAssumptionsChange={setAssumptions}
            basisrenteFunding={simulation.basisrenteFunding}
            basisrenteProductResult={selectedResults.find((r) => r.productId === 'basisrente')}
            rules={de2026Rules}
            retirementAge={profile.retirementAge}
          />
        </>
      )}

      {showAvd && (
        <>
          <div className="divider" />
          <ProductFocusHeader productId="altersvorsorgedepot" />
          <AltersvorsorgedepotInputs
            assumptions={assumptions}
            onAssumptionsChange={setAssumptions}
            profile={profile}
            avdFunding={simulation.altersvorsorgedepotFunding}
            avdProductResult={selectedResults.find((r) => r.productId === 'altersvorsorgedepot')}
            rules={de2026Rules}
          />
        </>
      )}

      {showRiester && (
        <>
          <div className="divider" />
          <ProductFocusHeader productId="riester" />
          <RiesterInputs
            assumptions={assumptions}
            onAssumptionsChange={setAssumptions}
            profile={profile}
            riesterFunding={simulation.riesterFunding}
            riesterProductResult={selectedResults.find((r) => r.productId === 'riester')}
          />
        </>
      )}
    </aside>
  )

  const vergleichView = (
    <section className="workspace-view workspace-view--vergleich">
      {scenarioToolbar}

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
            sensitivity={sensitivityResult}
            grvNetMonthlyPension={simulation.statutoryPension.netMonthlyPension}
            desiredNetMonthlyPension={profile.desiredNetMonthlyPension}
          />

          <SummaryMetrics
            grvNetMonthlyPension={simulation.statutoryPension.netMonthlyPension}
            grvProjectedEp={simulation.statutoryPension.projectedEntgeltpunkte}
            grvGrossMonthlyPension={simulation.statutoryPension.grossMonthlyPension}
            bavMonthlyNetCost={simulation.bavFunding.monthlyNetCost}
            bavTotalMonthlyContribution={
              simulation.bavFunding.monthlyGrossConversion +
              simulation.bavFunding.monthlyEmployerContribution
            }
            showBav={showBav}
          />

          <ProductEditCards
            selectedResults={selectedResults}
            assumptions={assumptions}
            onAssumptionsChange={setAssumptions}
          />

          <CapitalChart
            capitalChartData={capitalChartData}
            selectedScenario={selectedScenario}
            selectedResults={selectedResults}
            productColors={PRODUCT_COLORS}
          />
        </>
      ) : (
        <EmptyComparison onOpenAngebot={() => workspace.setActiveView('angebot')} />
      )}
    </section>
  )

  const warumView = (
    <section className="workspace-view workspace-view--warum">
      {scenarioToolbar}

      {hasComparisonSet ? (
        <>
          <ResultWaterfalls results={selectedResults} />

          <SensitivityPanel
            profile={profile}
            assumptions={assumptions}
            visibleProducts={assumptions.visibleProducts}
            precomputed={sensitivityResult}
          />

          <section className="split-panels">
            <PensionChart
              pensionBars={pensionBars}
              retirementEndAge={assumptions.retirementEndAge}
            />
            <FairnessPanel
              profile={profile}
              assumptions={assumptions}
              bavFunding={simulation.bavFunding}
              rules={de2026Rules}
            />
          </section>
        </>
      ) : (
        <EmptyComparison onOpenAngebot={() => workspace.setActiveView('angebot')} />
      )}
    </section>
  )

  const detailsView = (
    <section className="workspace-view workspace-view--details">
      {scenarioToolbar}

      {hasComparisonSet ? (
        <>
          <FeeDragChart
            selectedResults={selectedResults}
            productColors={PRODUCT_COLORS}
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
      {inputsPanel}
    </section>
  )

  let viewBody
  switch (workspace.activeView) {
    case 'angebot':
      viewBody = angebotView
      break
    case 'warum':
      viewBody = warumView
      break
    case 'details':
      viewBody = detailsView
      break
    case 'vergleich':
    default:
      viewBody = vergleichView
      break
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

      {disclaimerVisible && (
        <div className="disclaimer-wrap" ref={disclaimerRef}>
          <button
            type="button"
            className="disclaimer-btn"
            aria-label="Weitere Details anzeigen"
            onClick={() => setShowDisclaimerPopup((v) => !v)}
          >
            <Info size={14} aria-hidden="true" />
            <strong>Modellrechnung — keine Anlage-, Steuer- oder Rechtsberatung.</strong>
          </button>
          {showDisclaimerPopup && (
            <div className="disclaimer-popup" role="note">
              <p>
                Alle Berechnungen verwenden gesetzliche Werte mit Stand 2026 (Steuersätze,
                Sozialversicherungsbeiträge, Rentenwert; Quellen: BMF, Deutsche Rentenversicherung, GKV-Spitzenverband).
                Die Ergebnisse sind Schätzungen unter Ihren Annahmen — Renditen, Inflation,
                Lebenserwartung und künftige Gesetzesänderungen sind unbekannt.
              </p>
            </div>
          )}
          <button
            type="button"
            className="disclaimer-dismiss"
            aria-label="Hinweis ausblenden"
            onClick={dismissDisclaimer}
          >
            ✕
          </button>
        </div>
      )}

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
        {viewBody}
      </section>

      <PrintReport profile={profile} assumptions={assumptions} simulation={simulation} />

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
