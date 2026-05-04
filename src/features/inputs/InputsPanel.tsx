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
import { DEFAULT_EQUAL_INPUT_AMOUNT_EUR } from '../../data/defaultScenario'
import { InfoTip } from '../../ui/InfoTip'

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

      {/* ── Issue 16: compare-mode sub-mode toggle (equal-cash vs equal-input) ── */}
      <CompareSubModeToggle
        subMode={assumptions.compareSubMode ?? 'equal_cash'}
        amountEUR={assumptions.equalInputAmountEUR ?? DEFAULT_EQUAL_INPUT_AMOUNT_EUR}
        onSubModeChange={(next) =>
          onAssumptionsChange((current) => ({ ...current, compareSubMode: next }))
        }
        onAmountChange={(value) =>
          onAssumptionsChange((current) => ({
            ...current,
            equalInputAmountEUR: clampNumber(Number(value), 0, 10_000),
          }))
        }
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

// ---------------------------------------------------------------------------
// Issue 16 — compare-mode sub-mode toggle.
// ---------------------------------------------------------------------------

interface CompareSubModeToggleProps {
  subMode: 'equal_cash' | 'equal_input'
  amountEUR: number
  onSubModeChange: (next: 'equal_cash' | 'equal_input') => void
  onAmountChange: (value: number) => void
}

function CompareSubModeToggle({
  subMode,
  amountEUR,
  onSubModeChange,
  onAmountChange,
}: CompareSubModeToggleProps) {
  return (
    <div className="field-grid" aria-label="Vergleichsmodus">
      <fieldset className="field-stack">
        <legend>Vergleichsmodus</legend>
        <label>
          <input
            type="radio"
            name="compare-sub-mode"
            checked={subMode === 'equal_cash'}
            onChange={() => onSubModeChange('equal_cash')}
          />{' '}
          Gleiche Netto-Belastung (bAV-Anker)
        </label>
        <label>
          <input
            type="radio"
            name="compare-sub-mode"
            checked={subMode === 'equal_input'}
            onChange={() => onSubModeChange('equal_input')}
          />{' '}
          Gleicher Beitrag – ETF &amp; priv. RV (€/Monat){' '}
          <InfoTip
            icon="info"
            label="Erklärung: Gleicher Beitrag"
            text="Nur ETF und private Rentenversicherung werden auf diesen Betrag gesetzt. bAV läuft weiterhin über die eigene Entgeltumwandlung (§ 3 Nr. 63 EStG); Basisrente, AVD und Riester nutzen ihre eigenen Beitragsfelder."
          />
        </label>
      </fieldset>
      {subMode === 'equal_input' && (
        <NumberField
          label="Vergleichsbetrag"
          value={amountEUR}
          min={0}
          max={10_000}
          step={10}
          suffix="€/Monat"
          onCommit={(value) => onAmountChange(Number(value))}
        />
      )}
    </div>
  )
}
