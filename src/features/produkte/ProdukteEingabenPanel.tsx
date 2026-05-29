import { useState } from 'react'
import type React from 'react'
import './ProdukteEingabenPanel.css'
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
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format'
import { activeRules } from '../../rules'
import { besteuerungsanteilGrv } from '../../rules/legalConstants'
import { getProductMeta } from '../../engine/productRegistry'
import {
  PRIMARY_PRODUCT_IDS,
  SECONDARY_PRODUCT_IDS,
} from '../../content/triggers'
import { de2026Rules } from '../../rules/de2026'
import { computeBavMinimumEntitlement } from '../../engine/bavWarnings'
import { GRVInputs } from '../inputs/GRVInputs'
import {
  PRODUCT_UI_REGISTRY,
  type ProductInputsContext,
} from '../inputs/productUiRegistry'
import { DProduktSection } from './DProduktSection'
import { DProduktRow, type ProduktRowField } from './DProduktRow'
import { DSparformOption } from './DSparformOption'
import { sparformDescriptions } from './sparformDescriptions'

/**
 * `ProdukteEingabenPanel` — Sober D compare-mode body for `/eingaben/produkte`
 * (PR 3 of the Direction D redesign migration). Replaces the legacy
 * `<InputsPanel>` body with three sections ported from
 * `direction-d-pages.jsx` L320-419 of the v3 design bundle:
 *
 *   - § 1 Gesetzliche Rente: a single DRV card hosting the live statutory-
 *     pension snapshot (`assumptions.statutoryPension` + `simulation
 *     .statutoryPension` + `activeRules.socialSecurity.aktuellerRentenwert`).
 *   - § 2 Eigene Verträge: one DProduktRow per product id present in
 *     `assumptions.visibleProducts`, in `PRIMARY_PRODUCT_IDS` +
 *     `SECONDARY_PRODUCT_IDS` order. Each row hosts an inline "Bearbeiten"
 *     disclosure that mounts the product's existing input form from
 *     `PRODUCT_UI_REGISTRY` — no modal, no router push. "Entfernen"
 *     removes the product id from `visibleProducts`.
 *   - § 3 Sparformen: a 2-col tile grid of every product NOT in
 *     `visibleProducts`. Clicking a tile pushes the id into `visibleProducts`.
 *
 * **Data model.** Option A from the PR 3 brief: compare-mode keeps the
 * `ScenarioAssumptions.visibleProducts` boolean-per-product model. There is
 * no instance migration, no storage shape change, no new ProductId mints.
 *
 * **Out of scope (PR 4).** Combine-mode body (still on
 * `<CombineDashboardSidebar>`), `<DAddVertragButton>` (a combine-mode
 * primitive — see the component's docstring).
 *
 * **Disclaimer / sessionStorage / brand untouched.** This panel renders no
 * disclaimer of its own; the global `<DisclaimerBanner>` upstream stays
 * session-only. No public copy mentions "Rentenrechner".
 */

/** All registered comparable product ids in canonical sort order. */
const ALL_COMPARABLE_PRODUCT_IDS: readonly ProductId[] = [
  ...PRIMARY_PRODUCT_IDS,
  ...SECONDARY_PRODUCT_IDS,
] as const

export interface ProdukteEingabenPanelProps {
  /** PR 3 is compare-only; PR 4 will introduce `'combine'`. */
  mode: 'compare'
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  onProfileChange: React.Dispatch<React.SetStateAction<PersonalProfile>>
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  /** Live simulation result (for § 1 GRV card + § 2 row diagnostics). */
  simulation: SimulationResult
  /** Per-product result for the active scenario. */
  selectedResults: ProductResult[]
  insuranceResult?: InsuranceProductResult
  kvdrMember: boolean
  bavLumpSumTaxMode: BavLumpSumTaxMode
  insuranceTaxMode: InsuranceTaxMode
  tarifgebunden: boolean
  onTarifgebundenChange: (next: boolean) => void
  onSyncMonthlyContribution: (targetNet: number) => void
}

export function ProdukteEingabenPanel({
  profile,
  assumptions,
  onProfileChange,
  onAssumptionsChange,
  simulation,
  selectedResults,
  insuranceResult,
  kvdrMember,
  bavLumpSumTaxMode,
  insuranceTaxMode,
  tarifgebunden,
  onTarifgebundenChange,
  onSyncMonthlyContribution,
}: ProdukteEingabenPanelProps) {
  // `onProfileChange` is part of the panel's public API for PR 4 (combine-
  // mode will surface a per-instance profile editor); compare-mode does
  // not render an inline profile editor, so silence the unused-binding
  // lint here without changing the API.
  void onProfileChange
  // Which § 2 rows are currently expanded into their per-product input form.
  // Keyed by ProductId so a row keeps its open state when sibling rows are
  // removed (we don't reset on every re-render).
  const [expandedRows, setExpandedRows] = useState<Set<ProductId>>(new Set())
  // Single boolean for the § 1 "Manuell überschreiben" toggle that exposes
  // <GRVInputs>. Kept local because the user can re-collapse it without
  // any persistence side-effect.
  const [grvOverrideOpen, setGrvOverrideOpen] = useState(false)

  const visibleSet = new Set<ProductId>(assumptions.visibleProducts)
  const enabledOrdered = ALL_COMPARABLE_PRODUCT_IDS.filter((id) => visibleSet.has(id))
  const disabledOrdered = ALL_COMPARABLE_PRODUCT_IDS.filter((id) => !visibleSet.has(id))

  // bAV minimum entitlement (used by the per-product input form). Computed
  // once from active rules.
  const { annualMin: bavMinAnnual, monthlyMin: bavMinMonthly } =
    computeBavMinimumEntitlement(de2026Rules)
  const bavEntitlementMax =
    (de2026Rules.socialSecurity.pensionCapYear *
      de2026Rules.bav.socialSecurityFreePctOfPensionCap) /
    12

  return (
    <section
      className="produkte-eingaben-panel"
      data-testid="produkte-eingaben-panel"
      aria-label="Verträge und Sparformen"
    >
      {/* § 1 — Gesetzliche Rente. Single DRV card with live values. */}
      <DProduktSection
        legend="§ 1 · Gesetzliche Rente"
        note="Pflicht für die meisten Angestellten. Werte aus deiner DRV-Rentenauskunft übernommen."
      >
        <DProduktRow
          kind="DRV · Schicht 1 · Pflicht"
          title="Rentenauskunft der Deutschen Rentenversicherung"
          status="übernommen"
          fields={buildGrvFields(profile, assumptions, simulation)}
          primary="PDF erneut hochladen"
          primaryDisabled
          primaryTitle="Bald verfügbar — OCR-Upload kommt mit einem späteren Release."
          secondary={grvOverrideOpen ? 'Schließen' : 'Manuell überschreiben'}
          onSecondary={() => setGrvOverrideOpen((v) => !v)}
          accent="Anpassung der Werte überschreibt die Annahme aus der DRV-PDF."
        />
        {grvOverrideOpen && (
          <div
            className="produkte-eingaben-panel__disclosure"
            data-testid="produkte-grv-disclosure"
          >
            <GRVInputs
              assumptions={assumptions}
              onAssumptionsChange={onAssumptionsChange}
              statutoryPensionResult={simulation.statutoryPension}
            />
          </div>
        )}
      </DProduktSection>

      {/* § 2 — Eigene Verträge. Iterates `visibleProducts`. */}
      <DProduktSection
        legend="§ 2 · Eigene Verträge"
        note="Sparpläne, Versicherungen, betriebliche Vorsorge. Reihenfolge folgt der Sparform."
      >
        {enabledOrdered.length === 0 ? (
          <p className="produkte-eingaben-panel__empty">
            Du hast aktuell keine Verträge ausgewählt. Wähle unten in § 3 eine
            Sparform aus, um sie zu vergleichen.
          </p>
        ) : (
          enabledOrdered.map((productId) => {
            const meta = getProductMeta(productId)
            const label = meta?.label ?? productId
            const isOpen = expandedRows.has(productId)
            return (
              <div key={productId} className="produkte-eingaben-panel__row-group">
                <DProduktRow
                  kind={kindFor(productId)}
                  title={label}
                  status="aktiv"
                  fields={buildContractFields(
                    productId,
                    profile,
                    assumptions,
                    simulation,
                    selectedResults,
                  )}
                  primary={isOpen ? 'Schließen' : 'Bearbeiten'}
                  onPrimary={() =>
                    setExpandedRows((prev) => {
                      const next = new Set(prev)
                      if (next.has(productId)) next.delete(productId)
                      else next.add(productId)
                      return next
                    })
                  }
                  secondary="Entfernen"
                  destructive
                  onSecondary={() => {
                    onAssumptionsChange((prev) => ({
                      ...prev,
                      visibleProducts: prev.visibleProducts.filter(
                        (id) => id !== productId,
                      ),
                    }))
                    // Drop the row from `expandedRows` too so a future re-add
                    // does not auto-expand into the form.
                    setExpandedRows((prev) => {
                      if (!prev.has(productId)) return prev
                      const next = new Set(prev)
                      next.delete(productId)
                      return next
                    })
                  }}
                />
                {isOpen && (
                  <div
                    className="produkte-eingaben-panel__disclosure"
                    data-testid={`produkte-edit-disclosure-${productId}`}
                  >
                    {renderProductInputs(productId, {
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
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </DProduktSection>

      {/* § 3 — Sparformen, die du noch hinzufügen kannst. */}
      {disabledOrdered.length > 0 && (
        <DProduktSection
          legend="§ 3 · Sparformen, die du noch hinzufügen kannst"
          note="Wenn du eine davon hast, erfassen wir sie mit ihren spezifischen Steuer- und Förderregeln."
        >
          <div className="produkte-eingaben-panel__sparform-grid">
            {disabledOrdered.map((productId) => {
              const meta = getProductMeta(productId)
              const label = meta?.label ?? productId
              return (
                <DSparformOption
                  key={productId}
                  name={label}
                  sub={sparformDescriptions[productId]}
                  onClick={() => {
                    onAssumptionsChange((prev) => ({
                      ...prev,
                      visibleProducts: [...prev.visibleProducts, productId],
                    }))
                  }}
                />
              )
            })}
          </div>
          {/* NOTE: `DAddVertragButton` (combine-mode primitive) is
              intentionally NOT mounted here. In compare-mode the tiles
              already are the "add" affordance — see the component's
              docstring for the full rationale. PR 4 will mount it in the
              combine-mode body alongside the inventory wizard trigger. */}
        </DProduktSection>
      )}

      {/* The "Profil" / "Expertenannahmen" / "ScenariosPanel" / "GlossaryPanel"
          / "NettoBelastungControl" disclosures that used to live at the bottom
          of <InputsPanel> have moved:
            - NettoBelastungControl + ScenariosPanel → Schritt 1 § 4 Annahmen
            - GlossaryPanel → Schritt 2 disclosure below the footer
              (rendered by `AngabenProduktePage`)
            - Profil / Expertenannahmen / GRV details → covered by /eingaben
              Schritt 1 sections § 1-3 + the § 1 DRV card's "Manuell
              überschreiben" disclosure above. */}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Pure field builders — kept inline because they are small, single-use, and
// the data plumbing here is bespoke per-product. Promoting them to a separate
// module is a refactor opportunity once PR 4 reuses them for combine-mode.
// ---------------------------------------------------------------------------

function buildGrvFields(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  simulation: SimulationResult,
): readonly ProduktRowField[] {
  const standDate = new Date().toLocaleDateString('de-DE', {
    month: '2-digit',
    year: 'numeric',
  })
  // Browser dateformat is "05.2026" or "05/2026" depending on locale data;
  // normalise to the bundle's `"05 / 2026"` spacing for visual parity.
  const standDisplay = standDate.replace(/[./]/g, ' / ')

  const currentEp = assumptions.statutoryPension.currentEntgeltpunkte
  const projectedEp = simulation.statutoryPension.projectedEntgeltpunkte
  const grossMonthly = simulation.statutoryPension.grossMonthlyPension
  const rentenwert = activeRules.socialSecurity.aktuellerRentenwert
  // Retirement year is derived from active rules year + remaining years until
  // retirement (mirrors the engine convention in `simulationContext.ts:192`).
  // Profile carries `age` and `retirementAge`; the active rule year locks the
  // calendar baseline so a 2027 rules swap moves the projection automatically.
  const retirementYear =
    activeRules.year + (profile.retirementAge - profile.age)
  const besteuerungsanteil = besteuerungsanteilGrv(retirementYear)
  // The current grossMonthlyPension is dominated by the retirement-projected
  // figure but rendered as "Brutto-Rente, geschätzt" so callers can scan it
  // against their DRV PDF.

  return [
    { key: 'Stand', value: standDisplay },
    {
      key: 'Bisherige Entgeltpunkte',
      value: `${formatNumber(currentEp, 2)} EP`,
    },
    {
      key: `Voraussichtlich mit ${profile.retirementAge}`,
      value: `${formatNumber(projectedEp, 2)} EP`,
    },
    {
      key: 'Heutiger Rentenwert (West)',
      value: formatCurrency(rentenwert, 2),
    },
    {
      key: 'Brutto-Rente, geschätzt',
      value: `${formatCurrency(grossMonthly, 0)}/Mon.`,
    },
    {
      key: 'Steuerlich erfasst ab',
      value: `${retirementYear} (${formatPercent(besteuerungsanteil, 0)})`,
    },
  ]
}

function buildContractFields(
  productId: ProductId,
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  simulation: SimulationResult,
  selectedResults: readonly ProductResult[],
): readonly ProduktRowField[] {
  const result = selectedResults.find((r) => r.productId === productId)
  const riy = result?.accumulationRiy
  // Compare-mode invariant: ETF + Insurance always invest bAV's net cost;
  // bAV monthly gross conversion is the user input. We display the relevant
  // primary contribution figure plus a few diagnostic context rows.
  switch (productId) {
    case 'etf': {
      return [
        {
          key: 'Sparrate (Netto-Beitrag)',
          value: `${formatCurrency(simulation.bavFunding.monthlyNetCost, 0)}/Mon.`,
        },
        {
          key: 'TER',
          value: `${formatPercent(assumptions.etf.annualAssetFee, 2)} p.a.`,
        },
        {
          key: 'Teilfreistellung',
          value: `${formatPercent(assumptions.etf.equityPartialExemption, 0)}`,
        },
        {
          key: 'Eff. Kosten',
          value: riy !== undefined ? `${formatPercent(riy, 2)} p.a.` : '–',
        },
        {
          key: 'Steuerlich',
          value: 'Schicht 3 (Abgeltungsteuer)',
        },
        {
          key: 'Beitragsdynamik',
          value:
            assumptions.etf.annualContributionGrowthRate > 0
              ? `${formatPercent(assumptions.etf.annualContributionGrowthRate, 1)} p.a.`
              : 'keine',
        },
      ]
    }
    case 'bav': {
      const bav = assumptions.bav
      const monthlyNet = simulation.bavFunding.monthlyNetCost
      return [
        {
          key: 'Brutto-Umwandlung',
          value: `${formatCurrency(bav.monthlyGrossConversion, 0)}/Mon.`,
        },
        {
          key: 'Netto-Belastung',
          value: `${formatCurrency(monthlyNet, 0)}/Mon.`,
        },
        {
          key: 'Durchführungsweg',
          value: durchfuehrungswegLabel(bav.durchfuehrungsweg),
        },
        {
          key: 'Eff. Kosten',
          value: riy !== undefined ? `${formatPercent(riy, 2)} p.a.` : '–',
        },
        {
          key: 'Auszahlung',
          value: payoutModeLabel(bav.payoutMode),
        },
        {
          key: 'KV in Rente',
          value: retirementHealthLabel(profile, bav.kvdrMember),
        },
      ]
    }
    case 'versicherung': {
      // ProductId 'versicherung' maps to assumptions key `insurance` per
      // `PRODUCT_REGISTRY[2].assumptionsKey`.
      const ins = assumptions.insurance
      return [
        {
          key: 'Sparrate (Netto-Beitrag)',
          value: `${formatCurrency(simulation.bavFunding.monthlyNetCost, 0)}/Mon.`,
        },
        {
          key: 'Vertragsbeginn',
          value: `${ins.contractStartYear}`,
        },
        {
          key: 'Rentenfaktor',
          value: `${formatCurrency(ins.rentenfaktor, 2)}/10 T €`,
        },
        {
          key: 'Eff. Kosten',
          value: riy !== undefined ? `${formatPercent(riy, 2)} p.a.` : '–',
        },
        {
          key: 'Auszahlung',
          value: payoutModeLabel(ins.payoutMode),
        },
        {
          key: 'Auszahlung ab',
          value: `${profile.retirementAge} Jahre`,
        },
      ]
    }
    case 'basisrente': {
      const bs = assumptions.basisrente
      return [
        {
          key: 'Beitrag',
          value: `${formatCurrency(bs.monthlyGrossContribution, 0)}/Mon.`,
        },
        {
          key: 'Steuerlich',
          value: 'Schicht 1 (§ 10 Abs. 3 EStG)',
        },
        {
          key: 'Rentenfaktor',
          value: `${formatCurrency(bs.rentenfaktor, 2)}/10 T €`,
        },
        {
          key: 'Eff. Kosten',
          value: riy !== undefined ? `${formatPercent(riy, 2)} p.a.` : '–',
        },
        {
          key: 'Auszahlung',
          value: 'Leibrente (pflicht)',
        },
        {
          key: 'Kapitalwahlrecht',
          value: 'nein (§ 10 Abs. 1 Nr. 2 b EStG)',
        },
      ]
    }
    case 'altersvorsorgedepot': {
      const avd = assumptions.altersvorsorgedepot
      return [
        {
          key: 'Eigenbeitrag',
          value: `${formatCurrency(avd.monthlyOwnContribution, 0)}/Mon.`,
        },
        {
          key: 'Typ',
          value: subtypeLabel(avd.subtype),
        },
        {
          key: 'Förderfähig',
          value: avdEligibilityLabel(avd.eligibility),
        },
        {
          key: 'Eff. Kosten',
          value: riy !== undefined ? `${formatPercent(riy, 2)} p.a.` : '–',
        },
        {
          key: 'Auszahlung',
          value: avdPayoutModeLabel(avd.payoutMode),
        },
        {
          key: 'Steuerlich',
          value: 'Schicht 2 (§ 22 Nr. 5 EStG)',
        },
      ]
    }
    case 'riester': {
      const ri = assumptions.riester
      return [
        {
          key: 'Eigenbeitrag',
          value: `${formatCurrency(ri.monthlyOwnContribution, 0)}/Mon.`,
        },
        {
          key: 'Förderfähig',
          value: riesterEligibilityLabel(ri.eligibility),
        },
        {
          key: 'Beitragsgarantie',
          value: ri.capitalGuarantee.enabled
            ? `${formatPercent(ri.capitalGuarantee.floorPctOfContributions, 0)} der Beiträge`
            : 'keine',
        },
        {
          key: 'Eff. Kosten',
          value: riy !== undefined ? `${formatPercent(riy, 2)} p.a.` : '–',
        },
        {
          key: 'Auszahlung',
          value: payoutModeLabel(ri.payoutMode),
        },
        {
          key: 'Steuerlich',
          value: 'Schicht 2 (§ 22 Nr. 5 EStG)',
        },
      ]
    }
    default:
      // PRODUCT_REGISTRY exhaustiveness — adding a new product surfaces here.
      // Returning a single placeholder keeps the row visible until per-product
      // field copy is added.
      return [
        { key: 'Eintrag', value: 'Konfiguration siehe Bearbeiten' },
      ]
  }
}

// ---------------------------------------------------------------------------
// Per-product label helpers. Kept inline so `productRegistry.ts` does not need
// to grow a presentational concern. None of these encode statutory values —
// they map enums to German display strings only.
// ---------------------------------------------------------------------------

/**
 * Returns the correct retirement health-insurance label for display.
 * PKV takes priority over GKV branches because the bAV payout pipeline
 * routes PKV separately (src/engine/salary.ts + src/engine/bavPayout.ts):
 * the KVdR / freiwillig-GKV distinction is only relevant when the member
 * is in the statutory GKV system.
 */
function retirementHealthLabel(
  profile: PersonalProfile,
  kvdrMember: boolean,
): string {
  if (!profile.publicHealthInsurance) return 'PKV'
  return kvdrMember ? 'KVdR' : 'freiwillig GKV'
}

function kindFor(productId: ProductId): string {
  const meta = getProductMeta(productId)
  const base = meta?.label ?? productId
  switch (productId) {
    case 'etf':
      return `${base} · Schicht 3`
    case 'bav':
      return `${base} · Schicht 2`
    case 'versicherung':
      return `${base} · Schicht 3`
    case 'basisrente':
      return `${base} · Schicht 1`
    case 'altersvorsorgedepot':
      return `${base} · Schicht 2`
    case 'riester':
      return `${base} · Schicht 2`
    default:
      return base
  }
}

function payoutModeLabel(mode: string): string {
  switch (mode) {
    case 'leibrente':
      return 'Leibrente'
    case 'zeitrente':
      return 'Zeitrente'
    case 'kapitalverzehr':
      return 'Selbstgesteuert (Kapitalverzehr)'
    default:
      return mode
  }
}

function durchfuehrungswegLabel(weg: string): string {
  switch (weg) {
    case 'direktversicherung_3_63':
      return 'Direktversicherung (§ 3 Nr. 63)'
    case 'pensionskasse_3_63':
      return 'Pensionskasse (§ 3 Nr. 63)'
    case 'pensionsfonds_3_63':
      return 'Pensionsfonds (§ 3 Nr. 63)'
    case 'direktversicherung_40b_alt':
      return 'Direktversicherung (§ 40b a.F.)'
    case 'direktzusage':
      return 'Direktzusage'
    case 'unterstuetzungskasse':
      return 'Unterstützungskasse'
    default:
      return weg
  }
}

function subtypeLabel(subtype: string): string {
  switch (subtype) {
    case 'depot_no_guarantee':
      return 'Depot ohne Beitragsgarantie'
    case 'standarddepot':
      return 'Standarddepot mit Glidepath'
    case 'guarantee_80':
      return 'Beitragsgarantie 80 %'
    case 'guarantee_100':
      return 'Beitragsgarantie 100 %'
    default:
      return subtype
  }
}

function avdEligibilityLabel(eligibility: {
  directlyEligible: boolean
  indirectSpouseEligible: boolean
}): string {
  if (eligibility.directlyEligible) return 'unmittelbar zulagenberechtigt'
  if (eligibility.indirectSpouseEligible)
    return 'mittelbar (Ehegatte)'
  return 'nicht zulagenberechtigt'
}

function riesterEligibilityLabel(eligibility: {
  directlyEligible: boolean
  indirectSpouseEligible?: boolean
}): string {
  if (eligibility.directlyEligible) return 'unmittelbar zulagenberechtigt'
  if (eligibility.indirectSpouseEligible)
    return 'mittelbar (Ehegatte)'
  return 'nicht zulagenberechtigt'
}

function avdPayoutModeLabel(mode: string): string {
  switch (mode) {
    case 'lifelong_annuity':
      return 'Leibrente'
    case 'certified_payout_plan':
      return 'Auszahlplan (zert.)'
    case 'hybrid_80_annuity':
      return 'Hybrid (80 % Leibrente)'
    default:
      return mode
  }
}

// ---------------------------------------------------------------------------
// Per-product inputs disclosure. Reuses the existing
// `PRODUCT_UI_REGISTRY.renderInputs` from `inputs/productUiRegistry.tsx` so
// PR 3 does not duplicate any form logic.
// ---------------------------------------------------------------------------

function renderProductInputs(
  productId: ProductId,
  ctx: ProductInputsContext,
): React.ReactNode {
  const entry = PRODUCT_UI_REGISTRY[productId]
  if (!entry) return null
  return entry.renderInputs(ctx)
}
