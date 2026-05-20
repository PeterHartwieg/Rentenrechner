import { useEffect, useMemo, type ReactNode } from 'react'
import './MeinPlanPage.css'
import type { GermanRules } from '../../domain'
import type { PersonalProfile } from '../../domain'
import type { Workspace, WorkspaceAssumptionsV2 } from '../../domain/workspace'
import type { ProductId } from '../../domain'
import type { ProductResult } from '../../domain/results'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { InstanceCommon } from '../../domain/instances'
import type { PensionBaselineType } from '../../domain/products/grv'
import type { Route } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { getProductMeta } from '../../app/productPresentation'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { useViewport } from '../../ui/chrome/useViewport'
import { RightRailAccordion } from '../../ui/chrome/RightRailAccordion'
import { formatCurrency, formatPercent } from '../../utils/format'
import {
  sensitivityIfReturnScenario,
  sensitivityIfRetirementAge,
  sensitivityIfInflation,
  sensitivityIfEtfBump,
  type SensitivityRowResult,
} from './sensitivitySelectors'
import {
  SENSITIVITY_RETURN_KONSERVATIV_ID,
  SENSITIVITY_RETIREMENT_AGE_DELAY,
  SENSITIVITY_INFLATION_RATE,
  SENSITIVITY_ETF_CONTRIBUTION_BUMP_EUR,
} from './sensitivityConfig'

// ---------------------------------------------------------------------------
// Section table — § 1 / § 2 anchors. Stable ids drive the URL fragment.
// Keeping them year-free so `/#mein-plan-sensitivitaet` continues to work
// when `RULES_YEAR` rolls forward (mirrors AngabenPage / MethodePage).
// ---------------------------------------------------------------------------

const SECTION_ZUSAMMEN: { id: string; n: string; title: string } = {
  id: 'mein-plan-zusammensetzung',
  n: '§ 1',
  title: 'Zusammensetzung',
}

const SECTION_SENSITIVITAET: { id: string; n: string; title: string } = {
  id: 'mein-plan-sensitivitaet',
  n: '§ 2',
  title: 'Was sich ändern würde, wenn …',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MeinPlanPageProps {
  workspace: Workspace
  perInstance: Record<string, ProductResult[]>
  selectedScenarioId: string
  selectedScenarioLabel: string
  combinedForScenario: CombinedResult | undefined
  rules: GermanRules
  /** SPA navigator, used by the receipt edit link → `/eingaben`. */
  navigate?: (target: Route) => void
}

// ---------------------------------------------------------------------------
// MeinPlanPage — combine-mode results surface (PR 6).
//
// Sober D visual treatment: white background, IBM Plex Sans body, JetBrains
// Mono headline figure (oxblood `#8A2E2E`), dark rules. The layout collapses
// the old `MeinPlanSidebar` + multi-pane switcher into one linear scrollable
// page (lead → headline → § 1 Zusammensetzung → § 2 Sensitivität) with a
// right-rail "Deine Angaben" receipt that reflects the live workspace.
//
// State scope: this page reads the combine-mode workspace + simulation
// results from props (driven by Calculator.tsx). The right-rail receipt
// is a pure presentation component receiving profile + assumptions through
// props from this component — it does not probe storage or re-detect mode.
// This avoids a race where `detectSavedMode()` (localStorage) could lag
// behind the async `usePortfolioState` write on a compare→combine transition.
//
// Engine boundary: every figure on the page either comes from props
// (already engine-derived) or from one of the four sensitivity selectors,
// which compose `runCombineSimulation` over a perturbed workspace. No new
// engine output is required.
//
// JSON-LD: emitted into the document head by the SSG `renderRouteHeadHtml`
// pipeline (the `/` WebPage block). We do NOT emit a second copy inline.
// ---------------------------------------------------------------------------

export function MeinPlanPage({
  workspace,
  perInstance,
  selectedScenarioId,
  selectedScenarioLabel,
  combinedForScenario,
  rules,
  navigate,
}: MeinPlanPageProps) {
  // Profile and assumptions are read from the live workspace prop. This avoids
  // a race condition where `useAngabenState` (which calls `detectSavedMode` via
  // localStorage) could pin the receipt to compare-mode data when the user
  // transitions compare→combine in the same session before storage reflects the
  // new mode (the `usePortfolioState` mode flag persists asynchronously via
  // useEffect). The receipt is a pure presentation component; it receives live
  // values from its parent, never re-probes storage.
  const profile = workspace.baseline.profile
  const wsa = workspace.baseline.assumptions

  // Direct-fragment scroll retry — mirrors AngabenPage. Triggers exactly
  // once on mount so a deep link like `/#mein-plan-sensitivitaet` ends up at
  // the right section even though the browser fires its initial scroll
  // before React has the ids in the DOM.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash.length > 1) {
      const target = document.getElementById(window.location.hash.slice(1))
      if (target) target.scrollIntoView()
    }
  }, [])

  // Rows for § 1 Zusammensetzung. Pure derivation off the workspace + the
  // back-allocated combined-share map; one entry per active or paid-up
  // instance plus a leading entry for the statutory pension (GRV / VW /
  // Beamten net contribution).
  const rows = useMemo(
    () => collectZusammenRows(workspace, perInstance, selectedScenarioId, combinedForScenario),
    [workspace, perInstance, selectedScenarioId, combinedForScenario],
  )

  // Aggregate projected monthly net retirement income for the selected
  // scenario. When `combinedForScenario` is missing we fall back to the row
  // sum; this should not happen in production but the null-guard keeps the
  // headline figure from rendering as `NaN` in degraded test environments.
  const projectedMonthly = combinedForScenario?.monthlyNetIncome ?? sumRowsMonthly(rows)

  // Real-purchasing-power conversion. We deflate the projected monthly net by
  // the workspace's `inflationRate` over the years remaining until retirement.
  // Years use `retirementAge − age`, clamped to >= 0 so a user already past
  // retirement age sees the nominal figure (no compounding regression).
  const yearsUntilRetirement = Math.max(0, profile.retirementAge - profile.age)
  const inflationRate = Math.max(0, wsa.inflationRate)
  const realMultiplier = (1 + inflationRate) ** -yearsUntilRetirement
  const realMonthly = projectedMonthly * realMultiplier

  // `hasContractRows`: true when the workspace contains at least one active or
  // paid-up contract instance. Gates § 2 Sensitivität only — perturbations are
  // meaningless and expensive (each selector re-runs the full combine simulation)
  // when no contract instances exist.
  //
  // `hasZusammenRows`: true when there is at least one row to show in § 1.
  // `collectZusammenRows` always emits a leading statutory-pension row regardless
  // of whether any contract instances exist, so `rows.length > 0` is the correct
  // test for § 1 visibility — NOT `hasContractRows`. A workspace with zero
  // contracts but a statutory-pension entitlement (GRV, Versorgungswerk, Beamten)
  // still has a valid § 1 table to show. Using `hasContractRows` for § 1 would
  // hide the GRV row and drop a valid result surface.
  const hasContractRows = rows.some((r) => r.kind === 'instance')
  const hasZusammenRows = rows.length > 0

  // § 2 Sensitivität rows. Each selector is a pure perturbation over
  // `runCombineSimulation`; calling them inside `useMemo` keys them off
  // workspace + scenario id so changes in the right rail (Wunschnetto, etc.)
  // trigger a single re-run pass rather than four. Cost is O(rows × N) where
  // N is the active instance count — bounded by the ≤5-rows budget pinned in
  // `sensitivitySelectors.ts`.
  //
  // Gated on `hasContractRows`: when the workspace has no active or paid-up
  // contracts, sensitivity perturbations are meaningless and expensive
  // (each selector re-runs the full combine simulation). The empty-state
  // copy in § 2 handles the zero-instance case.
  const sensitivityRows = useMemo<SensitivityRow[]>(() => {
    if (!combinedForScenario || !hasContractRows) return []
    return buildSensitivityRows({
      workspace,
      baselineCombined: combinedForScenario,
      rules,
      scenarioId: selectedScenarioId,
    })
  }, [workspace, combinedForScenario, hasContractRows, rules, selectedScenarioId])

  return (
    <div className="mein-plan-shell">
      <div className="mein-plan-main">
        <div className="mein-plan-grid">
          {/* Center column: lead + headline + § 1 + § 2 */}
          <article className="mein-plan-body">
            <div className="mein-plan-kicker">Persönliche Auskunft · ohne Gewähr</div>

            <p className="mein-plan-lead">
              Auf Basis deiner Angaben sind mit einem Renteneintritt mit{' '}
              <strong>{profile.retirementAge} Jahren</strong> aus allen aktiven
              Quellen voraussichtlich folgende Beträge zu erwarten. Alle Zahlen
              sind <em>nach Steuer und Krankenversicherung</em> und basieren auf
              dem Szenario <strong>{selectedScenarioLabel}</strong>.
            </p>

            {/* Headline figure — oxblood mono, single value. */}
            <div className="mein-plan-headline">
              <div className="mein-plan-headline-figure">
                <span className="mein-plan-headline-label">Voraussichtlich, pro Monat</span>
                <span className="mein-plan-headline-value">{formatCurrency(projectedMonthly, 0)}</span>
              </div>
              <div className="mein-plan-headline-aside">
                {yearsUntilRetirement > 0 && inflationRate > 0 ? (
                  <>
                    In <strong>heutiger Kaufkraft</strong> entspricht das ungefähr{' '}
                    <strong>{formatCurrency(realMonthly, 0)}</strong>
                    {' '}(bei {formatPercent(inflationRate, 1)} Inflation über{' '}
                    {yearsUntilRetirement} Jahren).
                  </>
                ) : (
                  <>
                    Nominale Auszahlung in heutiger Kaufkraft — keine
                    Inflations&shy;anpassung in den Annahmen.
                  </>
                )}
              </div>
            </div>

            {/* § 1 Zusammensetzung */}
            <section className="mein-plan-section" aria-labelledby={SECTION_ZUSAMMEN.id}>
              <div className="mein-plan-section-head">
                <span className="mein-plan-section-num">{SECTION_ZUSAMMEN.n}</span>
                <h2 id={SECTION_ZUSAMMEN.id} className="mein-plan-section-title">
                  {SECTION_ZUSAMMEN.title}
                </h2>
              </div>

              {hasZusammenRows ? (
                <>
                  <table className="mein-plan-zusammen-table">
                    <thead>
                      <tr>
                        <th>Quelle</th>
                        <th>Beitrag heute</th>
                        <th className="mein-plan-num">Rente mit {profile.retirementAge}</th>
                        <th className="mein-plan-num">Anteil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <ZusammenRowView
                          key={row.key}
                          row={row}
                          projectedMonthly={projectedMonthly}
                        />
                      ))}
                    </tbody>
                  </table>

                  {/* Composition bar — proportional segments per row. */}
                  <div className="mein-plan-comp-bar" aria-hidden="true">
                    {rows.map((row) => {
                      const share = projectedMonthly > 0 ? row.monthlyNet / projectedMonthly : 0
                      if (share <= 0) return null
                      return (
                        <div
                          key={row.key}
                          className="mein-plan-comp-bar-seg"
                          style={{ flex: share, background: row.color }}
                        />
                      )
                    })}
                  </div>
                  <div className="mein-plan-comp-bar-legend" aria-label="Legende der Zusammensetzung">
                    {rows
                      .filter((r) => r.monthlyNet > 0)
                      .map((row) => (
                        <span key={row.key} className="mein-plan-comp-bar-legend-item">
                          <span
                            className="mein-plan-comp-bar-legend-chip"
                            style={{ background: row.color }}
                          />
                          {row.label}
                        </span>
                      ))}
                  </div>
                </>
              ) : (
                <p className="mein-plan-zusammen-empty">
                  Noch keine aktiven Verträge im Plan — füge im Tab{' '}
                  <strong>„Meine Verträge“</strong> einen Vertrag hinzu oder
                  übernimm einen Empfehlungs-Plan.
                </p>
              )}
            </section>

            {/* § 2 Sensitivität */}
            <section className="mein-plan-section" aria-labelledby={SECTION_SENSITIVITAET.id}>
              <div className="mein-plan-section-head">
                <span className="mein-plan-section-num">{SECTION_SENSITIVITAET.n}</span>
                <h2 id={SECTION_SENSITIVITAET.id} className="mein-plan-section-title">
                  {SECTION_SENSITIVITAET.title}
                </h2>
              </div>

              <p className="mein-plan-sens-intro">
                Wie reagiert deine voraussichtliche Netto-Rente, wenn sich eine
                einzelne Annahme verschiebt? Jede Zeile zeigt die Differenz zum
                aktuellen Szenario — gerundet auf volle Euro.
              </p>

              {sensitivityRows.length > 0 ? (
                <ul className="mein-plan-sens-list">
                  {sensitivityRows.map((row) => (
                    <SensitivityRowView key={row.id} row={row} />
                  ))}
                </ul>
              ) : (
                <p className="mein-plan-zusammen-empty">
                  Sensitivitäts­zeilen werden nach dem ersten Vertrag im Plan
                  berechnet.
                </p>
              )}
            </section>
          </article>

          {/* Right-rail receipt — phone folds via RightRailAccordion.
              Profile and assumptions are threaded from the live workspace prop
              so the receipt never re-detects mode from storage. */}
          <MeinPlanReceiptAside
            profile={profile}
            assumptions={wsa}
            navigate={navigate}
          />
        </div>

        <p className="mein-plan-stand">
          Szenario: {selectedScenarioLabel} · Werte in Deutschland {rules.year}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Right-rail "Deine Angaben" receipt
// ---------------------------------------------------------------------------

interface MeinPlanReceiptAsideProps {
  /**
   * Live profile from `workspace.baseline.profile`, threaded through from
   * `MeinPlanPage`. Never read from storage directly so the receipt does not
   * race against the async `usePortfolioState` mode-flag write that persists
   * the compare→combine transition.
   */
  profile: PersonalProfile
  /**
   * Live workspace assumptions from `workspace.baseline.assumptions`, threaded
   * through from `MeinPlanPage`. Only scalar workspace-level fields are
   * consumed (inflationRate, returnScenarios, retirementEndAge); per-instance
   * arrays are not accessed.
   */
  assumptions: WorkspaceAssumptionsV2
  /** SPA navigator for the "Angaben bearbeiten" link. */
  navigate?: (target: Route) => void
}

/**
 * Receipt aside that mirrors the inputs the user has set on `/eingaben` (PR 5).
 * Receives `profile` and `assumptions` directly from `MeinPlanPage` props
 * (derived from the live workspace) so the values always reflect the current
 * combine-mode workspace state. This avoids a race condition present in the
 * former `useAngabenState()` approach: that hook called `detectSavedMode()`
 * at mount-time (reading localStorage), which could pin the receipt to
 * compare-mode data when the user transitioned compare→combine in the same
 * session before `usePortfolioState`'s async storage write had landed.
 *
 * The receipt is now a pure presentation component — no hooks that probe
 * storage, no mode detection, no side effects beyond `useViewport`.
 *
 * The "Angaben bearbeiten" link routes to `/eingaben` via the SPA navigator
 * when one is provided. Modified-click (Cmd/Ctrl/middle/Shift) preserves the
 * platform default — `shouldUseSpaNavigation` guards every SPA-intercept
 * anchor consistently with the rest of the chrome.
 */
function MeinPlanReceiptAside({ profile, assumptions, navigate }: MeinPlanReceiptAsideProps) {
  const viewport = useViewport()

  // Resolve scenario annualReturn by id, never by index (CLAUDE.md gotcha).
  const basisScenario = assumptions.returnScenarios.find((s) => s.id === 'basis')
  const basisReturn = basisScenario?.annualReturn

  const rows: ReceiptRow[] = []
  rows.push({ key: 'alter', label: 'Alter', value: `${profile.age} Jahre` })
  rows.push({ key: 'renteneintritt', label: 'Renteneintritt', value: `${profile.retirementAge} Jahre` })
  rows.push({
    key: 'brutto',
    label: 'Brutto pro Jahr',
    value: formatCurrency(profile.grossSalaryYear, 0),
  })
  rows.push({
    key: 'gkv',
    label: 'Krankenversicherung',
    value: profile.publicHealthInsurance ? 'GKV' : 'PKV',
  })
  rows.push({ key: 'kinder', label: 'Kinder', value: String(profile.childBirthYears.length) })
  // Compute populated-row count BEFORE adding visual divider entries so the
  // accordion phone-strip badge ("(N Werte)") reflects real values, not the
  // ornamental gaps between groups.
  rows.push({ key: 'divider-1', label: '', value: '', divider: true })
  rows.push({
    key: 'inflation',
    label: 'Inflation',
    value: `${formatPercent(assumptions.inflationRate, 1)} p. a.`,
  })
  if (basisReturn !== undefined) {
    rows.push({
      key: 'rendite-basis',
      label: 'Rendite (Basis)',
      value: `${formatPercent(basisReturn, 1)} p. a.`,
    })
  }
  rows.push({
    key: 'lebensende',
    label: 'Modell-Endalter',
    value: `${assumptions.retirementEndAge} Jahre`,
  })
  if (profile.desiredNetMonthlyPension && profile.desiredNetMonthlyPension > 0) {
    rows.push({
      key: 'wunschnetto',
      label: 'Wunsch-Netto',
      value: `${formatCurrency(profile.desiredNetMonthlyPension, 0)} / Mon.`,
    })
  }

  const populatedCount = rows.filter((r) => !r.divider).length

  const editLink = (
    <a
      className="mein-plan-receipt-edit"
      href="/eingaben"
      onClick={(event) => {
        if (!navigate) return
        if (!shouldUseSpaNavigation(event)) return
        event.preventDefault()
        navigate('/eingaben')
      }}
    >
      Angaben bearbeiten
    </a>
  )

  // The receipt body is the same on all three viewports. The wrapping
  // RightRailAccordion handles desktop (fixed aside) ↔ phone (bottom strip
  // + drawer) presentation. We render the body inside the accordion so
  // there is exactly one source of "Deine Angaben" markup on the page.
  void viewport // referenced for future per-viewport tweaks; React tree is independent

  return (
    <RightRailAccordion label="Deine Angaben" count={populatedCount} desktopWidth={320}>
      <div className="mein-plan-receipt" data-testid="mein-plan-receipt">
        {rows.map((row) =>
          row.divider ? (
            <hr key={row.key} className="mein-plan-receipt-row-divider" aria-hidden="true" />
          ) : (
            <div key={row.key} className="mein-plan-receipt-row">
              <span className="mein-plan-receipt-key">{row.label}</span>
              <span className="mein-plan-receipt-val">{row.value}</span>
            </div>
          ),
        )}
        {editLink}
      </div>
    </RightRailAccordion>
  )
}

interface ReceiptRow {
  key: string
  label: string
  value: string
  divider?: boolean
}

// ---------------------------------------------------------------------------
// § 1 Zusammensetzung — row collection
// ---------------------------------------------------------------------------

interface ZusammenRowBase {
  key: string
  label: string
  sublabel: string
  contributionMonthly: number | null
  monthlyNet: number
  color: string
}

interface ZusammenInstanceRow extends ZusammenRowBase {
  kind: 'instance'
  productId: ProductId
  instanceId: string
}

interface ZusammenStatutoryRow extends ZusammenRowBase {
  kind: 'statutory'
}

type ZusammenRow = ZusammenInstanceRow | ZusammenStatutoryRow

const STATUTORY_PENSION_COLOR = '#222222'
const FALLBACK_PRODUCT_COLOR = '#888888'

/**
 * The minimal per-instance shape consumed by `collectZusammenRows`.
 * All six instance types satisfy this shape; the cast from the concrete
 * instance types is safe because every instance type extends `InstanceCommon`
 * and carries the optional contribution fields.
 *
 * Field mapping per product:
 *   - ETF / versicherung: `monthlyContribution` (per-instance combine-mode field)
 *   - bAV: `monthlyGrossConversion` (employer gross; user's net cost is derived)
 *   - Basisrente: `monthlyGrossContribution`
 *   - AltersvorsorgedepotInstance / RiesterInstance: `monthlyOwnContribution`
 *     (field name on `AltersvorsorgedepotAssumptions` and `RiesterAssumptions`;
 *     NOT `eigenbeitragMonthly` — that field does not exist on those types)
 */
type SlotInstance = {
  instanceId: string
  label?: string
  status: InstanceCommon['status']
  monthlyContribution?: number
  monthlyGrossConversion?: number
  monthlyGrossContribution?: number
  monthlyOwnContribution?: number
}

/**
 * Derive the ordered product-slot list from `PRODUCT_REGISTRY`, honouring
 * canonical product order and the known id→workspace-field mismatch:
 *
 *   `versicherung` (ProductId / metadata.id) → `insurance` (assumptionsKey /
 *   WorkspaceAssumptionsV2 field name).
 *
 * Using `entry.assumptionsKey` to index `wsa` avoids hardcoding six product
 * ids, respects `PRODUCT_REGISTRY` order, and automatically picks up future
 * product additions. `Array.isArray` guards against non-array values (e.g.
 * objects from schema drift or partially-populated test stubs); the fallback
 * is `[]` so `collectZusammenRows` never iterates invalid data.
 *
 * Note: `CombineDetailView.tsx` and `simulationSelectors.ts` contain a similar
 * hardcoded slot pattern — migrating those to this helper is a separate task
 * and out of scope for PR #284.
 */
function buildProductSlots(wsa: WorkspaceAssumptionsV2): Array<{ id: ProductId; instances: SlotInstance[] }> {
  return PRODUCT_REGISTRY.map((entry) => ({
    id: entry.metadata.id as ProductId,
    instances: (() => {
      const raw = (wsa as unknown as Record<string, unknown>)[entry.assumptionsKey]
      return Array.isArray(raw) ? (raw as SlotInstance[]) : []
    })(),
  }))
}

/**
 * Build the ordered row array for § 1 Zusammensetzung.
 *
 * Always emits a leading statutory-pension row (may be zero), followed by
 * one row per non-surrendered, non-offered instance in the workspace (in
 * canonical `PRODUCT_REGISTRY` order). Monthly-net figures prefer the
 * back-allocated `combinedForScenario.byInstance` share when available,
 * falling back to the per-instance `netMonthlyPayout` from `perInstance[id]`
 * for the selected scenario.
 *
 * "Beitrag heute" is product-type-specific: ETF/pAV use `monthlyContribution`,
 * bAV uses `monthlyGrossConversion` (the employer subsidy is not the user's
 * "Beitrag heute"), Basisrente uses `monthlyGrossContribution`, AVD/Riester
 * use `eigenbeitragMonthly` (user's own Eigenbeitrag, excluding statutory
 * subsidy). Paid-up instances always show 0 for the contribution column.
 */
function collectZusammenRows(
  workspace: Workspace,
  perInstance: Record<string, ProductResult[]>,
  scenarioId: string,
  combinedForScenario: CombinedResult | undefined,
): ZusammenRow[] {
  const wsa = workspace.baseline.assumptions
  const rows: ZusammenRow[] = []

  // Statutory pension row — always rendered, even when zero, so the user
  // sees the GRV / Versorgungswerk / Beamten baseline as the first
  // composition entry. The label tracks the active statutory routing.
  const statutoryMonthly = combinedForScenario?.statutoryPensionMonthlyNet ?? 0
  const statutoryLabel = pensionBaselineLabel(wsa.statutoryPension.pensionBaselineType)
  rows.push({
    kind: 'statutory',
    key: 'statutory',
    label: statutoryLabel,
    sublabel: 'Gesetzlich · § 22 Nr. 1 EStG',
    contributionMonthly: null,
    monthlyNet: statutoryMonthly,
    color: STATUTORY_PENSION_COLOR,
  })

  const productSlots = buildProductSlots(wsa)

  for (const slot of productSlots) {
    const meta = getProductMeta(slot.id)
    for (const inst of slot.instances) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue
      const share = combinedForScenario?.byInstance[inst.instanceId]
      const result = perInstance[inst.instanceId]?.find((r) => r.scenarioId === scenarioId)
      const monthlyNet = share?.monthlyNet ?? result?.netMonthlyPayout ?? 0
      // Derive the user-facing "Beitrag heute" figure per product type:
      //   - ETF / pAV: per-instance `monthlyContribution` (combine-mode field).
      //   - bAV: gross conversion (employer subsidy excluded — that's not the
      //     user's "Beitrag heute"; see CLAUDE.md "fair-comparison invariant"
      //     note for combine-mode honoring `monthlyGrossConversion`).
      //   - Basisrente: monthlyGrossContribution.
      //   - AVD / Riester: monthlyOwnContribution (the field on
      //     AltersvorsorgedepotAssumptions and RiesterAssumptions; statutory
      //     allowances are paid separately by the state and are NOT part of
      //     "Beitrag heute" from the user's perspective).
      let contributionMonthly: number | null = null
      if (inst.status === 'paid_up') {
        contributionMonthly = 0
      } else if (slot.id === 'etf' || slot.id === 'versicherung') {
        contributionMonthly = inst.monthlyContribution ?? null
      } else if (slot.id === 'bav') {
        contributionMonthly = inst.monthlyGrossConversion ?? null
      } else if (slot.id === 'basisrente') {
        contributionMonthly = inst.monthlyGrossContribution ?? null
      } else if (slot.id === 'altersvorsorgedepot' || slot.id === 'riester') {
        contributionMonthly = inst.monthlyOwnContribution ?? null
      }
      const instanceLabel = inst.label?.trim().length ? inst.label : (meta?.label ?? slot.id)
      const subLabel =
        inst.status === 'paid_up'
          ? `${meta?.label ?? slot.id} · beitragsfrei`
          : (meta?.label ?? slot.id)
      rows.push({
        kind: 'instance',
        key: inst.instanceId,
        productId: slot.id,
        instanceId: inst.instanceId,
        label: instanceLabel,
        sublabel: subLabel,
        contributionMonthly,
        monthlyNet,
        color: meta?.color ?? FALLBACK_PRODUCT_COLOR,
      })
    }
  }
  return rows
}

/**
 * Human-readable label for the statutory pension baseline type shown in the
 * Zusammensetzung leading row. Exhaustively maps every `PensionBaselineType`
 * literal so the TypeScript compiler catches any future enum extension at
 * build time (the `never` default branch triggers a tsc error).
 */
function pensionBaselineLabel(baselineType: PensionBaselineType | undefined): string {
  if (baselineType === undefined) return 'Gesetzliche Rente'
  switch (baselineType) {
    case 'grv':
      return 'Gesetzliche Rente'
    case 'versorgungswerk':
      return 'Versorgungswerk'
    case 'beamtenpension':
      return 'Beamtenpension'
    case 'none':
      return 'Keine Pflichtrente'
    default: {
      const _exhaustive: never = baselineType
      return _exhaustive
    }
  }
}

/**
 * Fallback aggregate when `combinedForScenario` is absent. Sums each row's
 * `monthlyNet` directly — used only in degraded test or SSR environments where
 * the combine result is unavailable; in production `combinedForScenario` is
 * always present so this path does not appear in user-visible calculations.
 */
function sumRowsMonthly(rows: ZusammenRow[]): number {
  return rows.reduce((sum, r) => sum + r.monthlyNet, 0)
}

/**
 * Single row in the § 1 Zusammensetzung table. Renders the source label,
 * user-facing "Beitrag heute" column, the net monthly retirement income, and
 * a rounded percentage share of the headline figure. The `projectedMonthly`
 * denominator is the whole-portfolio figure, not the row's own value, so
 * the share column sums to ~100 % across all rows.
 */
function ZusammenRowView({
  row,
  projectedMonthly,
}: {
  row: ZusammenRow
  projectedMonthly: number
}) {
  const share = projectedMonthly > 0 ? row.monthlyNet / projectedMonthly : 0
  const sharePct = Math.round(share * 100)
  return (
    <tr>
      <td>
        <div className="mein-plan-zusammen-source">{row.label}</div>
        <div className="mein-plan-zusammen-sub">{row.sublabel}</div>
      </td>
      <td className="mein-plan-num-soft" data-label="Beitrag">
        {row.contributionMonthly === null
          ? '–'
          : row.contributionMonthly === 0
            ? 'beitragsfrei'
            : `${formatCurrency(row.contributionMonthly, 0)} / Mon.`}
      </td>
      <td className="mein-plan-num" data-label="Rente">
        {formatCurrency(row.monthlyNet, 0)}
      </td>
      <td className="mein-plan-num-soft" data-label="Anteil">
        {sharePct} %
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// § 2 Sensitivität — row collection
// ---------------------------------------------------------------------------

interface SensitivityRow {
  id: string
  /** What the user sees: "… die Börse über die gesamte Laufzeit nur 3 % p.a. bringt". */
  condition: ReactNode
  /** Result of the perturbation. Caller renders the sign + value. */
  result: SensitivityRowResult
}

interface BuildSensitivityRowsInput {
  workspace: Workspace
  baselineCombined: CombinedResult
  rules: GermanRules
  scenarioId: string
}

/**
 * Build the ordered row list for § 2 Sensitivität. Each row pairs a
 * human-readable German condition clause with the result of one sensitivity
 * selector call (from `sensitivitySelectors.ts`). Rows that do not apply to
 * the current workspace (e.g. ETF bump when no ETF instance exists, or
 * Rendite-konservativ when the selected scenario already IS konservativ) are
 * suppressed. Cost is O(N × rows) on active workspace instances — bounded to
 * ≤4 rows in the default configuration via the per-condition guards.
 */
function buildSensitivityRows({
  workspace,
  baselineCombined,
  rules,
  scenarioId,
}: BuildSensitivityRowsInput): SensitivityRow[] {
  const wsa = workspace.baseline.assumptions
  const out: SensitivityRow[] = []

  // Row 1: Rendite konservativ
  const konservativScenario = wsa.returnScenarios.find(
    (s) => s.id === SENSITIVITY_RETURN_KONSERVATIV_ID,
  )
  if (konservativScenario && scenarioId !== SENSITIVITY_RETURN_KONSERVATIV_ID) {
    out.push({
      id: 'rendite-konservativ',
      condition: (
        <>
          … die Märkte über die gesamte Laufzeit nur{' '}
          <strong>{formatPercent(konservativScenario.annualReturn, 1)}</strong>{' '}
          p. a. erwirtschaften (Szenario „{konservativScenario.label}")
        </>
      ),
      result: sensitivityIfReturnScenario(
        workspace,
        baselineCombined,
        rules,
        scenarioId,
        SENSITIVITY_RETURN_KONSERVATIV_ID,
      ),
    })
  }

  // Row 2: Renteneintritt 70 statt aktuell
  const currentAge = workspace.baseline.profile.retirementAge
  if (currentAge !== SENSITIVITY_RETIREMENT_AGE_DELAY) {
    out.push({
      id: 'renteneintritt-70',
      condition: (
        <>
          … du mit <strong>{SENSITIVITY_RETIREMENT_AGE_DELAY} Jahren</strong>{' '}
          in Rente gehst (statt aktuell {currentAge})
        </>
      ),
      result: sensitivityIfRetirementAge(
        workspace,
        baselineCombined,
        rules,
        scenarioId,
        SENSITIVITY_RETIREMENT_AGE_DELAY,
      ),
    })
  }

  // Row 3: Inflation 3 % statt aktuell
  if (wsa.inflationRate !== SENSITIVITY_INFLATION_RATE) {
    out.push({
      id: 'inflation-3',
      condition: (
        <>
          … die Inflation dauerhaft{' '}
          <strong>{formatPercent(SENSITIVITY_INFLATION_RATE, 1)}</strong>{' '}
          beträgt (statt aktuell {formatPercent(wsa.inflationRate, 1)})
        </>
      ),
      result: sensitivityIfInflation(
        workspace,
        baselineCombined,
        rules,
        scenarioId,
        SENSITIVITY_INFLATION_RATE,
      ),
    })
  }

  // Row 4: ETF-Beitrag +100 €/Monat
  out.push({
    id: 'etf-bump',
    condition: (
      <>
        … du den ersten ETF-Sparplan um{' '}
        <strong>{formatCurrency(SENSITIVITY_ETF_CONTRIBUTION_BUMP_EUR, 0)}/Monat</strong>{' '}
        erhöhst
      </>
    ),
    result: sensitivityIfEtfBump(
      workspace,
      baselineCombined,
      rules,
      scenarioId,
      SENSITIVITY_ETF_CONTRIBUTION_BUMP_EUR,
    ),
  })

  return out
}

/**
 * Single item in the § 2 Sensitivität list. Colors the delta chip by sign:
 * green for positive (more retirement income), red for negative, neutral grey
 * for deltas below 1 €/Mon. (floating-point noise threshold). Renders the
 * optional `note` caption below the condition when the perturbation was
 * constrained (e.g. retirement age clamped to `retirementEndAge − 1`).
 */
function SensitivityRowView({ row }: { row: SensitivityRow }) {
  const delta = row.result.headlineDelta
  const note = row.result.note
  // Delta sign drives the color class. Treat a tiny absolute delta (< 1 €/Mon.)
  // as neutral so floating-point noise on cohort tax rounding does not push
  // a row into red or green for cosmetic reasons.
  const sign: 'pos' | 'neg' | 'neutral' =
    Math.abs(delta) < 1 ? 'neutral' : delta > 0 ? 'pos' : 'neg'
  const formatted = formatDelta(delta)
  const noteText = formatNote(note)
  return (
    <li className="mein-plan-sens-row" data-row-id={row.id}>
      <span className="mein-plan-sens-cond">
        {row.condition}
        {noteText !== null && (
          <span className="mein-plan-sens-cond-note">{noteText}</span>
        )}
      </span>
      <span
        className={`mein-plan-sens-delta mein-plan-sens-delta--${sign}`}
        aria-label={`${formatted} pro Monat`}
      >
        {formatted}
      </span>
    </li>
  )
}

/**
 * Format a EUR/month delta for the sensitivity chip. Treats |delta| < 1 as
 * zero to suppress floating-point noise (cohort tax rounding can produce
 * sub-euro differences that are not user-meaningful). Sign uses a Unicode
 * minus `−` (U+2212) for negative values to match typographic conventions.
 */
function formatDelta(deltaEUR: number): string {
  if (Math.abs(deltaEUR) < 1) return '±0 €/Mon.'
  const sign = deltaEUR > 0 ? '+' : '−'
  return `${sign}${formatCurrency(Math.abs(deltaEUR), 0)} / Mon.`
}

/**
 * Map a `SensitivityNote` to a user-facing German caption, or `null` when no
 * extra copy is needed. `'unchanged'` returns `null` because the `±0 €/Mon.`
 * delta chip is already self-explanatory adjacent to the condition text.
 *
 * Complete switch over all `SensitivityNote` values — no fallthrough.
 */
function formatNote(note: SensitivityRowResult['note']): string | null {
  if (!note) return null
  switch (note) {
    case 'no_etf_instance':
      return 'Noch kein ETF-Sparplan im Plan — kein Vergleich möglich.'
    case 'etf_paid_up_only':
      return 'ETF-Vertrag vorhanden, aber beitragsfrei — Aufstockung würde einen neuen aktiven Vertrag erfordern.'
    case 'retirement_age_clamped':
      return 'Renteneintritt auf das Modell-Endalter − 1 begrenzt.'
    case 'unchanged':
      // 'unchanged' has no extra copy; the ±0 €/Mon. delta chip is
      // self-explanatory adjacent to the condition text.
      return null
  }
}
