import { useEffect, useMemo, type ReactNode } from 'react'
import './MeinPlanPage.css'
import type { GermanRules } from '../../domain'
import type { Workspace } from '../../domain/workspace'
import type { ProductId } from '../../domain'
import type { ProductResult } from '../../domain/results'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { InstanceCommon } from '../../domain/instances'
import type { Route } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { getProductMeta } from '../../app/productPresentation'
import { useAngabenState } from '../../app/useAngabenState'
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
// right-rail "Deine Angaben" receipt that mirrors the `/eingaben` page state
// via `useAngabenState`.
//
// State scope: this page reads the combine-mode workspace + simulation
// results from props (driven by Calculator.tsx). The right-rail receipt
// reads independently via `useAngabenState` so it stays mode-aware in case
// the user lands here in compare-mode (defensive — the page is mounted from
// the combine-mode render path so in practice the hook reports `combine`).
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

  // § 2 Sensitivität rows. Each selector is a pure perturbation over
  // `runCombineSimulation`; calling them inside `useMemo` keys them off
  // workspace + scenario id so changes in the right rail (Wunschnetto, etc.)
  // trigger a single re-run pass rather than four. Cost is O(rows × N) where
  // N is the active instance count — bounded by the ≤5-rows budget pinned in
  // `sensitivitySelectors.ts`.
  const sensitivityRows = useMemo<SensitivityRow[]>(() => {
    if (!combinedForScenario) return []
    return buildSensitivityRows({
      workspace,
      baselineCombined: combinedForScenario,
      rules,
      scenarioId: selectedScenarioId,
    })
  }, [workspace, combinedForScenario, rules, selectedScenarioId])

  const hasInstances = rows.some((r) => r.kind === 'instance')

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

              {hasInstances ? (
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

          {/* Right-rail receipt — phone folds via RightRailAccordion. */}
          <MeinPlanReceiptAside navigate={navigate} />
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

/**
 * Receipt aside that mirrors the inputs the user has set on `/eingaben` (PR 5).
 * Reads through `useAngabenState` so the values reflect whatever mode is
 * active (compare singleton or combine workspace). In practice this page only
 * mounts in combine-mode, but the hook covers both paths and lets us drop the
 * aside into a hypothetical compare-mode Mein-Plan view without rewiring.
 *
 * The "Angaben bearbeiten" link routes to `/eingaben` via the SPA navigator
 * when one is provided. Modified-click (Cmd/Ctrl/middle/Shift) preserves the
 * platform default — `shouldUseSpaNavigation` guards every SPA-intercept
 * anchor consistently with the rest of the chrome.
 */
function MeinPlanReceiptAside({ navigate }: { navigate?: (target: Route) => void }) {
  const { profile, assumptions } = useAngabenState()
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

  type SlotInstance = { instanceId: string; label?: string; status: InstanceCommon['status']; monthlyContribution?: number; monthlyGrossConversion?: number; monthlyGrossContribution?: number; eigenbeitragMonthly?: number }
  const productSlots: Array<{ id: ProductId; instances: SlotInstance[] }> = [
    { id: 'bav', instances: wsa.bav as unknown as SlotInstance[] },
    { id: 'etf', instances: wsa.etf as unknown as SlotInstance[] },
    { id: 'versicherung', instances: wsa.insurance as unknown as SlotInstance[] },
    { id: 'basisrente', instances: wsa.basisrente as unknown as SlotInstance[] },
    { id: 'altersvorsorgedepot', instances: wsa.altersvorsorgedepot as unknown as SlotInstance[] },
    { id: 'riester', instances: wsa.riester as unknown as SlotInstance[] },
  ]

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
      //   - AVD / Riester: eigenbeitragMonthly (user's own contribution; the
      //     statutory subsidy is paid separately).
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
        contributionMonthly = inst.eigenbeitragMonthly ?? null
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

function pensionBaselineLabel(baselineType: string | undefined): string {
  if (baselineType === 'versorgungswerk') return 'Versorgungswerk'
  if (baselineType === 'beamten') return 'Beamten­versorgung'
  if (baselineType === 'manual') return 'Manuelle Rente'
  return 'Gesetzliche Rente'
}

function sumRowsMonthly(rows: ZusammenRow[]): number {
  return rows.reduce((sum, r) => sum + r.monthlyNet, 0)
}

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

function formatDelta(deltaEUR: number): string {
  if (Math.abs(deltaEUR) < 1) return '±0 €/Mon.'
  const sign = deltaEUR > 0 ? '+' : '−'
  return `${sign}${formatCurrency(Math.abs(deltaEUR), 0)} / Mon.`
}

function formatNote(note: SensitivityRowResult['note']): string | null {
  if (!note) return null
  if (note === 'no_etf_instance') return 'Noch kein ETF-Sparplan im Plan — kein Vergleich möglich.'
  if (note === 'retirement_age_clamped') {
    return 'Renteneintritt auf das Modell-Endalter − 1 begrenzt.'
  }
  // 'unchanged' has no extra copy; the row renders ±0 €/Mon. and that is
  // self-explanatory next to the condition.
  return null
}
