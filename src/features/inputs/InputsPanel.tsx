import type React from 'react'
import { RotateCcw, Settings } from 'lucide-react'
import type {
  BavLumpSumTaxMode,
  InsuranceProductResult,
  InsuranceTaxMode,
  PersonalProfile,
  ProductResult,
  ScenarioAssumptions,
  SimulationResult,
} from '../../domain'
import type { SavedScenario } from '../../data/scenarioLibrary'
import { NumberField } from '../../ui/NumberField'
import { clampNumber } from '../../ui/formatting'
import { computeBavMinimumEntitlement } from '../../engine/bavWarnings'
import { de2026Rules } from '../../rules/de2026'
import { ScenarioPresetPanel } from './ScenarioPresetPanel'
import { ScenarioLibraryPanel } from './ScenarioLibraryPanel'
import { GlossaryPanel } from './GlossaryPanel'
import { ProfileInputs } from './ProfileInputs'
import { GRVInputs } from './GRVInputs'
import { BavInputs } from './BavInputs'
import { InsuranceInputs } from './InsuranceInputs'
import { BasisrenteInputs } from './BasisrenteInputs'
import { AltersvorsorgedepotInputs } from './AltersvorsorgedepotInputs'
import { RiesterInputs } from './RiesterInputs'
import { ComparisonPicker } from '../workspace/ComparisonPicker'
import { ProductFocusHeader } from '../workspace/ProductFocusHeader'

interface ScenarioLib {
  library: SavedScenario[]
  save: (name: string) => void
  load: (id: string) => void
  duplicate: (id: string) => void
  remove: (id: string) => void
  rename: (id: string, name: string) => void
}

interface InputsPanelProps {
  profile: PersonalProfile
  onProfileChange: React.Dispatch<React.SetStateAction<PersonalProfile>>
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  resetToDefaults: () => void
  simulation: SimulationResult
  selectedResults: ProductResult[]
  scenarioLib: ScenarioLib
  kvdrMember: boolean
  bavLumpSumTaxMode: BavLumpSumTaxMode
  insuranceTaxMode: InsuranceTaxMode
  insuranceResult: InsuranceProductResult | undefined
  tarifgebunden: boolean
  onTarifgebundenChange: (v: boolean) => void
}

export function InputsPanel({
  profile,
  onProfileChange,
  assumptions,
  onAssumptionsChange,
  resetToDefaults,
  simulation,
  selectedResults,
  scenarioLib,
  kvdrMember,
  bavLumpSumTaxMode,
  insuranceTaxMode,
  insuranceResult,
  tarifgebunden,
  onTarifgebundenChange,
}: InputsPanelProps) {
  const { annualMin: bavMinAnnual, monthlyMin: bavMinMonthly } =
    computeBavMinimumEntitlement(de2026Rules)
  const bavEntitlementMax =
    (de2026Rules.socialSecurity.pensionCapYear *
      de2026Rules.bav.socialSecurityFreePctOfPensionCap) /
    12

  const visibleSet = new Set(assumptions.visibleProducts)
  const showBav = visibleSet.has('bav')
  const showEtf = visibleSet.has('etf')
  const showInsurance = visibleSet.has('versicherung')
  const showBasisrente = visibleSet.has('basisrente')
  const showAvd = visibleSet.has('altersvorsorgedepot')
  const showRiester = visibleSet.has('riester')

  return (
    <section className="input-panel input-panel--full" aria-label="Eingaben">
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

      <ScenarioPresetPanel onSelectPreset={onAssumptionsChange} />

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
          onAssumptionsChange((current) => ({ ...current, visibleProducts: next }))
        }
        heading="Welche Produkte vergleichst du?"
      />

      <ProfileInputs
        profile={profile}
        onProfileChange={onProfileChange}
        pkv257SubsidyMonthly={simulation.bavFunding.salaryWithoutBav.pkv257SubsidyMonthly}
        pkvNetMonthlyCost={simulation.bavFunding.salaryWithoutBav.pkvNetMonthlyCost}
      />

      <div className="divider" />

      <GRVInputs
        assumptions={assumptions}
        onAssumptionsChange={onAssumptionsChange}
        statutoryPensionResult={simulation.statutoryPension}
      />

      {showBav && (
        <>
          <div className="divider" />
          <ProductFocusHeader productId="bav" />
          <BavInputs
            assumptions={assumptions}
            onAssumptionsChange={onAssumptionsChange}
            profile={profile}
            bavFunding={simulation.bavFunding}
            selectedResults={selectedResults}
            kvdrMember={kvdrMember}
            bavLumpSumTaxMode={bavLumpSumTaxMode}
            tarifgebunden={tarifgebunden}
            onTarifgebundenChange={onTarifgebundenChange}
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
                onAssumptionsChange((current) => ({
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
                  onAssumptionsChange((current) => ({
                    ...current,
                    etf: {
                      ...current.etf,
                      equityPartialExemption: Number(event.target.value),
                    },
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
            onAssumptionsChange((current) => ({
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
            onAssumptionsChange((current) => ({
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
            onAssumptionsChange={onAssumptionsChange}
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
            onAssumptionsChange={onAssumptionsChange}
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
            onAssumptionsChange={onAssumptionsChange}
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
            onAssumptionsChange={onAssumptionsChange}
            profile={profile}
            riesterFunding={simulation.riesterFunding}
            riesterProductResult={selectedResults.find((r) => r.productId === 'riester')}
          />
        </>
      )}
    </section>
  )
}
