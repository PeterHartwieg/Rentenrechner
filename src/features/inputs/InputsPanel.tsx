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
import { useFeedbackTarget } from '../qa-feedback'
import { clampNumber } from '../../ui/formatting'
import { formatPercent } from '../../utils/format'
import { computeBavMinimumEntitlement } from '../../engine/bavWarnings'
import { de2026Rules } from '../../rules/de2026'
import { ScenariosPanel } from './ScenariosPanel'
import { GlossaryPanel } from './GlossaryPanel'
import { ProductTabs } from './ProductTabs'
import { NettoBelastungControl } from './sections/NettoBelastungControl'
import {
  PRODUCT_UI_REGISTRY,
  type ProductInputsContext,
} from './productUiRegistry'
import {
  DEFAULT_EXPERT_INFLATION_RATE,
  DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR,
} from '../../data/defaultScenario'
import { nextInflationRateForExpertToggle } from './inflationExpert'

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
  // `onProfileChange` is still part of the public API surface (consumed by
  // PR 3's `AngabenProduktePage` compare-mode wiring + InputsPanel.test) but
  // PR 3 removed the inline <ProfileInputs> disclosure, so the panel body no
  // longer reads from it. PR 4 will delete the entire file.
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
  // PR 3: `onProfileChange` is part of the API but unused inside the panel
  // body (the inline <ProfileInputs> disclosure moved to /eingaben Schritt 1).
  // Keep it referenced so the existing test harness compiles unchanged.
  void onProfileChange
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

  const { targetProps: inputsSectionProps } = useFeedbackTarget({
    id: 'inputs.section',
    label: 'Eingaben',
    precision: 'section',
  })

  return (
    <section
      className="input-panel input-panel--full"
      aria-label="Eingaben"
      {...inputsSectionProps}
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

      {/* PR 3 removed the inline ComparisonPicker: the new
          `<ProdukteEingabenPanel>` on /eingaben/produkte (§ 3 Sparformen
          tiles) is the canonical add/remove surface for compare-mode. */}

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
              // PR 3 removed the inline <ProductFocusHeader>; the new
              // `<DProduktRow>` kicker on /eingaben/produkte already
              // surfaces the product label + Schicht number.
              return entry.renderInputs(ctx)
            })()}
          </>
        )}
      </section>

      <div className="divider" />

      {/* PR 3 deleted the inline "Profil" and "Gesetzliche Rente (GRV)"
          disclosures. Person inputs live on /eingaben Schritt 1 (§ 1-3);
          GRV inputs are reachable from the new § 1 DRV card's
          "Manuell überschreiben" disclosure on /eingaben/produkte. */}

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

// PR 3 relocated `NettoBelastungControl` to
// `sections/NettoBelastungControl.tsx` so it can be mounted both from this
// (legacy) panel and from Schritt 1 § 4 Annahmen. See that file for the
// component definition.
