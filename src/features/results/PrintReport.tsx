import './PrintReport.css'
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
import {
  evidenceStateToProvKind,
  formatEvidenceStateForExport,
} from './provenanceHelpers'
import {
  buildPrintWohinRows,
  buildPrintZusammenRows,
  buildPrintVertragBlocks,
  buildPrintWendepunkteRows,
  PRINT_METHODE_BULLETS,
  type PrintWohinRow,
  type PrintZusammenRow,
  type PrintVertragBlock,
  type PrintWendepunkteSection,
} from './printReportRows'

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
}: Props) {
  const date = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  // Combine-mode branch (Group G issue 11): when combineMode + portfolio are
  // provided, render per-instance + combined view rather than singleton-compare
  // product table. Compare-mode (combineMode=false or undefined) renders the
  // historical layout byte-identically.
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
        date={date}
      />
    )
  }

  const visibleSet = new Set(
    assumptions.visibleProducts.length > 0
      ? assumptions.visibleProducts
      : simulation.products.map((p) => p.productId),
  )
  const sorted = simulation.products
    .filter((p) => visibleSet.has(p.productId))
    .sort((a, b) => {
    const aOrd = getProductMeta(a.productId)?.order ?? 99
    const bOrd = getProductMeta(b.productId)?.order ?? 99
    if (aOrd !== bOrd) return aOrd - bOrd
    return SCENARIO_ORDER.indexOf(a.scenarioId) - SCENARIO_ORDER.indexOf(b.scenarioId)
  })

  const grv = simulation.statutoryPension
  const bav = simulation.bavFunding

  // PR 11: build the "Wohin geht das Geld" per-product print rows from the
  // basis-scenario results. Reuses the same `vergleichDetailRows` helper as
  // the web `/vergleich/details` surface so the print and web report
  // identical figures. Sort + filter happen inside the builder.
  const basisScenarioId =
    assumptions.returnScenarios.find((s) => s.id === 'basis')?.id ??
    assumptions.returnScenarios[0]?.id ??
    'basis'
  const wohinRows = buildPrintWohinRows({
    results: sorted.filter((r) => r.scenarioId === basisScenarioId),
    assumptions,
    bavFunding: bav,
    retirementAge: profile.retirementAge,
    currentAge: profile.age,
  })

  return (
    <div id="print-report">

      {/* Disclaimer — first block of every export per the publication guardrails.
          Must precede the title header so the legal notice is the literal first
          thing on the printed page. */}
      <section className="pr-section pr-disclaimer pr-disclaimer-top">
        <div className="pr-section-title">Modellrechnung — keine Anlage-, Steuer- oder Rechtsberatung</div>
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

      <section className="pr-section">
        <div className="pr-section-title">Produktvergleich — alle Szenarien</div>
        <table className="pr-table pr-main-table">
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '6%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Produkt</th>
              <th>Szenario</th>
              <th className="pr-num">Nettokost. mtl.</th>
              <th className="pr-num">Kapital</th>
              <th className="pr-num">Kapital n. St.</th>
              <th className="pr-num">Netto-Rente</th>
              <th className="pr-num">Kosten ges.</th>
              <th className="pr-num">Effektivkost.</th>
              <th className="pr-num">Faktor</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr
                key={`${r.productId}-${r.scenarioId}`}
                className={r.scenarioId === 'basis' ? 'pr-basis' : ''}
              >
                <td>{r.label}</td>
                <td>{r.scenarioLabel}</td>
                <td className="pr-num">{formatCurrency(r.monthlyUserCost, 0)}</td>
                <td className="pr-num">{formatCurrency(r.capitalAtRetirement, 0)}</td>
                <td className="pr-num">
                  {r.afterTaxLumpSum === null ? '—' : formatCurrency(r.afterTaxLumpSum, 0)}
                </td>
                <td className="pr-num">
                  {formatCurrency(r.netMonthlyPayout, 0)}
                  <ConfidenceIndicator state={r.inputConfidence} />
                  {r.leibrenteBreakEvenAge !== undefined && (
                    <span className="pr-note">
                      {' '}(BE {Math.round(r.leibrenteBreakEvenAge)})
                    </span>
                  )}
                </td>
                <td className="pr-num">{formatCurrency(r.totalFees, 0)}</td>
                <td className="pr-num">{formatPercent(r.accumulationRiy, 2)}</td>
                <td className="pr-num">
                  {r.valueMultipleOnUserCost === null
                    ? '—'
                    : `${formatNumber(r.valueMultipleOnUserCost, 1)}x`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pr-note pr-table-note">
          Fettgedruckte Zeilen = Basisszenario.
          Kapital n. St. = Einmalauszahlung nach Steuer (Basisrente: gesetzlich verboten, daher —).
          BE = Leibrente-Break-even-Alter.
        </p>
      </section>

      {wohinRows.length > 0 && (
        <WohinSection rows={wohinRows} retirementAge={profile.retirementAge} />
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
        perInstance,
        scenarioId: basisScenarioId,
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
        <div className="pr-section-title">Modellrechnung — keine Anlage-, Steuer- oder Rechtsberatung</div>
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

/**
 * Compare-mode "Wohin geht das Geld" print block. Mirrors the web
 * `/vergleich/details` card grid but flattens to a per-product stacked
 * table (A4 needs fixed widths — a card grid does not fit predictably).
 *
 * One inner table per product, three labelled section rows
 * (Ansparphase / Mit {retirementAge} / Im Alter), plus an "Effektivkost." +
 * "Verfügbar ab" footer line. Pure presentational — every figure is
 * pre-formatted by the helper layer or `formatCurrency`.
 */
function WohinSection({
  rows,
  retirementAge,
}: {
  rows: ReadonlyArray<PrintWohinRow>
  retirementAge: number
}) {
  return (
    <section className="pr-section">
      <div className="pr-section-title">
        Wohin geht das Geld — Aufschlüsselung pro Produkt (Mit {retirementAge})
      </div>
      <table className="pr-table pr-wohin-table">
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '18%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Produkt</th>
            <th>Ansparphase</th>
            <th className="pr-num">€/Mon.</th>
            <th>Mit {retirementAge}</th>
            <th className="pr-num">€</th>
            <th>Im Alter</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <WohinProductRows key={row.productId} row={row} />
          ))}
        </tbody>
      </table>
      <p className="pr-note pr-table-note">
        Aufschlüsselung im Basisszenario. „Effektivkosten p. a." nach IVASS / RIY-Methode
        über die gesamte Ansparphase. Verfügbarkeit pro Produkt: siehe Hinweis je Zeile.
      </p>
    </section>
  )
}

function WohinProductRows({ row }: { row: PrintWohinRow }) {
  // The three sections are uniform in length (3-4 rows each); we render them
  // as parallel cell groups so the product label only appears once. To keep
  // the table portable we render one tr per section, with the product label
  // rowspan'd over the three section rows + the footer row.
  const ansparRows = sectionLines(row.sections[0]?.rows ?? [])
  const kapitalRows = sectionLines(row.sections[1]?.rows ?? [])
  const payoutRows = sectionLines(row.sections[2]?.rows ?? [])
  const totalRowSpan = Math.max(ansparRows.length, kapitalRows.length, payoutRows.length) + 1
  return (
    <>
      {Array.from({ length: totalRowSpan }, (_, idx) => {
        const isFirst = idx === 0
        const isFooter = idx === totalRowSpan - 1
        const a = ansparRows[idx]
        const k = kapitalRows[idx]
        const p = payoutRows[idx]
        return (
          <tr
            key={`${row.productId}-${idx}`}
            className={isFooter ? 'pr-wohin-footer-row' : ''}
          >
            {isFirst ? (
              <td rowSpan={totalRowSpan} className="pr-wohin-label">
                <strong>{row.label}</strong>
              </td>
            ) : null}
            {isFooter ? (
              <>
                <td className="pr-note" colSpan={2}>
                  Effektivkosten p. a.: {formatPercent(row.effectiveAnnualCost, 2)}
                </td>
                <td className="pr-note" colSpan={2}>
                  Verfügbar ab: {row.availabilityLabel}
                </td>
                <td className="pr-note">
                  {row.availabilityNote ?? ''}
                </td>
              </>
            ) : (
              <>
                <td>{a?.label ?? ''}</td>
                <td className="pr-num">{a ? formatWohinValue(a) : ''}</td>
                <td>{k?.label ?? ''}</td>
                <td className="pr-num">{k ? formatWohinValue(k) : ''}</td>
                <td>
                  {p?.label ?? ''}
                  {p ? ` ${formatWohinValue(p)}` : ''}
                </td>
              </>
            )}
          </tr>
        )
      })}
    </>
  )
}

/**
 * Filter `info` rows out of the section line set so they don't compete with
 * monetary rows for table-row alignment. Effektivkosten p. a. is rendered
 * separately in the footer row.
 */
function sectionLines(
  rows: ReadonlyArray<{ kind: string; label: string; value: number }>,
) {
  return rows.filter((r) => r.kind !== 'info')
}

/**
 * Format a Wohin row's value with section-aware rules:
 * - `'sub'` rows render with a leading Unicode minus (the row label already
 *   carries "− ..." in many cases, but for the Kapital section we keep the
 *   minus on the value side per CLAUDE.md "minus on value side" convention).
 * - All other kinds render as plain currency.
 */
function formatWohinValue(row: { kind: string; value: number }): string {
  if (row.kind === 'sub') {
    return formatCurrency(row.value, 0)
  }
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
        {' '}rentenwiki.de/methode
        {' '}— BMF / BMAS-Quellen, jährliche Aktualisierung.
      </p>
    </section>
  )
}

/**
 * Combine-mode "Zusammensetzung" print block. Mirrors Mein Plan § 1
 * (statutory pension leading row + one row per active / paid-up instance).
 */
function ZusammensetzungSection({
  rows,
  retirementAge,
}: {
  rows: ReadonlyArray<PrintZusammenRow>
  retirementAge: number
}) {
  return (
    <section className="pr-section">
      <div className="pr-section-title">Zusammensetzung — Rente mit {retirementAge}</div>
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
              <td className="pr-num">{Math.round(row.share * 100)} %</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pr-note pr-table-note">
        Werte im Basisszenario. Anteil basiert auf der aggregierten Netto-Rente
        nach Steuer und KV/PV.
      </p>
    </section>
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
  return (
    <section className="pr-section">
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
