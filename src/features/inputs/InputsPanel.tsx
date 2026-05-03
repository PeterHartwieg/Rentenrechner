import { useState } from 'react'
import type React from 'react'
import { RotateCcw, Settings } from 'lucide-react'
import type {
  BavLumpSumTaxMode,
  InsuranceProductResult,
  InsuranceTaxMode,
  PersonalProfile,
  ProductId,
  ProductResult,
  ScenarioAssumptions,
  SimulationResult,
} from '../../domain'
import type { SavedScenario } from '../../data/scenarioLibrary'
import { NumberField } from '../../ui/NumberField'
import { clampNumber } from '../../ui/formatting'
import { formatCurrency } from '../../utils/format'
import { computeBavMinimumEntitlement } from '../../engine/bavWarnings'
import { de2026Rules } from '../../rules/de2026'
import { ScenariosPanel } from './ScenariosPanel'
import { GlossaryPanel } from './GlossaryPanel'
import { ProfileInputs } from './ProfileInputs'
import { GRVInputs } from './GRVInputs'
import { ComparisonPicker } from '../workspace/ComparisonPicker'
import { ProductFocusHeader } from '../workspace/ProductFocusHeader'
import { ProductTabs } from './ProductTabs'
import {
  PRODUCT_UI_REGISTRY,
  type ProductInputsContext,
} from './productUiRegistry'

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
  onSyncMonthlyContribution: (targetNet: number) => void
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
  onSyncMonthlyContribution,
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

  const visible = assumptions.visibleProducts

  // Active product tab — falls back to first visible if the requested tab
  // is no longer in `visible` (e.g. user toggled it off in the picker).
  const [requestedTab, setRequestedTab] = useState<ProductId | null>(visible[0] ?? null)
  const activeTab: ProductId | null =
    requestedTab && visible.includes(requestedTab) ? requestedTab : (visible[0] ?? null)

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

      {/* ── Comparison picker — primary navigation, always visible ── */}
      <ComparisonPicker
        visible={assumptions.visibleProducts}
        onChange={(next) =>
          onAssumptionsChange((current) => ({ ...current, visibleProducts: next }))
        }
        heading="Welche Produkte vergleichst du?"
      />

      <div className="divider" />

      {/* ── Global model assumptions (apply to all products) ── */}
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

      {/* ── Per-product details — card with heading, tabs, active product inputs ── */}
      <section className="product-details-card" aria-label="Produktdetails">
        <div className="product-details-card-header">
          <h3>Produktdetails</h3>
        </div>

        {visible.length === 0 ? (
          <p className="field-hint">
            Wähle oben mindestens ein Produkt aus, um seine Einstellungen zu konfigurieren.
          </p>
        ) : (
          <>
            <ProductTabs visible={visible} active={activeTab} onChange={setRequestedTab} />

            {activeTab && (() => {
              const entry = PRODUCT_UI_REGISTRY[activeTab]
              if (!entry) return null
              const ctx: ProductInputsContext = {
                assumptions,
                onAssumptionsChange,
                onSyncMonthlyContribution,
                profile,
                simulation,
                selectedResults,
                rules: de2026Rules,
                kvdrMember,
                bavLumpSumTaxMode,
                insuranceTaxMode,
                insuranceResult,
                tarifgebunden,
                onTarifgebundenChange,
                bavMinAnnual,
                bavMinMonthly,
                bavEntitlementMax,
              }
              return (
                <>
                  <ProductFocusHeader productId={activeTab} />
                  {entry.renderInputs(ctx)}
                </>
              )
            })()}
          </>
        )}
      </section>

      <div className="divider" />

      {/* ── All collapsibles grouped at bottom: setup (Profile, GRV) + tools ── */}
      <details className="disclosure-section">
        <summary>
          <span className="disclosure-toggle">Profil</span>
          <span className="disclosure-recap">
            {profile.age} J · {formatCurrency(profile.grossSalaryYear, 0)}/J ·{' '}
            {profile.publicHealthInsurance ? 'GKV' : 'PKV'}
            {profile.childBirthYears.length > 0 &&
              ` · ${profile.childBirthYears.length} ${profile.childBirthYears.length === 1 ? 'Kind' : 'Kinder'}`}
          </span>
        </summary>
        <div className="disclosure-content">
          <ProfileInputs
            profile={profile}
            onProfileChange={onProfileChange}
            pkv257SubsidyMonthly={simulation.bavFunding.salaryWithoutBav.pkv257SubsidyMonthly}
            pkvNetMonthlyCost={simulation.bavFunding.salaryWithoutBav.pkvNetMonthlyCost}
          />
        </div>
      </details>

      <details className="disclosure-section">
        <summary>
          <span className="disclosure-toggle">Gesetzliche Rente (GRV)</span>
          <span className="disclosure-recap">
            Prognose: {formatCurrency(simulation.statutoryPension.netMonthlyPension, 0)}/Monat netto
          </span>
        </summary>
        <div className="disclosure-content">
          <GRVInputs
            assumptions={assumptions}
            onAssumptionsChange={onAssumptionsChange}
            statutoryPensionResult={simulation.statutoryPension}
          />
        </div>
      </details>

      <ScenariosPanel
        onSelectPreset={onAssumptionsChange}
        library={scenarioLib.library}
        onSave={scenarioLib.save}
        onLoad={scenarioLib.load}
        onDuplicate={scenarioLib.duplicate}
        onDelete={scenarioLib.remove}
        onRename={scenarioLib.rename}
      />
      <GlossaryPanel />
    </section>
  )
}
