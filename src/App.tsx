import { Calculator, HelpCircle, RotateCcw, Settings } from 'lucide-react'
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
import { PRODUCT_MANIFEST } from './app/productPresentation'
import { ScenarioPresetPanel } from './features/inputs/ScenarioPresetPanel'
import { ScenarioLibraryPanel } from './features/inputs/ScenarioLibraryPanel'
import { GlossaryPanel } from './features/inputs/GlossaryPanel'
import { ProfileInputs } from './features/inputs/ProfileInputs'
import { GRVInputs } from './features/inputs/GRVInputs'
import { BavInputs } from './features/inputs/BavInputs'
import { ReturnScenarioEditor } from './features/inputs/ReturnScenarioEditor'
import { InsuranceInputs } from './features/inputs/InsuranceInputs'
import { BasisrenteInputs } from './features/inputs/BasisrenteInputs'
import { AltersvorsorgedepotInputs } from './features/inputs/AltersvorsorgedepotInputs'
import { RiesterInputs } from './features/inputs/RiesterInputs'
import { SummaryMetrics } from './features/results/SummaryMetrics'
import { DecisionSummary } from './features/results/DecisionSummary'
import { ResultWaterfalls } from './features/results/ResultWaterfall'
import { SensitivityPanel } from './features/results/SensitivityPanel'
import { CapitalChart } from './features/results/CapitalChart'
import { PensionChart } from './features/results/PensionChart'
import { FairnessPanel } from './features/results/FairnessPanel'
import { FeeDragChart } from './features/results/FeeDragChart'
import { CalculationWarnings } from './features/results/CalculationWarnings'
import { DetailComparisonTable } from './features/results/DetailComparisonTable'
import { PrintReport } from './features/results/PrintReport'
import { ProductVisibilityChips } from './features/results/ProductVisibilityChips'
import { CashflowTable } from './features/cashflows/CashflowTable'
import { AssumptionsPanel } from './features/assumptions/AssumptionsPanel'
import { GuidedSetup, GuidedSetupPostHint } from './features/guidance/GuidedSetup'
import './App.css'

const PRODUCT_COLORS = Object.fromEntries(PRODUCT_MANIFEST.map(m => [m.id, m.color]))

function App() {
  const { profile, setProfile, assumptions, setAssumptions, resetToDefaults } = useCalculatorState()
  const guidedSetup = useGuidedSetup()
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

  const { annualMin: bavMinAnnual, monthlyMin: bavMinMonthly } = computeBavMinimumEntitlement(de2026Rules)
  const bavEntitlementMax =
    (de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.socialSecurityFreePctOfPensionCap) / 12

  // Empty visibleProducts is treated as "all visible" (matches the view-model fallback).
  const visibleSet = new Set(
    assumptions.visibleProducts.length > 0
      ? assumptions.visibleProducts
      : ['etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester'],
  )
  const showEtf = visibleSet.has('etf')
  const showBav = visibleSet.has('bav')
  const showInsurance = visibleSet.has('versicherung')
  const showBasisrente = visibleSet.has('basisrente')
  const showAvd = visibleSet.has('altersvorsorgedepot')
  const showRiester = visibleSet.has('riester')

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
          <div className="topbar-badge">
            <Calculator size={18} aria-hidden="true" />
            <span>Persönliches v1-Modell</span>
          </div>
        </div>
      </header>

      <section className="dashboard">
        <aside className="input-panel" aria-label="Eingaben">
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

          <div className="field-grid">
            {showEtf && (
              <>
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
                  <span>ETF-Fondsart (InvStG §20)</span>
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
              </>
            )}
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
              label="Kapitalverzehr bis"
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
            „Kapitalverzehr bis" gilt nur für ETF und für bAV/pAV im Modus „Kapitalverzehr".
            Im Modus „Leibrente" oder „Zeitrente" steuert der Vertrag (Rentenfaktor bzw.
            Vertragslaufzeit) die monatliche Auszahlung.
          </p>

          <ReturnScenarioEditor
            returnScenarios={assumptions.returnScenarios}
            onScenariosChange={(scenarios) =>
              setAssumptions((current) => ({ ...current, returnScenarios: scenarios }))
            }
          />

          {showInsurance && (
            <InsuranceInputs
              assumptions={assumptions}
              onAssumptionsChange={setAssumptions}
              profile={profile}
              insuranceTaxMode={insuranceTaxMode}
              insuranceProductResult={insuranceResult}
              rules={de2026Rules}
            />
          )}

          {showBasisrente && (
            <>
              <div className="divider" />
              <BasisrenteInputs
                assumptions={assumptions}
                onAssumptionsChange={setAssumptions}
                basisrenteFunding={simulation.basisrenteFunding}
                basisrenteProductResult={selectedResults.find((r) => r.productId === 'basisrente')}
                rules={de2026Rules}
              />
            </>
          )}

          {showAvd && (
            <>
              <div className="divider" />
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

        <section className="main-panel">
          <div className="toolbar">
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
            <label className="toggle">
              <input
                type="checkbox"
                checked={showRealValues}
                onChange={(event) => setShowRealValues(event.target.checked)}
              />
              inflationsbereinigt
            </label>
          </div>

          {guidedSetup.showPostSetupHint && (
            <GuidedSetupPostHint onDismiss={guidedSetup.dismissPostSetupHint} />
          )}

          <ProductVisibilityChips
            visible={assumptions.visibleProducts}
            onChange={(next) =>
              setAssumptions((current) => ({ ...current, visibleProducts: next }))
            }
          />

          <DecisionSummary
            results={selectedResults}
            bestCapital={bestCapital}
            bestPension={bestPension}
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
            bestCapital={bestCapital}
            bestPension={bestPension}
          />

          <CapitalChart
            capitalChartData={capitalChartData}
            selectedScenario={selectedScenario}
            selectedResults={selectedResults}
            productColors={PRODUCT_COLORS}
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

          <ResultWaterfalls results={selectedResults} />

          <SensitivityPanel
            profile={profile}
            assumptions={assumptions}
            visibleProducts={assumptions.visibleProducts}
          />

          <FeeDragChart
            selectedResults={selectedResults}
            productColors={PRODUCT_COLORS}
          />

          <CalculationWarnings />

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
        </section>
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
          onComplete={guidedSetup.completeSetup}
          onSkipPermanently={guidedSetup.skipPermanently}
          onDismiss={guidedSetup.dismissOverlay}
        />
      )}
    </main>
  )
}

export default App
