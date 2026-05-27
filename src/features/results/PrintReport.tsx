/**
 * PrintReport — Sober D port (PR 4.1, H4).
 *
 * Visual treatment: every per-class colour / font is now driven by the
 * Sober D tokens in src/App.css (`--rw-bg-paper`, `--rw-ink`, `--rw-rule`,
 * `--rw-accent`, IBM Plex / JetBrains Mono). See `./PrintReport.css` for
 * the print-only mapping including `@page` (A4 portrait, page numbers in
 * mono) and `@media print` (page-break behaviour + color-adjust).
 *
 * Structural invariant — P0 compliance:
 *   - The `.pr-disclaimer-top` block MUST remain the LITERAL first child
 *     of `#print-report` in BOTH the compare-mode and the combine-mode
 *     branch. Adding a section means inserting AFTER this block, never
 *     before. Regression-tested in `PrintReport.test.tsx`.
 *
 * The row-builder layer (`./printReportRows.ts`) consumes
 * `src/engine/exportProjection.ts` for cross-product tax-mode dispatch
 * (single source of truth shared with `src/utils/csvExport.ts`). The
 * print side has zero per-product `productId === 'X'` tax branching —
 * dispatch happens once in the projection layer.
 */

import './PrintReport.css'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type {
  PersonalProfile,
  ProductId,
  ProductResult,
  ScenarioAssumptions,
  SimulationResult,
  StatutoryPensionResult,
} from '../../domain'
import type { EvidenceState } from '../../domain/instances'
import type { Workspace } from '../../domain/workspace'
import type { CombinedResult } from '../../engine/portfolioCombine'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format'
import { getProductMeta } from '../../app/productPresentation'
import { PRODUCT_IDS } from '../../engine/productRegistry'
import { resolveEffectiveScenarioId } from '../../app/simulationSelectors'
import { simulateRetirementComparison } from '../../engine/simulate'
import { de2026Rules } from '../../rules/de2026'
import {
  normalizeMonthlyNettoBelastung,
  syncMonthlyContributions,
} from '../../app/syncContributions'
import { DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR } from '../../data/defaultScenario'
import {
  evidenceStateToProvKind,
  formatEvidenceStateForExport,
} from './provenanceHelpers'
import {
  buildPrintWohinRows,
  buildPrintZusammenRows,
  buildPrintVertragBlocks,
  buildPrintWendepunkteRows,
  buildPrintVergleichRows,
  buildPrintProContraRows,
  PRINT_METHODE_BULLETS,
  type PrintWohinRow,
  type PrintZusammenRow,
  type PrintVertragBlock,
  type PrintWendepunkteSection,
  type PrintSensitivityRow,
  type PrintVergleichRow,
  type PrintProContraRow,
} from './printReportRows'
import type { VergleichDetailRow } from '../vergleich-detail/vergleichDetailRows'

interface Props {
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  simulation: SimulationResult
  /**
   * Combine-mode portfolio output (Group G issue 11). When present and
   * `mode === 'combine'`, the report renders the per-instance / combined-
   * income view instead of the singleton compare-mode product table.
   * Compare-mode renders are byte-identical when this prop is omitted.
   */
  portfolio?: {
    perInstance: Record<string, ProductResult[]>
    combinedByScenarioId: Record<string, CombinedResult>
    scenarioLabels: Record<string, string>
  }
  /** When true, render the combine-mode view (requires `portfolio`). */
  combineMode?: boolean
  /**
   * Combine-mode overrides (issue 27).
   *
   * In combine mode the workspace baseline can diverge from the singleton
   * compare state. These props ensure the PDF reflects workspace data, not
   * the singleton defaults. Omitting them falls back to the singleton props
   * so compare-mode callers need no change.
   */
  /** Workspace baseline profile (combine mode). Overrides singleton `profile`. */
  combineProfile?: PersonalProfile
  /** GRV projection from `useCombineSimulation` (combine mode). Overrides `simulation.statutoryPension`. */
  combineGrv?: StatutoryPensionResult
  /** Workspace `returnScenarios` (combine mode). Overrides `assumptions.returnScenarios` for scenario ordering. */
  combineReturnScenarios?: ScenarioAssumptions['returnScenarios']
  /**
   * Workspace reference (combine mode). Used to resolve per-instance user labels
   * for the "Vertrag" column in the print table. Without this, the column falls
   * back to the engine product label (e.g. "ETF-Depot") for every instance of the
   * same product type. When provided the workspace `instance.label` takes precedence
   * and falls back to the product meta label only when the instance label is blank.
   */
  combineWorkspace?: Workspace
  /**
   * Pre-computed sensitivity perturbation rows (combine mode, PR 11 R1 scope
   * restore). The caller computes these via `buildPrintSensitivityRows` so the
   * O(N × ≤4) `runCombineSimulation` cost is paid at the same site as the
   * existing combine simulation (Calculator.tsx), not inside this component.
   *
   * When the prop is omitted or empty, the print § Zusammensetzung section
   * still renders the composition table but skips the sensitivity sub-table.
   */
  combineSensitivityRows?: ReadonlyArray<PrintSensitivityRow>
  /**
   * The scenario the user has selected in the toolbar (compare mode only).
   *
   * When provided, the compare-mode Vergleich table and Wohin-cards mirror
   * this selection instead of defaulting to 'basis', so the printed output
   * matches the `/vergleich` page the user is looking at. The canonical
   * helper `resolveEffectiveScenarioId` guards against unknown ids.
   *
   * Defaults to 'basis' when omitted (backwards-compatible).
   */
  selectedScenarioId?: string
}

const SCENARIO_ORDER = ['konservativ', 'basis', 'optimistisch']

function KvRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <td className="pr-kv-label">{label}</td>
      <td>{children}</td>
    </tr>
  )
}

/**
 * Render a confidence indicator next to a netto-payout cell.
 *
 * Routes the domain `EvidenceState` (or absence of it) through the issue 13
 * shared mapping layer:
 *   - `evidenceStateToProvKind` selects the visual-distinction class.
 *   - `formatEvidenceStateForExport` supplies the German label text.
 *
 * Visual mapping (className → marker):
 *   - `model` (model_estimate)        → `.pr-confidence-estimate`, prefixed 🤔 — visibly equivalent to the prior "🤔 Schätzung" treatment.
 *   - `confirmed` (user_confirmed)    → `.pr-confidence-confirmed`, prefixed ✓ — visibly equivalent to the prior "✓" treatment.
 *   - `confirmed` (statement)         → `.pr-confidence-confirmed`, prefixed 📄 — previously rendered nothing.
 *   - `default` (undefined)           → `.pr-confidence-default`, no prefix    — previously rendered nothing.
 */
function ConfidenceIndicator({ state }: { state: EvidenceState | undefined }) {
  const kind = evidenceStateToProvKind(state)
  const label = formatEvidenceStateForExport(state)
  // statement is mapped to 'confirmed' by evidenceStateToProvKind, but we want
  // a distinct prefix so the document-source case is recognisable in print.
  const prefix =
    state === 'statement'
      ? '📄'
      : kind === 'model'
        ? '🤔'
        : kind === 'confirmed'
          ? '✓'
          : ''
  const className =
    kind === 'model'
      ? 'pr-confidence-estimate'
      : kind === 'confirmed'
        ? 'pr-confidence-confirmed'
        : 'pr-confidence-default'
  return (
    <span className={className} aria-label={label}>
      {' '}
      {prefix ? `${prefix} ` : ''}
      {label}
    </span>
  )
}

export function PrintReport({
  profile,
  assumptions,
  simulation,
  portfolio,
  combineMode,
  combineProfile,
  combineGrv,
  combineReturnScenarios,
  combineWorkspace,
  combineSensitivityRows,
  selectedScenarioId,
}: Props) {
  const date = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  // PR R3: the print compare-mode mirror shows all 6 products always — the
  // same contract `/vergleich` carries (PR #329). The caller may have stripped
  // `visibleProducts` to a subset (e.g. defaultAssumptions.visibleProducts is
  // `['etf', 'bav']`); the print mirrors the *web* page, not the picker. We
  // run a local `simulateRetirementComparison` with the full registry list and
  // sync `bavFunding.monthlyNetCost` so the fair-comparison invariant still
  // holds. Memoised so re-renders driven by parent state changes don't
  // re-trigger the two-pass funding compute on every paint.
  //
  // Hooks must run unconditionally before any early return (Rules of Hooks).
  // In combine-mode the result is ignored (the combine branch consumes the
  // pre-built portfolio results threaded in via props), so the useMemo
  // short-circuits to `null` to avoid the expensive 6-product simulation
  // on every parent re-render. PrintReport mounts continuously alongside the
  // calculator, so an idle compute cost would be paid on every assumptions
  // edit (Codex P2 / CR3 R1 fix).
  const allProductsResult = useMemo(() => {
    if (combineMode && portfolio) return null

    const overridden: ScenarioAssumptions = {
      ...assumptions,
      visibleProducts: [...PRODUCT_IDS] as ProductId[],
    }
    const activeAssumptions = syncMonthlyContributions(
      normalizeMonthlyNettoBelastung(
        overridden.equalInputAmountEUR ?? DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR,
      ),
      overridden,
      profile,
      de2026Rules,
    )
    return simulateRetirementComparison(profile, activeAssumptions, de2026Rules)
  }, [combineMode, portfolio, profile, assumptions])

  // Combine-mode branch (Group G issue 11): when combineMode + portfolio are
  // provided, render per-instance + combined view rather than singleton-compare
  // product table. The combine-mode renderer ignores `allProductsResult`
  // — it consumes the pre-built portfolio results threaded in via props.
  if (combineMode && portfolio) {
    return (
      <CombinePrintReport
        profile={combineProfile ?? profile}
        grv={combineGrv ?? simulation.statutoryPension}
        returnScenarios={combineReturnScenarios ?? assumptions.returnScenarios}
        inflationRate={combineWorkspace?.baseline.assumptions.inflationRate ?? assumptions.inflationRate}
        retirementEndAge={combineWorkspace?.baseline.assumptions.retirementEndAge ?? assumptions.retirementEndAge}
        portfolio={portfolio}
        workspace={combineWorkspace}
        sensitivityRows={combineSensitivityRows}
        date={date}
      />
    )
  }

  // Compare-mode branch reaches this point only when the short-circuit above
  // returned a real result (`combineMode && portfolio` is false here). The
  // nullish-coalescing fallback to `simulation` keeps consumers safe if the
  // contract ever changes upstream.
  const compareSimulation = allProductsResult ?? simulation
  const grv = simulation.statutoryPension
  // Use the all-6 bAV funding for the lead / summary so the printed value
  // matches the comparison table the user sees. `simulation.bavFunding`
  // would otherwise diverge when `visibleProducts` is a subset upstream.
  const bav = compareSimulation.bavFunding

  // Resolve the effective scenario via the canonical helper (handles missing /
  // unknown ids defensively). NEVER `returnScenarios[0]` — that picks
  // konservativ (3 %) when the user reordered, a documented gotcha
  // (CLAUDE.md "returnScenarios[0] is not necessarily basis").
  //
  // When `selectedScenarioId` is provided (threaded from Calculator.tsx), the
  // printed Vergleich table mirrors the scenario the user selected in the
  // toolbar instead of always defaulting to 'basis'. The `?? 'basis'` fallback
  // preserves backwards compatibility when callers omit the prop.
  const effectiveScenarioId = resolveEffectiveScenarioId(assumptions, selectedScenarioId ?? 'basis')

  // R4: derive the human-readable scenario label so the printed copy
  // ("Werte im …", "Aufschlüsselung im …") matches the data that was actually
  // filtered above. Without this thread, printing after selecting
  // 'optimistisch' yields optimistisch numbers under a "Basisszenario" caption —
  // self-contradictory PDF (Codex R3 P2 + CodeRabbit Minor). Default labels are
  // bare ("Konservativ" / "Basis" / "Optimistisch"); compose with "-Szenario"
  // for natural German sentence flow. Falls back to "Basisszenario" defensively
  // if the scenario is missing from the assumptions list.
  const resolvedScenario = assumptions.returnScenarios.find((s) => s.id === effectiveScenarioId)
  const resolvedScenarioLabel = resolvedScenario
    ? `${resolvedScenario.label}-Szenario`
    : 'Basisszenario'

  // Comparison-table rows: effective scenario only, sorted by netMonthlyPayout
  // desc per R1.
  const basisResults = compareSimulation.products.filter(
    (p) => p.scenarioId === effectiveScenarioId,
  )
  const vergleichRows = buildPrintVergleichRows({ results: basisResults })

  // Pro/contra rows: same product order as the comparison table.
  const proContraRows = buildPrintProContraRows({
    productIds: vergleichRows.map((row) => row.productId),
  })

  // "Wohin geht das Geld" per-product card mirror (R2): one card per product
  // in registry order (matches `/vergleich/details`), three labeled sections
  // each (ANSPARPHASE / MIT {age} / IM ALTER), DMoneyRow values, Verfügbar-ab
  // footer.
  const wohinRows = buildPrintWohinRows({
    results: basisResults,
    assumptions,
    bavFunding: bav,
    retirementAge: profile.retirementAge,
    currentAge: profile.age,
  })

  // Live lead-copy figures (mirror VergleichPage):
  // - Beitrag: `bavFunding.monthlyNetCost` (fair-comparison anchor).
  // - Laufzeit: years between current age and retirement age.
  // - Renteneintritt: `profile.retirementAge` — never hardcoded (P1).
  const monthlyContribution = bav.monthlyNetCost
  const runtimeYears = Math.max(0, profile.retirementAge - profile.age)
  const retirementAge = profile.retirementAge

  return (
    <div id="print-report">

      {/* Disclaimer — first block of every export per the publication guardrails.
          Must precede the title header so the legal notice is the literal first
          thing on the printed page. */}
      <section className="pr-section pr-disclaimer pr-disclaimer-top">
        <div className="pr-section-title">Modellrechnung. Keine Anlage-, Steuer- oder Rechtsberatung</div>
        <p className="pr-disclaimer-lead">
          Diese Berechnung ist eine Modellrechnung mit Stand 2026 und ersetzt keine
          individuelle Anlage-, Steuer- oder Rechtsberatung. Vor Vertragsabschluss
          sollten Sie einen unabhängigen Berater hinzuziehen. Tatsächliche Werte zum
          Renteneintritt können erheblich abweichen; Annahmen wie Rendite, Inflation,
          Gehaltsentwicklung, Lebenserwartung und Vertragskosten sind Schätzungen.
        </p>
      </section>

      {/* Header — fixed table so widths are exact, no flex/grid issues */}
      <table className="pr-layout-fixed pr-header-table">
        <tbody>
          <tr>
            <td className="pr-header-left">
              <div className="pr-title">RentenWiki.de Deutschland 2026</div>
              <div className="pr-subtitle">Persönliches Vorsorgemodell · erstellt am {date}</div>
            </td>
            <td className="pr-header-right">
              Modellrechnung ohne Gewähr · kein Ersatz für individuelle Beratung
            </td>
          </tr>
        </tbody>
      </table>

      {/* Two-column summary — fixed table, no flex/float */}
      <table className="pr-layout-fixed pr-summary-table">
        <tbody>
          <tr>
            <td className="pr-col-left">
              <div className="pr-section-title">Persönliches Profil</div>
              <table className="pr-kv">
                <tbody>
                  <KvRow label="Alter">{profile.age} Jahre</KvRow>
                  <KvRow label="Rentenbeginn">{profile.retirementAge} Jahre</KvRow>
                  <KvRow label="Jahresbrutto">{formatCurrency(profile.grossSalaryYear, 0)}</KvRow>
                  <KvRow label="Krankenversicherung">
                    {profile.publicHealthInsurance ? 'GKV' : 'PKV'}
                  </KvRow>
                  <KvRow label="Kinder">
                    {profile.childBirthYears.length === 0
                      ? 'keine'
                      : profile.childBirthYears.join(', ')}
                  </KvRow>
                </tbody>
              </table>
            </td>
            <td className="pr-col-right">
              <div className="pr-section-title">Gesetzliche Rente</div>
              <table className="pr-kv">
                <tbody>
                  <KvRow label="Bruttorente">{formatCurrency(grv.grossMonthlyPension, 0)}/Monat</KvRow>
                  <KvRow label="Nettorente">
                    <strong>{formatCurrency(grv.netMonthlyPension, 0)}/Monat</strong>
                  </KvRow>
                  <KvRow label="Entgeltpunkte">{formatNumber(grv.projectedEntgeltpunkte, 1)} EP</KvRow>
                  <KvRow label="bAV Nettoaufwand">{formatCurrency(bav.monthlyNetCost, 0)}/Monat</KvRow>
                  <KvRow label="bAV Gesamtbeitrag">
                    {formatCurrency(bav.monthlyGrossConversion + bav.monthlyEmployerContribution, 0)}/Monat
                  </KvRow>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <section className="pr-section">
        <div className="pr-section-title">Rentenszenarien &amp; Annahmen</div>
        <table className="pr-table">
          <thead>
            <tr>
              <th>Szenario</th>
              <th>Jahresrendite</th>
              <th>Inflation</th>
              <th>Rentenbezug bis</th>
            </tr>
          </thead>
          <tbody>
            {assumptions.returnScenarios.map(s => (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td>{formatPercent(s.annualReturn, 1)}</td>
                <td>{formatPercent(assumptions.inflationRate, 1)}</td>
                <td>{assumptions.retirementEndAge} Jahre</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* PR R3: compare-mode Vergleich mirror — replaces the legacy 9-column
          scenario-sweep summary table. Lead block + 6-product table sorted by
          netMonthlyPayout desc, basis-scenario only. Matches the layout the
          user sees on `/vergleich`. */}
      <VergleichSection
        rows={vergleichRows}
        retirementAge={retirementAge}
        monthlyContribution={monthlyContribution}
        runtimeYears={runtimeYears}
        scenarioLabel={resolvedScenarioLabel}
      />

      {/* PR R3: § 1 pro/contra grid — registry order, mirrors the web
          `VergleichProContraGrid`. Section heading numbered "§ 1" to match
          the screen page's single section. */}
      {proContraRows.length > 0 && (
        <ProContraSection rows={proContraRows} />
      )}

      {/* PR R3: "Wohin geht das Geld" per-product card mirror — replaces the
          legacy flat row-per-product table with the R2 card layout (three
          labeled sections + DMoneyRow values + Verfügbar-ab footer). */}
      {wohinRows.length > 0 && (
        <WohinCardsSection
          rows={wohinRows}
          retirementAge={profile.retirementAge}
          scenarioLabel={resolvedScenarioLabel}
        />
      )}

      <MethodeSection />

      <section className="pr-section pr-disclaimer">
        <div className="pr-section-title">Hinweise und Grenzen der Rechnung</div>
        <ul className="pr-disclaimer-list">
          <li>
            <strong>Keine Beratung:</strong> Diese Rechnung ist eine Modellrechnung und ersetzt
            keine individuelle Anlage-, Steuer- oder Rechtsberatung. Vor Vertragsabschluss sollten
            Sie einen unabhängigen Berater hinzuziehen.
          </li>
          <li>
            <strong>Rechtsstand 2026:</strong> Steuersätze, Sozialversicherungsbeiträge
            und Rentenwert sind auf den Stand 2026 fixiert (Quellen: BMF, Deutsche
            Rentenversicherung, GKV-Spitzenverband). Tatsächliche Werte zum Renteneintritt
            können erheblich abweichen.
          </li>
          <li>
            <strong>Annahmen sind Schätzungen:</strong> Jahresrendite, Inflation, Gehaltsentwicklung,
            Lebenserwartung sowie Rentenfaktor und Vertragskosten sind Annahmen. Bereits kleine
            Abweichungen können das Ergebnis und die Reihenfolge der Produkte ändern.
          </li>
          <li>
            <strong>Keine Garantieprodukte modelliert:</strong> Garantierente, Hinterbliebenen-
            und Berufsunfähigkeitsschutz sowie Überschussbeteiligung werden im Modell nicht
            separat ausgewiesen. Vergleichen Sie diese Bestandteile zusätzlich mit dem
            Produktinformationsblatt.
          </li>
          <li>
            <strong>Versorgungslücken:</strong> Pflege, Erwerbsminderung, Scheidungsausgleich
            und Erbschaften sind nicht Teil des Modells.
          </li>
        </ul>
      </section>

      <div className="pr-footer">
        RentenWiki.de Deutschland 2026 · {date} · Persönliches Modell · Keine Anlageberatung
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Combine-mode print report (Group G issue 11).
//
// Renders portfolio output (per-instance results + combined retirement
// income) instead of the singleton compare-mode product table. The
// disclaimer block remains the LITERAL first child of `#print-report`
// (publication-blocking compliance per CLAUDE.md). Returns the same
// `id="print-report"` root so window.print() prints the right element.
// ---------------------------------------------------------------------------

interface CombinePrintReportProps {
  profile: PersonalProfile
  /** GRV projection — must come from workspace (useCombineSimulation), not singleton. */
  grv: StatutoryPensionResult
  /** Scenario list — must come from workspace baseline, not singleton assumptions. */
  returnScenarios: ScenarioAssumptions['returnScenarios']
  /** Active modeled inflation assumption. */
  inflationRate: number
  /** Modeled end age for drawdown products. */
  retirementEndAge: number
  portfolio: NonNullable<Props['portfolio']>
  /**
   * Workspace reference (optional). When provided, `instanceId → label` is resolved
   * from the workspace instance arrays so the "Vertrag" column shows user-given
   * contract labels (e.g. "ETF iShares MSCI World") rather than the generic engine
   * product label (e.g. "ETF-Depot"). Falls back to `r.label` when absent.
   */
  workspace?: Workspace
  /** Pre-computed sensitivity rows (PR 11 R1). Threaded so this component
   *  stays presentational; the cost is paid in Calculator.tsx. */
  sensitivityRows?: ReadonlyArray<PrintSensitivityRow>
  date: string
}

function CombinePrintReport({
  profile,
  grv,
  returnScenarios,
  inflationRate,
  retirementEndAge,
  portfolio,
  workspace,
  sensitivityRows,
  date,
}: CombinePrintReportProps) {
  const { perInstance, combinedByScenarioId, scenarioLabels } = portfolio

  // Build instanceId → user label lookup from the workspace instance arrays so
  // the "Vertrag" column shows user-given contract labels rather than the generic
  // engine product label. Falls back to the engine label (r.label) when either
  // the workspace is absent or the instance label is blank.
  const instanceLabelMap = buildInstanceLabelMap(workspace)

  // Stable scenario order: prefer workspace returnScenarios order (issue 27),
  // fall back to insertion order in combinedByScenarioId.
  const orderedScenarioIds: string[] = (() => {
    const fromScenarios: string[] = returnScenarios
      .map((s) => s.id as string)
      .filter((id) => id in combinedByScenarioId)
    const seen = new Set<string>(fromScenarios)
    const remainder = Object.keys(combinedByScenarioId).filter((id) => !seen.has(id))
    return [...fromScenarios, ...remainder]
  })()

  // PR 11: pick the basis-scenario CombinedResult for the new print
  // sub-sections (Zusammensetzung, Kapital, Vertrag-Detail). Falls back to
  // the first ordered scenario when basis is not in the bundle (rare;
  // workspaces ship the canonical [konservativ, basis, optimistisch] triple).
  const basisScenarioId =
    orderedScenarioIds.find((id) => id === 'basis') ?? orderedScenarioIds[0] ?? 'basis'
  const basisCombined: CombinedResult | undefined = combinedByScenarioId[basisScenarioId]

  // Mein Plan § 1 Zusammensetzung — composition rows for the basis scenario.
  // Always emitted (statutory row is always rendered) when a workspace is in
  // scope; degraded test fixtures without a workspace fall back to an empty
  // section by returning `[]` from the builder.
  const zusammenRows: PrintZusammenRow[] = workspace
    ? buildPrintZusammenRows({
        workspace,
        combinedForScenario: basisCombined,
      })
    : []

  // Per-contract Vertrag-Detail blocks (one per active / paid-up instance).
  // Skipped when the workspace is missing (degraded test path).
  const vertragBlocks: PrintVertragBlock[] = workspace
    ? buildPrintVertragBlocks({
        workspace,
        perInstance,
        scenarioId: basisScenarioId,
        combinedForScenario: basisCombined,
      })
    : []

  // Per-instance Kapital & Auszahlungen wendepunkte. The lifecycle line
  // series is built per instance so the print table renders one block per
  // contract; combine-mode users expect to see the trajectory of each
  // contract, not the aggregate (the aggregate is mirrored on the web
  // /kapital page but does not narrow per-contract decisions). The print
  // emits a single combined table with an instance-id column so the layout
  // stays page-bounded (one section, not one section-per-contract — print
  // pages cannot absorb a wendepunkte block per contract without going
  // past the A4 budget).
  const wendepunkteByInstance: PrintWendepunkteSection[] = workspace
    ? buildPrintWendepunkteRows({
        workspace,
        perInstance,
        scenarioId: basisScenarioId,
      })
    : []

  // Flatten per-instance × scenario rows; sort by instanceId then scenarioId
  // for stable output across renders.
  const instanceIds = Object.keys(perInstance).sort()
  const instanceRows: Array<{ instanceId: string; result: ProductResult }> = []
  for (const instanceId of instanceIds) {
    const arr = perInstance[instanceId] ?? []
    const sorted = [...arr].sort(
      (a, b) => SCENARIO_ORDER.indexOf(a.scenarioId) - SCENARIO_ORDER.indexOf(b.scenarioId),
    )
    for (const r of sorted) {
      instanceRows.push({ instanceId, result: r })
    }
  }

  return (
    <div id="print-report">
      {/* Disclaimer — first block of every export per the publication
          guardrails. MUST stay the literal first child of #print-report. */}
      <section className="pr-section pr-disclaimer pr-disclaimer-top">
        <div className="pr-section-title">Modellrechnung. Keine Anlage-, Steuer- oder Rechtsberatung</div>
        <p className="pr-disclaimer-lead">
          Diese Berechnung ist eine Modellrechnung mit Stand 2026 und ersetzt keine
          individuelle Anlage-, Steuer- oder Rechtsberatung. Vor Vertragsabschluss
          sollten Sie einen unabhängigen Berater hinzuziehen. Tatsächliche Werte zum
          Renteneintritt können erheblich abweichen; Annahmen wie Rendite, Inflation,
          Gehaltsentwicklung, Lebenserwartung und Vertragskosten sind Schätzungen.
        </p>
      </section>

      <table className="pr-layout-fixed pr-header-table">
        <tbody>
          <tr>
            <td className="pr-header-left">
              <div className="pr-title">RentenWiki.de Deutschland 2026 — Mein Plan</div>
              <div className="pr-subtitle">Persönliches Vorsorgemodell · erstellt am {date}</div>
            </td>
            <td className="pr-header-right">
              Modellrechnung ohne Gewähr · kein Ersatz für individuelle Beratung
            </td>
          </tr>
        </tbody>
      </table>

      <table className="pr-layout-fixed pr-summary-table">
        <tbody>
          <tr>
            <td className="pr-col-left">
              <div className="pr-section-title">Persönliches Profil</div>
              <table className="pr-kv">
                <tbody>
                  <KvRow label="Alter">{profile.age} Jahre</KvRow>
                  <KvRow label="Rentenbeginn">{profile.retirementAge} Jahre</KvRow>
                  <KvRow label="Jahresbrutto">{formatCurrency(profile.grossSalaryYear, 0)}</KvRow>
                  <KvRow label="Krankenversicherung">
                    {profile.publicHealthInsurance ? 'GKV' : 'PKV'}
                  </KvRow>
                  <KvRow label="Kinder">
                    {profile.childBirthYears.length === 0
                      ? 'keine'
                      : profile.childBirthYears.join(', ')}
                  </KvRow>
                </tbody>
              </table>
            </td>
            <td className="pr-col-right">
              <div className="pr-section-title">Gesetzliche Rente</div>
              <table className="pr-kv">
                <tbody>
                  <KvRow label="Bruttorente">{formatCurrency(grv.grossMonthlyPension, 0)}/Monat</KvRow>
                  <KvRow label="Nettorente">
                    <strong>{formatCurrency(grv.netMonthlyPension, 0)}/Monat</strong>
                  </KvRow>
                  <KvRow label="Entgeltpunkte">{formatNumber(grv.projectedEntgeltpunkte, 1)} EP</KvRow>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <section className="pr-section">
        <div className="pr-section-title">Rentenszenarien &amp; Annahmen</div>
        <table className="pr-table">
          <thead>
            <tr>
              <th>Szenario</th>
              <th>Jahresrendite</th>
              <th>Inflation</th>
              <th>Rentenbezug bis</th>
            </tr>
          </thead>
          <tbody>
            {returnScenarios.map((s) => (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td>{formatPercent(s.annualReturn, 1)}</td>
                <td>{formatPercent(inflationRate, 1)}</td>
                <td>{retirementEndAge} Jahre</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pr-section">
        <div className="pr-section-title">Kombiniertes Renteneinkommen je Szenario</div>
        <table className="pr-table">
          <thead>
            <tr>
              <th>Szenario</th>
              <th className="pr-num">Netto-Einkommen mtl.</th>
              <th className="pr-num">Gesetzl. Rente netto mtl.</th>
            </tr>
          </thead>
          <tbody>
            {orderedScenarioIds.map((id) => {
              const c = combinedByScenarioId[id]
              if (!c) return null
              return (
                <tr key={id} className={id === 'basis' ? 'pr-basis' : ''}>
                  <td>{scenarioLabels[id] ?? id}</td>
                  <td className="pr-num">{formatCurrency(c.monthlyNetIncome, 0)}/Monat</td>
                  <td className="pr-num">{formatCurrency(c.statutoryPensionMonthlyNet, 0)}/Monat</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="pr-note pr-table-note">
          Aggregierte Steuer- und Sozialversicherungsabgaben über alle Verträge nach §32a EStG
          und §240 SGB V (KV/PV). Fettgedruckte Zeile = Basisszenario.
        </p>
      </section>

      <section className="pr-section">
        <div className="pr-section-title">Mein Plan — Detail je Vertrag</div>
        <table className="pr-table pr-main-table">
          <colgroup>
            <col style={{ width: '20%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Vertrag</th>
              <th>Produkt</th>
              <th>Szenario</th>
              <th className="pr-num">Beitrag mtl.</th>
              <th className="pr-num">Kapital</th>
              <th className="pr-num">Brutto-Rente mtl.</th>
              <th className="pr-num">Netto-Rente mtl.</th>
              <th className="pr-num">Effektivkost.</th>
            </tr>
          </thead>
          <tbody>
            {instanceRows.map(({ instanceId, result: r }) => {
              // Use the back-allocated monthlyNet from the aggregate progressive
              // tax + KV/PV pipeline (byInstance) so this column matches
              // CombineDetailView for multi-product households. Falls back to the
              // per-instance simulator value only when byInstance has no entry.
              const combinedForScenario = combinedByScenarioId[r.scenarioId]
              const netMonthly = combinedForScenario?.byInstance[instanceId]?.monthlyNet ?? r.netMonthlyPayout
              return (
                <tr
                  key={`${instanceId}-${r.scenarioId}`}
                  className={r.scenarioId === 'basis' ? 'pr-basis' : ''}
                >
                  <td>{instanceLabelMap[instanceId] ?? r.label}</td>
                  <td>{getProductMeta(r.productId)?.label ?? r.productId}</td>
                  <td>{r.scenarioLabel}</td>
                  <td className="pr-num">{formatCurrency(r.monthlyProductContribution, 0)}</td>
                  <td className="pr-num">{formatCurrency(r.capitalAtRetirement, 0)}</td>
                  <td className="pr-num">{formatCurrency(r.grossMonthlyPayout, 0)}</td>
                  <td className="pr-num">
                    {formatCurrency(netMonthly, 0)}
                    <ConfidenceIndicator state={r.inputConfidence} />
                  </td>
                  <td className="pr-num">{formatPercent(r.accumulationRiy, 2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="pr-note pr-table-note">
          Werte je Vertrag sind isoliert simuliert. Die Steuer- und KV/PV-Last in der
          Rentenphase wird im kombinierten Einkommen oben aggregiert (progressiver
          Einkommensteuertarif).
        </p>
      </section>

      {zusammenRows.length > 0 && (
        <ZusammensetzungSection
          rows={zusammenRows}
          retirementAge={profile.retirementAge}
          sensitivityRows={sensitivityRows}
        />
      )}

      {wendepunkteByInstance.length > 0 && (
        <WendepunkteSection rows={wendepunkteByInstance} />
      )}

      {vertragBlocks.length > 0 && (
        <VertragImDetailSection blocks={vertragBlocks} />
      )}

      <MethodeSection />

      <section className="pr-section pr-disclaimer">
        <div className="pr-section-title">Hinweise und Grenzen der Rechnung</div>
        <ul className="pr-disclaimer-list">
          <li>
            <strong>Keine Beratung:</strong> Diese Rechnung ist eine Modellrechnung und ersetzt
            keine individuelle Anlage-, Steuer- oder Rechtsberatung. Vor Vertragsabschluss sollten
            Sie einen unabhängigen Berater hinzuziehen.
          </li>
          <li>
            <strong>Rechtsstand 2026:</strong> Steuersätze, Sozialversicherungsbeiträge
            und Rentenwert sind auf den Stand 2026 fixiert.
          </li>
          <li>
            <strong>Annahmen sind Schätzungen:</strong> Jahresrendite, Inflation, Gehaltsentwicklung,
            Lebenserwartung sowie Rentenfaktor und Vertragskosten sind Annahmen.
          </li>
          <li>
            <strong>Versorgungslücken:</strong> Pflege, Erwerbsminderung, Scheidungsausgleich
            und Erbschaften sind nicht Teil des Modells.
          </li>
        </ul>
      </section>

      <div className="pr-footer">
        RentenWiki.de Deutschland 2026 · {date} · Persönliches Modell · Keine Anlageberatung
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PR 11 print sections (compare + combine)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PR R3 compare-mode print sections — mirror the R1 + R2 Vergleich layouts
// ---------------------------------------------------------------------------

/**
 * PR R3: compare-mode Vergleich table mirror. Single lead block ("Sechs
 * Wege …") + 6-row × 7-column comparison table, sorted by `netMonthlyPayout`
 * desc per R1. Replaces the legacy 9-column scenario-sweep summary.
 *
 * Column structure mirrors `VergleichComparisonTable.tsx`:
 *   Sparform | Wie es funktioniert | Kapital mit N | Kosten p. a. |
 *   Brutto-Rente | Abzüge | Netto pro Monat
 *
 * Visual treatment per Sober D conventions: oxblood (`var(--rw-accent)`) on
 * the Abzüge column only; the Netto cell stays default ink (the screen page
 * uses a bar; the print is tabular-only because A4 column widths leave no
 * room for a graphical bar and the rounded value already conveys the rank).
 */
function VergleichSection({
  rows,
  retirementAge,
  monthlyContribution,
  runtimeYears,
  scenarioLabel,
}: {
  rows: ReadonlyArray<PrintVergleichRow>
  retirementAge: number
  monthlyContribution: number
  runtimeYears: number
  scenarioLabel: string
}) {
  return (
    <section className="pr-section pr-vergleich-section">
      <div className="pr-section-title">Sechs Wege, fürs Alter zu sparen</div>
      <p className="pr-vergleich-lead">
        Sechs Sparformen, sechs Steuersystematiken: Vergleich bei gleichem
        Netto-Aufwand von <strong>{formatCurrency(monthlyContribution, 0)}</strong> pro
        Monat, Laufzeit <strong>{runtimeYears} Jahre</strong>, Renteneintritt
        mit <strong>{retirementAge}</strong>. Welcher der beste ist, hängt
        davon ab, was du gewichtest: Rendite, Sicherheit, Flexibilität.
        Diese Modellrechnung nennt keine Empfehlung.
      </p>
      <table className="pr-table pr-main-table pr-vergleich-table">
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Sparform</th>
            <th>Wie es funktioniert</th>
            <th className="pr-num">{`Kapital mit ${retirementAge}`}</th>
            <th className="pr-num">Kosten p. a.</th>
            <th className="pr-num">Brutto-Rente</th>
            <th className="pr-num">Abzüge</th>
            <th className="pr-num">Netto pro Monat</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.productId}>
              <td>
                <div className="pr-vergleich-cell-product">
                  <span className="pr-vergleich-cell-product__name">{row.label}</span>
                  <span className="pr-vergleich-cell-product__short">{row.shortLabel}</span>
                </div>
              </td>
              <td className="pr-vergleich-cell-tagline">{row.tagline}</td>
              <td className="pr-num">{formatCurrency(row.capitalAtRetirement, 0)}</td>
              <td className="pr-num">{formatPercent(row.effectiveAnnualCost, 1)}</td>
              <td className="pr-num">{formatCurrency(row.grossMonthlyPayout, 0)}</td>
              <td className="pr-num pr-vergleich-cell-abzuege">
                −{formatCurrency(row.deductionsMonthly, 0)}
              </td>
              <td className="pr-num pr-vergleich-cell-netto">
                {formatCurrency(row.netMonthlyPayout, 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pr-note pr-table-note">
        Sortierung nach Netto-Rente absteigend. Werte im {scenarioLabel}. Keine
        Wertung — die beste Wahl hängt vom persönlichen Trade-off zwischen
        Rendite, Sicherheit und Flexibilität ab.
      </p>
    </section>
  )
}

/**
 * PR R3: § 1 pro/contra grid mirror. One row per product, PRO + CONTRA copy
 * sourced from `proContraCopy.ts`. Mirrors the screen `VergleichProContraGrid`
 * (R1). The CONTRA value is rendered in oxblood — matches the screen's
 * `var(--rw-accent)` treatment.
 */
function ProContraSection({
  rows,
}: {
  rows: ReadonlyArray<PrintProContraRow>
}) {
  return (
    <section className="pr-section pr-procontra-section">
      <div className="pr-section-title">§ 1 — Wofür welche Sparform spricht — und wogegen</div>
      <table className="pr-table pr-procontra-table">
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '41%' }} />
          <col style={{ width: '41%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Sparform</th>
            <th>PRO</th>
            <th>CONTRA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.productId}>
              <td>
                <div className="pr-procontra-cell-product">
                  <span className="pr-procontra-cell-product__name">{row.label}</span>
                  <span className="pr-procontra-cell-product__short">{row.shortLabel}</span>
                </div>
              </td>
              <td className="pr-procontra-cell-pro">{row.pro}</td>
              <td className="pr-procontra-cell-contra">{row.contra}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/**
 * PR R3: "Wohin geht das Geld" per-product card mirror. Replaces the legacy
 * flat row-per-product table with the R2 card layout: one card per product,
 * three labeled sections each (ANSPARPHASE / MIT {retirementAge} / IM ALTER),
 * DMoneyRow-style rows with bold/border/accent semantics, Verfügbar-ab footer
 * per card.
 *
 * Print layout choice: render the 6 cards as a 3-column × 2-row CSS grid
 * (mirrors the screen `.vd-card-grid` desktop layout). `break-inside: avoid`
 * keeps individual cards atomic; if a card cannot fit on the current page,
 * the grid breaks at the card boundary and reflows on the next page.
 *
 * Currency is formatted via `formatCurrency(value, 0)` at the row layer
 * (UI rounding boundary per CLAUDE.md).
 */
function WohinCardsSection({
  rows,
  retirementAge,
  scenarioLabel,
}: {
  rows: ReadonlyArray<PrintWohinRow>
  retirementAge: number
  scenarioLabel: string
}) {
  return (
    <section className="pr-section pr-section-allow-break pr-wohin-cards-section">
      <div className="pr-section-title">
        Wohin geht das Geld — Aufschlüsselung pro Produkt (Mit {retirementAge})
      </div>
      <div className="pr-wohin-cards">
        {rows.map((row) => (
          <WohinCard key={row.productId} row={row} />
        ))}
      </div>
      <p className="pr-note pr-table-note">
        Aufschlüsselung im {scenarioLabel}. „Effektivkosten p. a." nach
        RIY-Methode über die gesamte Ansparphase. Verfügbarkeit je Karte unten.
      </p>
    </section>
  )
}

/**
 * Single per-product card in the "Wohin geht das Geld" print mirror. Three
 * labeled sections (ANSPARPHASE / MIT {age} / IM ALTER) sourced from
 * `vergleichDetailRows.ts`; each row uses the same `kind`/`bold`/`border`/
 * `accent`/`labelSuffix` semantics as `DMoneyRow` on the screen.
 *
 * Print bold/border mirroring matches `VergleichDetailCardSection`:
 * - leading `'add'` row whose label is "Kapital brutto" is bold
 * - `'total'` rows are bold + border-top
 * - `'sub'` rows render with leading "− " on the value
 * - `'accent'` flag tints the value oxblood (net-Rente only)
 */
function WohinCard({ row }: { row: PrintWohinRow }) {
  return (
    <article className="pr-wohin-card" data-product={row.productId}>
      <header className="pr-wohin-card__head">
        <span className="pr-wohin-card__short">{row.shortLabel}</span>
        <span className="pr-wohin-card__label">{row.label}</span>
      </header>
      <div className="pr-wohin-card__body">
        {row.sections.map((section) => (
          <WohinCardSection key={section.heading} heading={section.heading} rows={section.rows} />
        ))}
      </div>
      <footer className="pr-wohin-card__footer">
        <span className="pr-wohin-card__footer-key">Verfügbar ab</span>
        <span className="pr-wohin-card__footer-value">{row.availabilityLabel}</span>
        {row.availabilityNote && (
          <p className="pr-wohin-card__footer-note">{row.availabilityNote}</p>
        )}
      </footer>
    </article>
  )
}

function WohinCardSection({
  heading,
  rows,
}: {
  heading: string
  rows: ReadonlyArray<VergleichDetailRow>
}) {
  return (
    <section className="pr-wohin-card-section">
      <span className="pr-wohin-card-section__heading">{heading}</span>
      <div className="pr-wohin-card-section__rows">
        {rows.map((row, idx) => (
          <WohinMoneyRow key={`${row.label}-${idx}`} row={row} />
        ))}
      </div>
    </section>
  )
}

/**
 * DMoneyRow-equivalent for the print mirror. Same visual mapping as the
 * screen `DMoneyRow`:
 * - `'add'` row whose label starts with "+" → muted (additive summand)
 * - `'add'` plain ("Du selbst", "Kapital brutto", "Brutto-Rente") → default ink
 * - `'sub'` → muted, value prefixed with "− "
 * - `'total'` → bold + border-top
 * - `'total'` + `accent` → oxblood value (net-Rente)
 * - `'info'` → muted, value rendered from `display` (caller pre-formats)
 */
function WohinMoneyRow({ row }: { row: VergleichDetailRow }) {
  const isAddSummand = row.kind === 'add' && row.label.startsWith('+')
  const isPlainAdd = row.kind === 'add' && !isAddSummand
  const muted = isAddSummand || row.kind === 'sub' || row.kind === 'info'
  const bold = row.kind === 'total' || (isPlainAdd && row.label === 'Kapital brutto')
  const border = row.kind === 'total'
  const accent = row.accent === true

  const classNames = [
    'pr-wohin-money-row',
    `pr-wohin-money-row--${row.kind}`,
    muted ? 'pr-wohin-money-row--muted' : '',
    bold ? 'pr-wohin-money-row--bold' : '',
    border ? 'pr-wohin-money-row--border' : '',
    accent ? 'pr-wohin-money-row--accent' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const value = formatRowValue(row)
  return (
    <div className={classNames}>
      <span className="pr-wohin-money-row__label">
        {row.label}
        {row.labelSuffix && (
          <span className="pr-wohin-money-row__label-suffix"> {row.labelSuffix}</span>
        )}
      </span>
      <span className="pr-wohin-money-row__value">{value}</span>
    </div>
  )
}

function formatRowValue(row: VergleichDetailRow): string {
  if (row.kind === 'info') {
    // Info rows carry an optional pre-formatted display string; fall back to a
    // percent formatter at the row's value (matches `VergleichDetailCardSection`).
    // Use 1 decimal — matches the CLAUDE.md UI rounding boundary
    // (`formatPercent(value, decimals=1)`) and the rest of the new R3 print
    // surfaces (CR2 fix, PR R3 R1).
    return row.display ?? formatPercent(row.value, 1)
  }
  if (row.kind === 'sub') return `− ${formatCurrency(row.value, 0)}`
  return formatCurrency(row.value, 0)
}

/**
 * Compact "Methode & Quellen" block, shared by compare-mode and
 * combine-mode print. Renders the five high-level themes from the web
 * `/methode` page (Renditeannahmen / Steuermodell / Sozialversicherung /
 * Statutorische Werte / Bewusst nicht modellieren) as a short definition
 * list, plus a pointer to the live `/methode` page for full statutory
 * tables. Kept terse — the print budget is ≤ 1 A4 page for this block.
 */
function MethodeSection() {
  return (
    <section className="pr-section pr-methode-section">
      <div className="pr-section-title">Methode &amp; Quellen</div>
      <ul className="pr-methode-list">
        {PRINT_METHODE_BULLETS.map((bullet) => (
          <li key={bullet.label}>
            <strong>{bullet.label}:</strong> {bullet.body}
          </li>
        ))}
      </ul>
      <p className="pr-note pr-methode-pointer">
        Vollständige statutorische Werte und § §-Verweise:
        {' '}RentenWiki.de/methode
        {' '}— BMF / BMAS-Quellen, jährliche Aktualisierung.
      </p>
    </section>
  )
}

/**
 * Combine-mode "Zusammensetzung & Sensitivität" print block. Mirrors Mein
 * Plan § 1 (statutory pension leading row + one row per active / paid-up
 * instance) and § 2 (sensitivity perturbation rows). Section heading
 * carries both names so the print mirrors the web section index.
 *
 * The sensitivity sub-table is suppressed when `sensitivityRows` is
 * absent or empty (degraded test path or fully neutral plan) — the
 * composition table still renders so the user sees the contract list.
 */
function ZusammensetzungSection({
  rows,
  retirementAge,
  sensitivityRows,
}: {
  rows: ReadonlyArray<PrintZusammenRow>
  retirementAge: number
  sensitivityRows?: ReadonlyArray<PrintSensitivityRow>
}) {
  return (
    <section className="pr-section">
      <div className="pr-section-title">
        Zusammensetzung &amp; Sensitivität — Rente mit {retirementAge}
      </div>
      <table className="pr-table">
        <colgroup>
          <col style={{ width: '32%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '14%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Quelle</th>
            <th className="pr-num">Beitrag heute</th>
            <th className="pr-num">Rente mit {retirementAge}</th>
            <th className="pr-num">Anteil</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>
                <div>{row.label}</div>
                {row.sublabel ? (
                  <div className="pr-zusammen-sublabel">{row.sublabel}</div>
                ) : null}
              </td>
              <td className="pr-num">
                {row.contributionMonthly === null
                  ? '–'
                  : row.contributionMonthly === 0
                    ? 'beitragsfrei'
                    : `${formatCurrency(row.contributionMonthly, 0)}/Mon.`}
              </td>
              <td className="pr-num">{formatCurrency(row.monthlyNet, 0)}/Mon.</td>
              <td className="pr-num">{formatPercent(row.share, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pr-note pr-table-note">
        Werte im Basisszenario. Anteil basiert auf der aggregierten Netto-Rente
        nach Steuer und KV/PV.
      </p>

      {sensitivityRows && sensitivityRows.length > 0 && (
        <SensitivitaetSubTable rows={sensitivityRows} />
      )}
    </section>
  )
}

/**
 * Sensitivität sub-table rendered inside the Zusammensetzung print
 * section. Each row is a single perturbation against the basis scenario;
 * the delta column carries a sign + colour pill (green / red / neutral)
 * driven by `row.sign`. The optional `noteText` row below the condition
 * surfaces selector caveats (clamped retirement age, paid-up ETF, etc.)
 * so a `±0 €/Mon.` delta is never displayed without explanation.
 */
function SensitivitaetSubTable({
  rows,
}: {
  rows: ReadonlyArray<PrintSensitivityRow>
}) {
  return (
    <>
      <div className="pr-sens-subhead">Was sich ändern würde, wenn …</div>
      <table className="pr-table pr-sens-table">
        <colgroup>
          <col style={{ width: '70%' }} />
          <col style={{ width: '30%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Bedingung</th>
            <th className="pr-num">Δ Netto-Rente</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div>{row.conditionText}</div>
                {row.noteText ? (
                  <div className="pr-sens-note">{row.noteText}</div>
                ) : null}
              </td>
              <td className={`pr-num pr-sens-delta pr-sens-delta--${row.sign}`}>
                {row.deltaText}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pr-note pr-table-note">
        Einzelne Was-wäre-wenn-Perturbationen im Basisszenario, gerundet auf
        ganze Euro. Werte unter 1 €/Monat werden als ±0 angezeigt.
      </p>
    </>
  )
}

/**
 * Combine-mode "Kapital & Auszahlungen" print block. One row per
 * (instance × turning point) so the print stays page-bounded with multi-
 * contract workspaces. Mirrors `KapitalWendepunkteTable` from the web
 * `/kapital` page (PR 8).
 */
function WendepunkteSection({
  rows,
}: {
  rows: ReadonlyArray<PrintWendepunkteSection>
}) {
  return (
    <section className="pr-section">
      <div className="pr-section-title">Kapital &amp; Auszahlungen — Wendepunkte je Vertrag</div>
      <table className="pr-table">
        <colgroup>
          <col style={{ width: '20%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Vertrag</th>
            <th>Ereignis</th>
            <th className="pr-num">Alter</th>
            <th className="pr-num">Kapital</th>
            <th className="pr-num">Eingezahlt</th>
            <th className="pr-num">Ausgezahlt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((section) =>
            section.rows.map((row, idx) => (
              <tr key={`${section.instanceId}-${row.kind}`}>
                {idx === 0 ? (
                  <td rowSpan={section.rows.length} className="pr-wendepunkte-instance">
                    {section.title}
                  </td>
                ) : null}
                <td>{row.label}</td>
                <td className="pr-num">{row.age === null ? '–' : `${row.age}`}</td>
                <td className="pr-num">{row.capital === null ? '–' : formatCurrency(row.capital, 0)}</td>
                <td className="pr-num">{row.paidIn === null ? '–' : formatCurrency(row.paidIn, 0)}</td>
                <td className="pr-num">{row.payout === null ? '–' : formatCurrency(row.payout, 0)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      <p className="pr-note pr-table-note">
        Aggregierte Wendepunkte je Vertrag — Halbzeit der Ansparphase, Renteneintritt,
        Break-even (Auszahlungen ≥ Einzahlungen) und voraussichtliches Modell-Endalter.
      </p>
    </section>
  )
}

/**
 * Combine-mode "Vertrag im Detail" print block. One sub-block per active /
 * paid-up instance, containing four KPI cells (Beitrag / Einzahlungen /
 * Voraussichtl. Kapital / Netto-Rente) plus the per-contract evidence
 * provenance list. Mirrors `VertragKpiStrip` + `VertragProvenanceList`
 * from the web `/vertrag/:instanceId` page (PR 7).
 *
 * Layout choice (handoff doc pre-anticipated decision): compact stacked
 * layout on shared pages, NOT one block per contract on its own page —
 * `page-break-before` per block is wasteful for users with 4-6 instances
 * (a typical combine-mode plan). `break-inside: avoid` keeps individual
 * blocks together; if a block does not fit on the current page, it moves
 * to the next.
 */
function VertragImDetailSection({
  blocks,
}: {
  blocks: ReadonlyArray<PrintVertragBlock>
}) {
  // Per CR9: this outer section uses `pr-section-allow-break` so the per-
  // contract list can flow across pages. Each `.pr-vertrag-block` inside still
  // carries `break-inside: avoid` so individual contracts stay atomic.
  return (
    <section className="pr-section pr-section-allow-break">
      <div className="pr-section-title">Vertrag im Detail</div>
      <div className="pr-vertrag-blocks">
        {blocks.map((block) => (
          <VertragBlockView key={block.instanceId} block={block} />
        ))}
      </div>
    </section>
  )
}

function VertragBlockView({ block }: { block: PrintVertragBlock }) {
  return (
    <div className="pr-vertrag-block">
      <div className="pr-vertrag-header">
        <strong>{block.title}</strong>
        <span className="pr-note">
          {' · '}
          {block.productLabel}
          {block.statusLabel ? ` · ${block.statusLabel}` : ''}
          {' · angelegt: '}
          {block.contractStartLabel}
          {block.anbieter ? ` · ${block.anbieter}` : ''}
        </span>
      </div>
      <table className="pr-table pr-vertrag-kpi-table">
        <thead>
          <tr>
            {block.kpis.map((kpi) => (
              <th key={kpi.label} className="pr-num">{kpi.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {block.kpis.map((kpi) => (
              <td key={kpi.label} className="pr-num">
                <div className="pr-vertrag-kpi-value">
                  {kpi.displayOverride ?? (kpi.value === null ? '–' : formatCurrency(kpi.value, 0))}
                </div>
                <div className="pr-note">{kpi.sublabel}</div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <table className="pr-table pr-vertrag-prov-table">
        <colgroup>
          <col style={{ width: '60%' }} />
          <col style={{ width: '40%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Eingabe</th>
            <th>Herkunft</th>
          </tr>
        </thead>
        <tbody>
          {block.provenance.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>
                <span className={vertragProvenanceClassName(row.evidenceKind)}>
                  {row.evidenceLabel}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function vertragProvenanceClassName(kind: 'confirmed' | 'model' | 'default'): string {
  switch (kind) {
    case 'confirmed':
      return 'pr-confidence-confirmed'
    case 'model':
      return 'pr-confidence-estimate'
    case 'default':
      return 'pr-confidence-default'
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a flat `instanceId → displayLabel` map from all workspace instance
 * arrays. Mirrors the label-resolution logic in `CombineDetailView.collectRows`:
 * use `inst.label` when non-blank, otherwise fall back to the engine product
 * meta label so the "Vertrag" column is never empty.
 *
 * Returns an empty object when `workspace` is undefined (no-workspace fallback).
 */
function buildInstanceLabelMap(workspace: Workspace | undefined): Record<string, string> {
  if (!workspace) return {}

  const wsa = workspace.baseline.assumptions
  const map: Record<string, string> = {}

  // Slot ids are typed as `ProductId` so a registry rename (e.g. `versicherung`
  // → `pav`) surfaces here as a compile error rather than silently dropping
  // labels for that product family.
  const slots: Array<{ id: ProductId; instances: Array<{ instanceId: string; label: string }> }> = [
    { id: 'bav', instances: wsa.bav },
    { id: 'etf', instances: wsa.etf },
    { id: 'versicherung', instances: wsa.insurance },
    { id: 'basisrente', instances: wsa.basisrente },
    { id: 'altersvorsorgedepot', instances: wsa.altersvorsorgedepot },
    { id: 'riester', instances: wsa.riester },
  ]

  for (const slot of slots) {
    const meta = getProductMeta(slot.id)
    for (const inst of slot.instances) {
      map[inst.instanceId] = inst.label?.trim().length
        ? inst.label
        : (meta?.label ?? slot.id)
    }
  }

  return map
}
