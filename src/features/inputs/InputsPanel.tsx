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
import { formatCurrency, formatPercent } from '../../utils/format'
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
import {
  DEFAULT_EXPERT_INFLATION_RATE,
  DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR,
} from '../../data/defaultScenario'
import { nextInflationRateForExpertToggle } from './inflationExpert'

const NETTO_BELASTUNG_PRESETS = [100, 200, 400] as const

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
  /**
   * Issue 23: when set, the panel will pre-select this product tab once.
   * Call `onActiveTabConsumed` after applying it so the parent can clear
   * the request and avoid re-triggering on subsequent renders.
   */
  requestActiveTab?: ProductId | null
  onActiveTabConsumed?: () => void
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
  requestActiveTab,
  onActiveTabConsumed,
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
  const [lastExpertInflationRate, setLastExpertInflationRate] = useState(
    () => assumptions.inflationRate > 0 ? assumptions.inflationRate : DEFAULT_EXPERT_INFLATION_RATE,
  )

  // Issue 23: when a product card's "Einstellungen anpassen" button is clicked,
  // App.tsx sets `requestActiveTab` to the target product and navigates here.
  // We honour the external override by feeding it into `activeTab` computation
  // directly. `onActiveTabConsumed` is called when the user clicks a tab manually,
  // clearing `requestActiveTab` in the parent so subsequent user tab-clicks are
  // not overridden.
  const effectiveTab: ProductId | null =
    requestActiveTab && visible.includes(requestActiveTab)
      ? requestActiveTab
      : requestedTab

  const activeTab: ProductId | null =
    effectiveTab && visible.includes(effectiveTab) ? effectiveTab : (visible[0] ?? null)

  return (
    <section
      className="input-panel input-panel--full"
      aria-label="Eingaben"
      data-qa-target="inputs.section"
      data-qa-section="true"
    >
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

      <NettoBelastungControl
        amountEUR={assumptions.equalInputAmountEUR ?? DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR}
        onAmountChange={(value) =>
          onSyncMonthlyContribution(clampNumber(Number(value), 0, 10_000))
        }
      />

      <div className="divider" />

      <div className="field-grid">
        <NumberField
          label="Kapital aufgebraucht bis (Alter)"
          feedbackTargetId="inputs.assumptions.retirementEndAge"
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
            <ProductTabs
              visible={visible}
              active={activeTab}
              onChange={(id) => {
                setRequestedTab(id)
                // Clear the external request so user-driven tab clicks are not
                // overridden on the next render (issue 23).
                onActiveTabConsumed?.()
              }}
            />

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

      <details className="disclosure-section">
        <summary>
          <span className="disclosure-toggle">Expertenannahmen</span>
          <span className="disclosure-recap">
            Inflation {assumptions.inflationRate > 0 ? formatPercent(assumptions.inflationRate, 1) : 'aus'}
          </span>
        </summary>
        <div className="disclosure-content">
          <label className="field-inline">
            <input
              type="checkbox"
              checked={assumptions.inflationRate > 0}
              onChange={(event) =>
                onAssumptionsChange((current) => {
                  if (!event.target.checked && current.inflationRate > 0) {
                    setLastExpertInflationRate(current.inflationRate)
                  }
                  return {
                    ...current,
                    inflationRate: nextInflationRateForExpertToggle(
                      event.target.checked,
                      current.inflationRate,
                      lastExpertInflationRate,
                    ),
                  }
                })
              }
            />
            Inflation berücksichtigen
          </label>
          {assumptions.inflationRate > 0 && (
            <NumberField
              label="Inflationsrate"
              feedbackTargetId="inputs.assumptions.inflationRate"
              value={assumptions.inflationRate * 100}
              min={0}
              max={8}
              step={0.1}
              suffix="% p.a."
              onCommit={(value) =>
                onAssumptionsChange((current) => {
                  const nextRate = clampNumber(Number(value), 0, 8) / 100
                  if (nextRate > 0) setLastExpertInflationRate(nextRate)
                  return {
                    ...current,
                    inflationRate: nextRate,
                  }
                })
              }
            />
          )}
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

interface NettoBelastungControlProps {
  amountEUR: number
  onAmountChange: (value: number) => void
}

function NettoBelastungControl({
  amountEUR,
  onAmountChange,
}: NettoBelastungControlProps) {
  return (
    <section
      className="netto-belastung-control"
      aria-label="Monatlicher Vergleichsbetrag"
      data-qa-target="inputs.nettoBelastung.section"
      data-qa-section="true"
    >
      <div className="netto-belastung-row">
        <NumberField
          label="Netto-Belastung"
          feedbackTargetId="inputs.nettoBelastung.amount"
          value={amountEUR}
          min={0}
          max={10_000}
          step={10}
          suffix="EUR mtl."
          onCommit={(value) => onAmountChange(Number(value))}
        />
        <div className="netto-belastung-presets" aria-label="Presets">
          {NETTO_BELASTUNG_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={
                Math.abs(amountEUR - preset) < 0.01
                  ? 'netto-belastung-preset active'
                  : 'netto-belastung-preset'
              }
              onClick={() => onAmountChange(preset)}
            >
              {preset} EUR
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
