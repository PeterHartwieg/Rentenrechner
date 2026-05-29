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
import type {
  Scenario,
  WorkspaceAssumptionsV2,
} from '../../domain/workspace'
import type {
  AltersvorsorgedepotInstance,
  BasisrenteInstance,
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  RiesterInstance,
} from '../../domain/instances'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format'
import { activeRules } from '../../rules'
import { besteuerungsanteilGrv } from '../../rules/legalConstants'
import { getProductMeta, PRODUCT_REGISTRY } from '../../engine/productRegistry'
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
import {
  INVENTORY_PRODUCT_REGISTRY,
  type MultiInstanceProductId,
} from '../inventory/inventoryProductRegistry'
import { DAddVertragButton } from './DAddVertragButton'
import { DProduktSection } from './DProduktSection'
import { DProduktRow, type ProduktRowField } from './DProduktRow'
import { DSparformOption } from './DSparformOption'
import { sparformDescriptions } from './sparformDescriptions'

/**
 * `ProdukteEingabenPanel` — Sober D body for `/eingaben/produkte`.
 *
 * Compare-mode (PR 3): one row per `ScenarioAssumptions.visibleProducts`
 * entry, with inline-disclosure edit forms and § 3 quick-add tiles for the
 * disabled products. Combine-mode (PR 4): iterates the workspace's
 * per-product instance arrays (one `<DProduktRow>` per instance across
 * `MultiInstanceProductId`), wires "Bearbeiten" to the per-contract drill-in,
 * "Entfernen" to the workspace `removeInstance` mutator, and adds a
 * "Weitere Optionen" kebab-button that opens the page-hosted
 * `<ContractDecisionMenu>` modal. § 3 tiles in combine-mode always render
 * (combine-mode allows N instances per product) and each click calls
 * `addInstance(productId)` to seed a new contract via
 * `INVENTORY_PRODUCT_REGISTRY` defaults.
 *
 * The props type is a discriminated union over `mode` so callers cannot mix
 * compare-mode singleton state with combine-mode workspace state on the same
 * panel mount. The two modes share the same shell (§ 1 + § 2 + § 3 + the
 * three `<DProduktSection>` wrappers) and diverge only in the body of each
 * section.
 *
 * **Data model.** Compare-mode (Option A from the PR 3 brief) keeps the
 * `ScenarioAssumptions.visibleProducts` boolean-per-product model. Combine-mode
 * reads workspace `baseline.assumptions` per-product instance arrays. There
 * is no instance migration, no storage shape change, no new ProductId mints.
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

/**
 * All multi-instance product ids in canonical PRODUCT_REGISTRY sort order.
 *
 * Derived from PRODUCT_REGISTRY so that adding or reordering a product in
 * the registry automatically flows through to § 2 row order and § 3 tile
 * order here. The filter keeps only ids that exist as keys in
 * INVENTORY_PRODUCT_REGISTRY (i.e. multi-instance products — GRV is a
 * singleton and is not present there).
 */
const ALL_MULTI_INSTANCE_PRODUCT_IDS: readonly MultiInstanceProductId[] =
  PRODUCT_REGISTRY
    .map((entry) => entry.metadata.id)
    .filter((id): id is MultiInstanceProductId => id in INVENTORY_PRODUCT_REGISTRY)

/**
 * Union of all per-product workspace instance shapes. Aligned with
 * `AnyInstance` in `src/app/portfolioState.ts`; we re-declare here so the
 * panel doesn't drag the React-free portfolio state hook into its dependency
 * tree just for the type. CR-PR4-R1-4: union stays as a `type` alias
 * (project convention — `interface` is for object shapes only).
 */
type WorkspaceInstance =
  | BavInstance
  | EtfInstance
  | InsuranceInstance
  | BasisrenteInstance
  | AltersvorsorgedepotInstance
  | RiesterInstance

/**
 * One row in the combine-mode § 2 iteration: a workspace instance tagged
 * with the multi-instance product id it belongs to. CR-PR4-R1-4: object
 * shape → `interface`.
 */
interface InstanceRow {
  productId: MultiInstanceProductId
  instance: WorkspaceInstance
}

// ---------------------------------------------------------------------------
// Props — discriminated union over `mode` so compare-mode and combine-mode
// callers stay type-disjoint at the prop boundary.
// ---------------------------------------------------------------------------

interface ProdukteEingabenPanelCompareProps {
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

interface ProdukteEingabenPanelCombineProps {
  mode: 'combine'
  baseline: Scenario
  assumptions: WorkspaceAssumptionsV2
  /** Combine-mode statutory-pension projection (gross monthly + projected EP).
   *  Sourced from `useCombineSimulation().statutoryPension`. Optional because
   *  callers may want to render the panel without first running the simulation
   *  (e.g. on a fresh combine-mode workspace with no instances yet); in that
   *  case the § 1 DRV card shows inputs only.
   */
  statutoryPensionResult?: SimulationResult['statutoryPension']
  /** Patch the baseline scenario (combine-mode only). Stamps `lastEditedAt`. */
  onPatchBaseline?: (patch: Partial<Omit<Scenario, 'id' | 'createdAt'>>) => void
  /** Add a default instance of the given product type (combine-mode). */
  addInstance: (productId: MultiInstanceProductId) => void
  /** Remove an instance by productId + instanceId (combine-mode). */
  removeInstance: (productId: MultiInstanceProductId, instanceId: string) => void
  /** "Bearbeiten" — navigate to the per-contract drill-in. */
  onEditInstance: (productId: MultiInstanceProductId, instanceId: string) => void
  /** "Weitere Optionen" — open the page-hosted ContractDecisionMenu modal. */
  onOpenDecisionMenu?: (instanceId: string) => void
}

export type ProdukteEingabenPanelProps =
  | ProdukteEingabenPanelCompareProps
  | ProdukteEingabenPanelCombineProps

export function ProdukteEingabenPanel(props: ProdukteEingabenPanelProps) {
  if (props.mode === 'combine') {
    return <CombinePanel {...props} />
  }
  return <ComparePanel {...props} />
}

// ---------------------------------------------------------------------------
// Compare-mode panel (extracted from the original function body so the props
// narrowing at the discriminated-union boundary stays simple).
// ---------------------------------------------------------------------------

function ComparePanel({
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
}: ProdukteEingabenPanelCompareProps) {
  // `onProfileChange` is part of the panel's public API; compare-mode does
  // not render an inline profile editor, so silence the unused-binding lint
  // here without changing the API.
  void onProfileChange
  const [expandedRows, setExpandedRows] = useState<Set<ProductId>>(new Set())
  const [grvOverrideOpen, setGrvOverrideOpen] = useState(false)

  const visibleSet = new Set<ProductId>(assumptions.visibleProducts)
  const enabledOrdered = ALL_COMPARABLE_PRODUCT_IDS.filter((id) => visibleSet.has(id))
  const disabledOrdered = ALL_COMPARABLE_PRODUCT_IDS.filter((id) => !visibleSet.has(id))

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
      data-mode="compare"
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
          fields={buildGrvFieldsCompare(profile, assumptions, simulation)}
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
                  fields={buildContractFieldsCompare(
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
        </DProduktSection>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Combine-mode panel — PR 4 entry point. Iterates workspace instance arrays
// (one row per instance per product) and wires per-instance Bearbeiten /
// Entfernen / Optionen affordances back to the page-level mutators.
// ---------------------------------------------------------------------------

function CombinePanel({
  baseline,
  assumptions,
  statutoryPensionResult,
  onPatchBaseline,
  addInstance,
  removeInstance,
  onEditInstance,
  onOpenDecisionMenu,
}: ProdukteEingabenPanelCombineProps) {
  const [grvOverrideOpen, setGrvOverrideOpen] = useState(false)
  // CX-PR4-2 R1: track which instance rows have their inline editor open.
  // Same useState<Set<…>> shape as compare-mode's `expandedRows` so a future
  // refactor that lifts the disclosure pattern into a shared helper sees
  // one consistent model.
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(
    new Set(),
  )

  /**
   * Build a per-instance patch dispatcher. Replaces the targeted instance
   * inside the workspace baseline's per-product array and dispatches the
   * resulting patch through `onPatchBaseline` so the storage / migration
   * pipeline is preserved (P1 storage invariant).
   *
   * No-op when the panel mounts without `onPatchBaseline` (e.g. test
   * fixtures that exercise only read-only rendering); the editor cards
   * tolerate this because their commit callbacks just become inert.
   */
  const patchInstanceFactory = (
    productId: MultiInstanceProductId,
    instanceId: string,
  ) => (patch: Partial<WorkspaceInstance>) => {
    if (!onPatchBaseline) return
    const arr = getInstanceArrayForProduct(assumptions, productId)
    const nextArr = arr.map((inst) =>
      inst.instanceId === instanceId ? { ...inst, ...patch } : inst,
    )
    // The workspace baseline assumptions slot for this product receives the
    // mapped array. Spreading existing assumptions then overwriting the
    // product slot keeps statutoryPension + retirementEndAge etc. intact.
    const productKey: keyof typeof assumptions =
      productId === 'versicherung' ? 'insurance' : productId
    onPatchBaseline({
      assumptions: {
        ...assumptions,
        [productKey]: nextArr,
      } as typeof assumptions,
    })
  }

  // Per-product instance arrays in PRODUCT_REGISTRY order. We iterate the
  // multi-instance product ids (registry-derived constant) so adding a new
  // product to `MultiInstanceProductId` automatically renders here without a
  // local branch chain.
  //
  // CR-PR4-R1-4: `InstanceRow` is an object shape, not a union — project
  // convention is `interface` for object shapes (`type` only for unions /
  // primitive aliases). The `WorkspaceInstance` union is named separately at
  // module level so the discriminated narrow lives in one place.
  const rows: InstanceRow[] = []
  for (const productId of ALL_MULTI_INSTANCE_PRODUCT_IDS) {
    const arr = getInstanceArrayForProduct(assumptions, productId)
    for (const inst of arr) {
      rows.push({ productId, instance: inst })
    }
  }

  // Disabled-product tiles in § 3 — combine-mode always renders every multi-
  // instance product as an "add" tile because users may want N instances of
  // the same product. Singleton GRV is omitted.
  const sparformIds = ALL_MULTI_INSTANCE_PRODUCT_IDS

  return (
    <section
      className="produkte-eingaben-panel"
      data-testid="produkte-eingaben-panel"
      data-mode="combine"
      aria-label="Verträge und Sparformen"
    >
      {/* § 1 — Gesetzliche Rente. Same DRV card shape; combine-mode sources
          values from `baseline.profile` + `baseline.assumptions.statutoryPension`.
          When the parent provides a `statutoryPensionResult`, the projected EP
          and gross monthly fields render; otherwise we fall back to the
          inputs-only view (combine-mode has its own simulation pipeline via
          `useCombineSimulation`, but the page-level caller decides whether to
          run it before mounting this panel). */}
      <DProduktSection
        legend="§ 1 · Gesetzliche Rente"
        note="Pflicht für die meisten Angestellten. Werte aus deiner DRV-Rentenauskunft übernommen."
      >
        {/* CR-PR4-R1-5: gate the secondary CTA label/handler on the same
            condition as the disclosure body — without `onPatchBaseline` /
            `statutoryPensionResult` the disclosure cannot mount, so the
            "Schließen" / "Manuell überschreiben" toggle was a dead control. */}
        {(() => {
          const canOverrideGrv =
            onPatchBaseline !== undefined && statutoryPensionResult !== undefined
          return (
            <DProduktRow
              kind="DRV · Schicht 1 · Pflicht"
              title="Rentenauskunft der Deutschen Rentenversicherung"
              status="übernommen"
              fields={buildGrvFieldsCombine(
                baseline.profile,
                assumptions,
                statutoryPensionResult,
              )}
              primary="PDF erneut hochladen"
              primaryDisabled
              primaryTitle="Bald verfügbar — OCR-Upload kommt mit einem späteren Release."
              secondary={
                canOverrideGrv
                  ? grvOverrideOpen
                    ? 'Schließen'
                    : 'Manuell überschreiben'
                  : undefined
              }
              onSecondary={
                canOverrideGrv ? () => setGrvOverrideOpen((v) => !v) : undefined
              }
              accent="Anpassung der Werte überschreibt die Annahme aus der DRV-PDF."
            />
          )
        })()}
        {grvOverrideOpen && onPatchBaseline && statutoryPensionResult && (
          <div
            className="produkte-eingaben-panel__disclosure"
            data-testid="produkte-grv-disclosure"
          >
            <GRVInputs
              assumptions={toSingletonAssumptionsForGrvOverride(assumptions)}
              onAssumptionsChange={(updater) => {
                // GRVInputs uses a singleton `ScenarioAssumptions` shape, but
                // combine-mode stores everything on the workspace baseline. We
                // translate the singleton update back into a workspace patch
                // here: only the statutoryPension sub-object is editable from
                // this surface.
                const prevSingleton = toSingletonAssumptionsForGrvOverride(assumptions)
                const next =
                  typeof updater === 'function'
                    ? (updater as (prev: ScenarioAssumptions) => ScenarioAssumptions)(prevSingleton)
                    : updater
                if (next.statutoryPension === prevSingleton.statutoryPension) {
                  return
                }
                onPatchBaseline({
                  assumptions: {
                    ...assumptions,
                    statutoryPension: next.statutoryPension,
                  },
                })
              }}
              statutoryPensionResult={statutoryPensionResult}
            />
          </div>
        )}
      </DProduktSection>

      {/* § 2 — Eigene Verträge. One row per instance across all products. */}
      <DProduktSection
        legend="§ 2 · Eigene Verträge"
        note="Sparpläne, Versicherungen, betriebliche Vorsorge. Reihenfolge folgt der Sparform."
      >
        {rows.length === 0 ? (
          <p className="produkte-eingaben-panel__empty">
            Du hast noch keinen Vertrag erfasst. Wähle unten in § 3 eine
            Sparform aus oder klicke auf „+ Vertrag hinzufügen".
          </p>
        ) : (
          rows.map(({ productId, instance }) => {
            const meta = getProductMeta(productId)
            const fallbackLabel = meta?.label ?? productId
            const titleLabel = instance.label && instance.label.length > 0
              ? instance.label
              : fallbackLabel
            const status = instance.status
            // We surface the kebab/menu affordance only for active or paid-up
            // instances. Surrendered and offered states are terminal — there
            // is nothing to decide.
            const canOpenMenu =
              onOpenDecisionMenu !== undefined &&
              (status === 'active' || status === 'paid_up')
            // CX-PR4-2 R1: "Bearbeiten" now toggles an inline disclosure
            // hosting the per-product editor (mirrors compare-mode PR 3
            // pattern). "Details ansehen ›" is the new secondary affordance
            // that opens the read-only /vertrag/:id detail page —
            // `onEditInstance` is reused for that navigation slot. The kebab
            // "Weitere Optionen ⋯" still opens ContractDecisionMenu.
            const isOpen = expandedInstances.has(instance.instanceId)
            const uiEntry = PRODUCT_UI_REGISTRY[productId]
            const patchInstance = patchInstanceFactory(
              productId,
              instance.instanceId,
            )
            const toggleEditor = () =>
              setExpandedInstances((prev) => {
                const next = new Set(prev)
                if (next.has(instance.instanceId))
                  next.delete(instance.instanceId)
                else next.add(instance.instanceId)
                return next
              })
            return (
              <div
                key={instance.instanceId}
                className="produkte-eingaben-panel__row-group"
                data-instance-id={instance.instanceId}
                data-product-id={productId}
              >
                <DProduktRow
                  kind={kindFor(productId)}
                  title={titleLabel}
                  status={statusLabel(status)}
                  fields={buildInstanceFieldsCombine(productId, instance)}
                  primary={isOpen ? 'Schließen' : 'Bearbeiten'}
                  onPrimary={toggleEditor}
                  secondary="Entfernen"
                  destructive
                  onSecondary={() =>
                    removeInstance(productId, instance.instanceId)
                  }
                  accent={
                    <div className="produkte-eingaben-panel__row-actions">
                      <button
                        type="button"
                        className="produkte-eingaben-panel__menu-btn"
                        onClick={() =>
                          onEditInstance(productId, instance.instanceId)
                        }
                        title="Vertrag-Detail öffnen"
                        aria-label={`Details ansehen für ${titleLabel}`}
                        data-testid={`produkte-details-btn-${instance.instanceId}`}
                      >
                        Details ansehen ›
                      </button>
                      {canOpenMenu && (
                        <button
                          type="button"
                          className="produkte-eingaben-panel__menu-btn"
                          onClick={() =>
                            onOpenDecisionMenu?.(instance.instanceId)
                          }
                          title="Weitere Optionen für diesen Vertrag"
                          aria-label={`Weitere Optionen für ${titleLabel}`}
                          data-testid={`produkte-menu-btn-${instance.instanceId}`}
                        >
                          Weitere Optionen ⋯
                        </button>
                      )}
                    </div>
                  }
                />
                {isOpen && (
                  <div
                    className="produkte-eingaben-panel__disclosure"
                    data-testid={`produkte-instance-disclosure-${instance.instanceId}`}
                  >
                    {uiEntry?.renderInstanceInputs ? (
                      uiEntry.renderInstanceInputs({
                        instance,
                        patchInstance,
                        profile: baseline.profile,
                        activeRules,
                      })
                    ) : (
                      <p className="produkte-eingaben-panel__empty">
                        Für diese Sparform ist hier kein Editor verfügbar.
                        Bitte über „Details ansehen ›" öffnen.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </DProduktSection>

      {/* § 3 — Sparformen quick-add. Combine-mode renders every product as
          an add tile (multiple instances per product are allowed). */}
      <DProduktSection
        legend="§ 3 · Sparformen, die du noch hinzufügen kannst"
        note="Wenn du eine davon hast, erfassen wir sie mit ihren spezifischen Steuer- und Förderregeln."
      >
        <div className="produkte-eingaben-panel__sparform-grid">
          {sparformIds.map((productId) => {
            const meta = getProductMeta(productId)
            const label = meta?.label ?? productId
            return (
              <DSparformOption
                key={productId}
                name={label}
                sub={sparformDescriptions[productId]}
                onClick={() => addInstance(productId)}
              />
            )
          })}
        </div>
        <div className="produkte-eingaben-panel__add-vertrag-wrap">
          <DAddVertragButton
            // In combine-mode the bundle's "+ Vertrag hinzufügen" CTA appears
            // alongside the tile grid as a second affordance. We treat the
            // click as "add the first listed product" — the user can either
            // pick a specific tile above OR fall back to this button to get
            // an instance seeded quickly. This matches the v3 design bundle's
            // intent (L398 of direction-d-pages.jsx: the CTA mounts at the
            // bottom of § 2 in the bundle; we keep it in § 3 so the
            // discoverability stays consistent with the existing tile grid).
            onClick={() => addInstance(sparformIds[0])}
          />
        </div>
      </DProduktSection>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Pure field builders.
// ---------------------------------------------------------------------------

function buildGrvFieldsCompare(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  simulation: SimulationResult,
): readonly ProduktRowField[] {
  const standDate = new Date().toLocaleDateString('de-DE', {
    month: '2-digit',
    year: 'numeric',
  })
  const standDisplay = standDate.replace(/[./]/g, ' / ')

  const currentEp = assumptions.statutoryPension.currentEntgeltpunkte
  const projectedEp = simulation.statutoryPension.projectedEntgeltpunkte
  const grossMonthly = simulation.statutoryPension.grossMonthlyPension
  const rentenwert = activeRules.socialSecurity.aktuellerRentenwert
  const retirementYear =
    activeRules.year + (profile.retirementAge - profile.age)
  const besteuerungsanteil = besteuerungsanteilGrv(retirementYear)

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

/**
 * Combine-mode DRV-card field builder. Mirrors the compare-mode helper but
 * sources values from `baseline.profile` + `baseline.assumptions.statutoryPension`.
 * Projected EP and gross monthly are read from the optional
 * `statutoryPensionResult`; when absent we render an em-dash placeholder so
 * the user can still see the inputs (current EP + Rentenwert + Stand) without
 * an active simulation.
 */
function buildGrvFieldsCombine(
  profile: PersonalProfile,
  assumptions: WorkspaceAssumptionsV2,
  statutoryPensionResult?: SimulationResult['statutoryPension'],
): readonly ProduktRowField[] {
  const standDate = new Date().toLocaleDateString('de-DE', {
    month: '2-digit',
    year: 'numeric',
  })
  const standDisplay = standDate.replace(/[./]/g, ' / ')

  const currentEp = assumptions.statutoryPension.currentEntgeltpunkte
  const rentenwert = activeRules.socialSecurity.aktuellerRentenwert
  const retirementYear =
    activeRules.year + (profile.retirementAge - profile.age)
  const besteuerungsanteil = besteuerungsanteilGrv(retirementYear)
  const projectedEp = statutoryPensionResult?.projectedEntgeltpunkte
  const grossMonthly = statutoryPensionResult?.grossMonthlyPension

  return [
    { key: 'Stand', value: standDisplay },
    {
      key: 'Bisherige Entgeltpunkte',
      value: `${formatNumber(currentEp, 2)} EP`,
    },
    {
      key: `Voraussichtlich mit ${profile.retirementAge}`,
      value:
        projectedEp !== undefined ? `${formatNumber(projectedEp, 2)} EP` : '—',
    },
    {
      key: 'Heutiger Rentenwert (West)',
      value: formatCurrency(rentenwert, 2),
    },
    {
      key: 'Brutto-Rente, geschätzt',
      value:
        grossMonthly !== undefined
          ? `${formatCurrency(grossMonthly, 0)}/Mon.`
          : '—',
    },
    {
      key: 'Steuerlich erfasst ab',
      value: `${retirementYear} (${formatPercent(besteuerungsanteil, 0)})`,
    },
  ]
}

function buildContractFieldsCompare(
  productId: ProductId,
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  simulation: SimulationResult,
  selectedResults: readonly ProductResult[],
): readonly ProduktRowField[] {
  const result = selectedResults.find((r) => r.productId === productId)
  const riy = result?.accumulationRiy
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
      return [
        { key: 'Eintrag', value: 'Konfiguration siehe Bearbeiten' },
      ]
  }
}

/**
 * Combine-mode per-instance field builder. Sources values from the actual
 * workspace instance (per-contract user inputs), not from a singleton
 * projection. Schema fields come straight from `BavInstance` / `EtfInstance`
 * / `InsuranceInstance` / etc.
 */
function buildInstanceFieldsCombine(
  productId: MultiInstanceProductId,
  instance: WorkspaceInstance,
): readonly ProduktRowField[] {
  switch (productId) {
    case 'etf': {
      const etf = instance as EtfInstance
      return [
        {
          key: 'Sparrate',
          value: `${formatCurrency(etf.monthlyContribution ?? 0, 0)}/Mon.`,
        },
        { key: 'Vertragsbeginn', value: String(etf.contractStartYear) },
        { key: 'TER', value: `${formatPercent(etf.annualAssetFee, 2)} p.a.` },
        {
          key: 'Teilfreistellung',
          value: `${formatPercent(etf.equityPartialExemption, 0)}`,
        },
        {
          key: 'Beitragsdynamik',
          value:
            (etf.annualContributionGrowthRate ?? 0) > 0
              ? `${formatPercent(etf.annualContributionGrowthRate ?? 0, 1)} p.a.`
              : 'keine',
        },
        { key: 'Anbieter', value: etf.anbieter ?? '—' },
      ]
    }
    case 'bav': {
      const bav = instance as BavInstance
      return [
        {
          key: 'Brutto-Umwandlung',
          value: `${formatCurrency(bav.monthlyGrossConversion, 0)}/Mon.`,
        },
        {
          key: 'Durchführungsweg',
          value: durchfuehrungswegLabel(bav.durchfuehrungsweg),
        },
        { key: 'Vertragsbeginn', value: String(bav.contractStartYear) },
        {
          key: 'Rentenfaktor',
          value:
            bav.rentenfaktor > 0
              ? `${formatCurrency(bav.rentenfaktor, 2)}/10 T €`
              : '—',
        },
        {
          key: 'Auszahlung',
          value: payoutModeLabel(bav.payoutMode),
        },
        { key: 'Anbieter', value: bav.anbieter ?? '—' },
      ]
    }
    case 'versicherung': {
      const ins = instance as InsuranceInstance
      return [
        {
          key: 'Beitrag',
          value: `${formatCurrency(ins.monthlyContribution ?? 0, 0)}/Mon.`,
        },
        { key: 'Vertragsbeginn', value: String(ins.contractStartYear) },
        {
          key: 'Rentenfaktor',
          value:
            ins.rentenfaktor > 0
              ? `${formatCurrency(ins.rentenfaktor, 2)}/10 T €`
              : '—',
        },
        { key: 'Auszahlung', value: payoutModeLabel(ins.payoutMode) },
        { key: 'Steuerlich', value: 'Schicht 3' },
        { key: 'Anbieter', value: ins.anbieter ?? '—' },
      ]
    }
    case 'basisrente': {
      const bs = instance as BasisrenteInstance
      return [
        {
          key: 'Beitrag',
          value: `${formatCurrency(bs.monthlyGrossContribution, 0)}/Mon.`,
        },
        { key: 'Vertragsbeginn', value: String(bs.contractStartYear) },
        {
          key: 'Rentenfaktor',
          value:
            bs.rentenfaktor > 0
              ? `${formatCurrency(bs.rentenfaktor, 2)}/10 T €`
              : '—',
        },
        { key: 'Steuerlich', value: 'Schicht 1 (§ 10 Abs. 3 EStG)' },
        { key: 'Auszahlung', value: 'Leibrente (pflicht)' },
        { key: 'Anbieter', value: bs.anbieter ?? '—' },
      ]
    }
    case 'altersvorsorgedepot': {
      const avd = instance as AltersvorsorgedepotInstance
      return [
        {
          key: 'Eigenbeitrag',
          value: `${formatCurrency(avd.monthlyOwnContribution, 0)}/Mon.`,
        },
        { key: 'Typ', value: subtypeLabel(avd.subtype) },
        { key: 'Vertragsbeginn', value: String(avd.contractStartYear) },
        { key: 'Steuerlich', value: 'Schicht 2 (§ 22 Nr. 5 EStG)' },
        {
          key: 'Auszahlung',
          value: avdPayoutModeLabel(avd.payoutMode),
        },
        { key: 'Anbieter', value: avd.anbieter ?? '—' },
      ]
    }
    case 'riester': {
      const ri = instance as RiesterInstance
      return [
        {
          key: 'Eigenbeitrag',
          value: `${formatCurrency(ri.monthlyOwnContribution, 0)}/Mon.`,
        },
        { key: 'Vertragsbeginn', value: String(ri.contractStartYear) },
        {
          key: 'Beitragsgarantie',
          value: ri.capitalGuarantee.enabled
            ? `${formatPercent(ri.capitalGuarantee.floorPctOfContributions, 0)} der Beiträge`
            : 'keine',
        },
        { key: 'Steuerlich', value: 'Schicht 2 (§ 22 Nr. 5 EStG)' },
        { key: 'Auszahlung', value: payoutModeLabel(ri.payoutMode) },
        { key: 'Anbieter', value: ri.anbieter ?? '—' },
      ]
    }
    default:
      return [{ key: 'Eintrag', value: 'Konfiguration siehe Bearbeiten' }]
  }
}

// ---------------------------------------------------------------------------
// Combine-mode helpers
// ---------------------------------------------------------------------------

/**
 * Read the per-product instance array for a `MultiInstanceProductId`. The
 * mapping mirrors the engine convention `versicherung → insurance`; all
 * other product ids map 1:1 to the assumption-key.
 */
function getInstanceArrayForProduct(
  assumptions: WorkspaceAssumptionsV2,
  productId: MultiInstanceProductId,
):
  | readonly BavInstance[]
  | readonly EtfInstance[]
  | readonly InsuranceInstance[]
  | readonly BasisrenteInstance[]
  | readonly AltersvorsorgedepotInstance[]
  | readonly RiesterInstance[] {
  switch (productId) {
    case 'bav':
      return assumptions.bav
    case 'etf':
      return assumptions.etf
    case 'versicherung':
      return assumptions.insurance
    case 'basisrente':
      return assumptions.basisrente
    case 'altersvorsorgedepot':
      return assumptions.altersvorsorgedepot
    case 'riester':
      return assumptions.riester
  }
}

/**
 * German label for an instance `status`. Mirrors the bundle's combine-mode
 * convention. Surrendered / offered are terminal states that the menu and
 * Bearbeiten flows cannot recover; we still render a label so the user can
 * see the row's lifecycle position at a glance.
 */
function statusLabel(status: 'active' | 'paid_up' | 'surrendered' | 'offered'): string {
  switch (status) {
    case 'active':
      return 'aktiv'
    case 'paid_up':
      return 'beitragsfrei'
    case 'surrendered':
      return 'gekündigt'
    case 'offered':
      return 'Angebot'
  }
}

/**
 * Map the combine-mode workspace `WorkspaceAssumptionsV2` onto the singleton
 * `ScenarioAssumptions` shape that `<GRVInputs>` expects, so we can reuse the
 * same input component in both modes. Only the `statutoryPension` slot is
 * read by GRVInputs; the other slots come from `INVENTORY_PRODUCT_REGISTRY`
 * defaults (the panel never relies on them in this code path).
 */
function toSingletonAssumptionsForGrvOverride(
  assumptions: WorkspaceAssumptionsV2,
): ScenarioAssumptions {
  // We construct a stub `ScenarioAssumptions` populated from the workspace
  // assumptions for every field that `GRVInputs` may touch. The shape is the
  // same as `singletonViewOfWorkspace` would produce; we inline the minimum
  // here so the panel does not have to import the engine projection helper.
  // This keeps the combine-mode body React/feature-layer only.
  const defaultEntry = INVENTORY_PRODUCT_REGISTRY.bav.createDefault(
    new Date().getFullYear(),
    1,
    (id) => `${id}-grv-stub`,
  )
  const insuranceEntry = INVENTORY_PRODUCT_REGISTRY.versicherung.createDefault(
    new Date().getFullYear(),
    1,
    (id) => `${id}-grv-stub`,
  )
  const basisrenteEntry = INVENTORY_PRODUCT_REGISTRY.basisrente.createDefault(
    new Date().getFullYear(),
    1,
    (id) => `${id}-grv-stub`,
  )
  const avdEntry = INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.createDefault(
    new Date().getFullYear(),
    1,
    (id) => `${id}-grv-stub`,
  )
  const riesterEntry = INVENTORY_PRODUCT_REGISTRY.riester.createDefault(
    new Date().getFullYear(),
    1,
    (id) => `${id}-grv-stub`,
  )
  const etfEntry = INVENTORY_PRODUCT_REGISTRY.etf.createDefault(
    new Date().getFullYear(),
    1,
    (id) => `${id}-grv-stub`,
  )
  const stub: ScenarioAssumptions = {
    bav: assumptions.bav[0] ?? defaultEntry,
    etf: assumptions.etf[0] ?? etfEntry,
    insurance: assumptions.insurance[0] ?? insuranceEntry,
    basisrente: assumptions.basisrente[0] ?? basisrenteEntry,
    altersvorsorgedepot: assumptions.altersvorsorgedepot[0] ?? avdEntry,
    riester: assumptions.riester[0] ?? riesterEntry,
    statutoryPension: assumptions.statutoryPension,
    inflationRate: assumptions.inflationRate,
    retirementEndAge: assumptions.retirementEndAge,
    returnScenarios: assumptions.returnScenarios,
    monteCarlo: assumptions.monteCarlo,
    visibleProducts: assumptions.visibleProducts,
    compareSubMode: assumptions.compareSubMode,
    equalInputAmountEUR: assumptions.equalInputAmountEUR,
  }
  return stub
}

// ---------------------------------------------------------------------------
// Per-product label helpers. Shared between compare-mode and combine-mode.
// None of these encode statutory values — they map enums to German display
// strings only.
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
// Per-product inputs disclosure. Compare-mode reuses the existing
// `PRODUCT_UI_REGISTRY.renderInputs` from `inputs/productUiRegistry.tsx` so
// the panel does not duplicate any form logic.
// ---------------------------------------------------------------------------

function renderProductInputs(
  productId: ProductId,
  ctx: ProductInputsContext,
): React.ReactNode {
  const entry = PRODUCT_UI_REGISTRY[productId]
  if (!entry) return null
  return entry.renderInputs(ctx)
}
