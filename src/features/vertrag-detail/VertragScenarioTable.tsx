import { useMemo, useState } from 'react'
import type { Workspace } from '../../domain/workspace'
import type {
  InstanceCommon,
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
} from '../../domain/instances'
import type { GermanRules } from '../../domain'
import type { ProductId } from '../../domain/products/common'
import type { CombinedResult } from '../../engine/portfolioCombine'
import {
  generateContractDecisions,
  beitragErhoehenWhatIf,
  beitragSenkenWhatIf,
  defaultBeitragErhoehenEUR,
  defaultBeitragSenkenEUR,
  type ContractDecision,
} from '../../app/contractDecisions'
import { createDecisionSimulationCache } from '../../app/optimiereVorsorge'
import { formatCurrency } from '../../utils/format'

interface Props {
  workspace: Workspace
  instance: InstanceCommon
  /**
   * Canonical `ProductId` for this instance (e.g. `'bav'`, `'versicherung'`).
   * Threaded from `VertragDetailPage` so the per-slot contribution-field
   * lookup is dispatched via an exhaustive `switch` on the union literal
   * rather than ad-hoc field probing on the structural `InstanceCommon`.
   */
  productId: ProductId
  rules: GermanRules
  scenarioId: string
  /** Baseline combined household result for the selected scenario. */
  combinedForScenario: CombinedResult | undefined
}

interface ScenarioRow {
  id: string
  /** Card-style label shown in the first column ("Weiterführen wie bisher" etc.). */
  label: string
  /** Auxiliary description ("Beitrag erhöht um …", …). */
  detail: string
  /** Resulting combined Netto-Rente in EUR/month for this scenario. */
  resultingNetMonthly: number | null
  /** EUR/month difference vs. the current state (weiterfuehren ⇒ 0). */
  delta: number
  /** Drives the ▸ marker + paper background row. */
  isCurrent: boolean
}

/**
 * VertragScenarioTable — § 2 "Was wäre, wenn …" on Vertrag-Detail (PR 7).
 *
 * Renders one row per applicable decision atom from
 * `generateContractDecisions`, plus a paired Beitrag-up / Beitrag-down row
 * pair around the current contribution (via the dedicated
 * `beitragErhoehenWhatIf` / `beitragSenkenWhatIf` helpers). Deltas are the
 * difference in combined household Netto-Rente between the applied
 * decision and the baseline `combinedForScenario`.
 *
 * Voice rules (plan §1): no winner, no recommendation. Positive deltas
 * read neutral ink, negative deltas read oxblood, the current row is
 * flagged with `▸` but without coach adjectives.
 */
export function VertragScenarioTable({
  workspace,
  instance,
  productId,
  rules,
  scenarioId,
  combinedForScenario,
}: Props) {
  // Simulation cache is page-scoped — a fresh cache lives for the
  // lifetime of this table mount and invalidates on workspace identity
  // change through the underlying `simulateContractDecision` plumbing.
  // Memoised so the cache instance is stable across re-renders.
  const [cache] = useState(() => createDecisionSimulationCache())

  const rows = useMemo<ScenarioRow[]>(() => {
    if (!combinedForScenario) return []
    return buildScenarioRows({
      workspace,
      instance,
      productId,
      rules,
      scenarioId,
      baselineCombined: combinedForScenario,
      cache,
    })
  }, [workspace, instance, productId, rules, scenarioId, combinedForScenario, cache])

  return (
    <section className="vertrag-section" aria-labelledby="vertrag-section-was-waere">
      <div className="vertrag-section-head">
        <span className="vertrag-section-num">§ 1</span>
        <h2 id="vertrag-section-was-waere" className="vertrag-section-title">
          Was wäre, wenn du diesen Vertrag anders führst?
        </h2>
      </div>

      {rows.length > 0 ? (
        <table className="vertrag-scenario-table">
          <thead>
            <tr>
              <th>Szenario</th>
              <th>Was sich ändert</th>
              <th className="vertrag-num">Netto-Rente</th>
              <th className="vertrag-num">Δ ggü. heute</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ScenarioRowView key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className="vertrag-scenario-empty">
          Für diesen Vertrag stehen derzeit keine Szenarien zur Verfügung — vermutlich ist er bereits gekündigt oder das Angebot ist noch nicht aktiviert.
        </p>
      )}
    </section>
  )
}

interface BuildRowsInput {
  workspace: Workspace
  instance: InstanceCommon
  productId: ProductId
  rules: GermanRules
  scenarioId: string
  baselineCombined: CombinedResult
  cache: ReturnType<typeof createDecisionSimulationCache>
}

/**
 * Assemble the ordered row list. Pure derivation off the workspace +
 * baseline — exposed verbatim by the table component so unit tests can
 * exercise the row shape without rendering.
 *
 * Order (mirrors mock M4a):
 *   1. Weiterführen wie bisher (current marker)
 *   2. Beitrag erhöhen auf X € (when contribution > 0)
 *   3. Beitrag senken auf Y € (when contribution > €10)
 *   4. Beitragsfrei stellen (slot-eligible)
 *   5. Kündigen (slot-eligible, not Basisrente)
 *   6+. Übertragen auf [target] (max 2 entries — same cap as `generateContractDecisions`)
 *
 * Surrendered / offered instances return an empty array — the table's
 * caller renders the empty state instead.
 */
function buildScenarioRows({
  workspace,
  instance,
  productId,
  rules,
  scenarioId,
  baselineCombined,
  cache,
}: BuildRowsInput): ScenarioRow[] {
  if (instance.status === 'surrendered' || instance.status === 'offered') return []

  const decisions = generateContractDecisions(workspace, instance.instanceId)

  // Inject the Beitrag-up / Beitrag-down decisions when the contract has
  // a non-zero contribution. They sit right after `weiterfuehren` to
  // anchor the table on the contribution axis (matches mock M4a / TVertrag).
  const currentMonthly = extractCurrentMonthly(instance, productId)
  const upDefault = defaultBeitragErhoehenEUR(currentMonthly)
  const downDefault = defaultBeitragSenkenEUR(currentMonthly)
  const upDecision = upDefault > currentMonthly
    ? beitragErhoehenWhatIf(workspace, instance.instanceId, upDefault)
    : null
  const downDecision = downDefault !== null
    ? beitragSenkenWhatIf(workspace, instance.instanceId, downDefault)
    : null

  const ordered: (ContractDecision | null)[] = []
  for (const d of decisions) {
    ordered.push(d)
    if (d.kind === 'weiterfuehren') {
      // Slot the contribution-up / down pair adjacent to the current row.
      ordered.push(upDecision)
      ordered.push(downDecision)
    }
  }

  const rows: ScenarioRow[] = []
  for (const decision of ordered) {
    if (!decision) continue
    const isCurrent = decision.kind === 'weiterfuehren'
    let delta = 0
    let resulting: number | null = baselineCombined.monthlyNetIncome
    if (!isCurrent) {
      try {
        const computed = cache.get(workspace, decision, rules, baselineCombined, scenarioId)
        delta = computed.deltaMonthlyNetEUR
        resulting = baselineCombined.monthlyNetIncome + delta
      } catch {
        delta = 0
        resulting = null
      }
    }
    rows.push({
      id: decision.id,
      label: decision.label,
      detail: scenarioDetailFor(decision),
      resultingNetMonthly: resulting,
      delta,
      isCurrent,
    })
  }
  return rows
}

/**
 * Read the per-product "Beitrag heute" field for a single instance.
 *
 * Dispatches on the canonical `ProductId` via an exhaustive `switch` so the
 * compiler enforces full slot coverage (the `never` default catches any
 * future product addition). Each slot reads from its typed instance shape —
 * `BavInstance.monthlyGrossConversion` and friends — rather than probing
 * structural keys on the base `InstanceCommon`. This mirrors how the
 * engine's per-slot funding pipeline reads contribution fields (e.g.
 * `portfolioFunding.ts` slot helpers), so the value used to seed the
 * Beitrag-up / Beitrag-down defaults can never drift from the simulation
 * model. Paid-up instances always return 0 regardless of the stored
 * contribution — the engine ignores the field for paid_up status.
 */
function extractCurrentMonthly(
  instance: InstanceCommon,
  productId: ProductId,
): number {
  if (instance.status === 'paid_up') return 0
  switch (productId) {
    case 'etf':
      return (instance as EtfInstance).monthlyContribution ?? 0
    case 'versicherung':
      return (instance as InsuranceInstance).monthlyContribution ?? 0
    case 'bav':
      return (instance as BavInstance).monthlyGrossConversion
    case 'basisrente':
      return (instance as BasisrenteInstance).monthlyGrossContribution
    case 'altersvorsorgedepot':
      return (instance as AltersvorsorgedepotInstance).monthlyOwnContribution
    case 'riester':
      return (instance as RiesterInstance).monthlyOwnContribution
    default: {
      const _exhaustive: never = productId
      void _exhaustive
      return 0
    }
  }
}

/**
 * Short description for the second column. Routes off the discriminated
 * `kind` so the `never` default catches any future decision atom.
 */
function scenarioDetailFor(decision: ContractDecision): string {
  switch (decision.kind) {
    case 'weiterfuehren':
      return 'keine Änderung — diese Zeile dient als Referenz'
    case 'beitrag-erhoehen': {
      const eur = decision.workspaceDelta.kind === 'increase_contribution'
        ? decision.workspaceDelta.newMonthlyEUR
        : 0
      return `Beitrag auf ${formatCurrency(eur, 0)} / Mon. erhöhen`
    }
    case 'beitrag-senken': {
      const eur = decision.workspaceDelta.kind === 'increase_contribution'
        ? decision.workspaceDelta.newMonthlyEUR
        : 0
      return `Beitrag auf ${formatCurrency(eur, 0)} / Mon. senken`
    }
    case 'beitragsfrei':
      return 'keine weiteren Einzahlungen, Bestand bleibt investiert'
    case 'kuendigen':
      return 'Vertrag wird aufgelöst (Stornoabzug & Steuer beachten)'
    case 'uebertragen':
      return 'Guthaben wird auf einen anderen Vertrag übertragen'
    default: {
      const _exhaustive: never = decision.kind
      void _exhaustive
      return ''
    }
  }
}

function ScenarioRowView({ row }: { row: ScenarioRow }) {
  const sign: 'pos' | 'neg' | 'neutral' = Math.abs(row.delta) < 1
    ? 'neutral'
    : row.delta > 0 ? 'pos' : 'neg'
  const deltaText = row.delta === 0 || sign === 'neutral'
    ? '—'
    : `${row.delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(row.delta), 0)}`
  return (
    <tr className={row.isCurrent ? 'vertrag-scenario-row vertrag-scenario-row--current' : 'vertrag-scenario-row'}>
      <td>
        {row.isCurrent && <span className="vertrag-scenario-marker" aria-hidden="true">▸</span>}
        <span className="vertrag-scenario-label">{row.label}</span>
      </td>
      <td className="vertrag-scenario-detail">{row.detail}</td>
      <td className="vertrag-num">
        {row.resultingNetMonthly === null
          ? '—'
          : formatCurrency(row.resultingNetMonthly, 0)}
      </td>
      <td className={`vertrag-num vertrag-scenario-delta vertrag-scenario-delta--${sign}`}>
        {deltaText}
      </td>
    </tr>
  )
}
