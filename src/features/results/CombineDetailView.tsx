import './DetailComparisonTable.css'
import './CombineDetailView.css'
import { Download, Printer } from 'lucide-react'
import type { ProductResult } from '../../domain/results'
import type { Workspace } from '../../domain/workspace'
import type { ProductId } from '../../domain'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { InstanceCommon } from '../../domain/instances'
import { getProductMeta } from '../../app/productPresentation'
import { ProvLabel } from './provenance'
import { evidenceStateToProvKind } from './provenanceHelpers'
import { formatCurrency, formatPercent } from '../../utils/format'

/**
 * Per-instance row used by the combine-mode details view (Group G issue 28).
 *
 * One entry per **active or paid-up** instance the user has on the workspace.
 * Surrendered instances are skipped — they no longer contribute to retirement
 * income and cluttering the table with zeroed rows confuses users.
 *
 * Field semantics:
 *   - `productId` is the engine product key (drives the label/color via
 *     `getProductMeta`); v2 supports multiple instances per product so it is
 *     NOT unique within `rows`.
 *   - `instanceLabel` comes from the workspace instance (`label` field),
 *     falling back to the product label when blank.
 *   - `result` is `undefined` when the per-instance simulation produced no
 *     entry for the selected scenario (e.g. surrendered instances are filtered
 *     out before the simulator runs). The row still renders so the user sees
 *     the inventory inventory-side, just with placeholders for derived values.
 *   - `combinedShare` is the back-allocated payout share from the aggregate
 *     `calculateRetirementTax` + KV/PV pipeline. `monthlyNet` here is the
 *     correct contract-level net when multiple taxable sources interact
 *     progressively. Falls back to `result.netMonthlyPayout` only when the
 *     combined pipeline has not produced an entry for this instance.
 */
interface CombineDetailRow {
  instanceId: string
  productId: ProductId
  instanceLabel: string
  status: InstanceCommon['status']
  result: ProductResult | undefined
  /** Back-allocated share from the aggregate retirement-tax + KV/PV pipeline. */
  combinedShare: CombinedResult['byInstance'][string] | undefined
}

interface CombineDetailViewProps {
  workspace: Workspace
  perInstance: Record<string, ProductResult[]>
  selectedScenarioId: string
  selectedScenarioLabel: string
  /**
   * The `CombinedResult` for the active scenario from `useCombineSimulation`.
   * When provided, the "Netto-Rente mtl." column shows the back-allocated
   * `byInstance[id].monthlyNet` from the aggregate progressive tax + KV/PV
   * pipeline instead of the per-instance simulator's `netMonthlyPayout`.
   * Omit or pass `undefined` when the combined pipeline has not yet produced
   * a result for the selected scenario (renders the per-instance fallback).
   */
  combinedForScenario?: CombinedResult | undefined
  onExportCsv: () => void
  onPrint: () => void
}

/**
 * Combine-mode replacement for `DetailComparisonTable` (Group G issue 28).
 *
 * Sources data from the workspace + `simulatePortfolio` output rather than the
 * singleton compare-mode simulation. One row per instance — workspace v2
 * supports multiple instances of the same product type, so we cannot key off
 * `productId` alone.
 *
 * Stays display-only: no engine calls, no tax/fee math beyond what
 * `ProductResult` already exposes. All currency rendering goes through
 * `formatCurrency`; RIY through `formatPercent` (it is a decimal on
 * `ProductResult.accumulationRiy`).
 *
 * Compare-mode keeps using `DetailComparisonTable` unchanged.
 */
export function CombineDetailView({
  workspace,
  perInstance,
  selectedScenarioId,
  selectedScenarioLabel,
  combinedForScenario,
  onExportCsv,
  onPrint,
}: CombineDetailViewProps) {
  const rows = collectRows(workspace, perInstance, selectedScenarioId, combinedForScenario)

  return (
    <section className="table-panel">
      <div className="section-header">
        <div className="combine-detail-heading">
          <div className="combine-detail-kicker">§ Detail</div>
          <h2>Detailansicht (Mein Plan)</h2>
        </div>
        <div className="section-actions">
          <span className="combine-detail-scenario-pill" aria-label="Aktives Szenario">
            Szenario: {selectedScenarioLabel}
          </span>
          <button type="button" className="export-btn" onClick={onExportCsv}>
            <Download size={14} aria-hidden="true" />
            CSV exportieren
          </button>
          <button type="button" className="export-btn" onClick={onPrint}>
            <Printer size={14} aria-hidden="true" />
            PDF drucken
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="combine-detail-empty">
          Noch keine Verträge erfasst. In „Mein Plan“ Bestandsverträge hinzufügen oder eine
          Vorlage öffnen.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="combine-detail-table">
            <thead>
              <tr>
                <th>Vertrag</th>
                <th>Produkttyp</th>
                <th>Status</th>
                <th>Kapital z. Renten&shy;eintritt</th>
                <th>RIY (Effektivkosten)</th>
                <th>Netto-Rente mtl.</th>
                <th>Kapital nach Steuer</th>
                <th>Datenqualität</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <CombineDetailRowView key={row.instanceId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function CombineDetailRowView({ row }: { row: CombineDetailRow }) {
  // `getProductMeta` is typed as `T | undefined` against an arbitrary string,
  // but `row.productId` is the registry-derived `ProductId` union — every
  // member of which has a metadata entry. Fall back defensively so a future
  // refactor doesn't crash the row render.
  const meta = getProductMeta(row.productId) ?? FALLBACK_META
  const result = row.result

  const statusLabel = row.status === 'offered' ? 'Angebot' : STATUS_LABELS[row.status]
  const statusClass = `combine-detail-status combine-detail-status--${row.status}`

  const capital = result?.capitalAtRetirement
  const riy = result?.accumulationRiy
  // Use the back-allocated `monthlyNet` from the aggregate progressive
  // tax + KV/PV pipeline when available. This is the correct contract-level
  // net whenever multiple taxable sources interact (combine mode). Fall back
  // to the per-instance simulator value only when `byInstance` has no entry
  // for this instance (defensive; should not happen in normal operation).
  const monthlyNet = row.combinedShare?.monthlyNet ?? result?.netMonthlyPayout
  if (
    import.meta.env.DEV
    && row.combinedShare === undefined
    && result?.netMonthlyPayout !== undefined
    && (row.status === 'active' || row.status === 'paid_up')
  ) {
    console.warn(
      `[CombineDetailView] back-allocated combinedShare missing for active instance ${row.instanceId}; falling back to per-instance net.`,
    )
  }
  const breakEvenAge = result?.leibrenteBreakEvenAge
  const lumpSum = result?.afterTaxLumpSum

  // Tooltip data for the Netto cell — surfaces the tax/KV-PV cascade so the
  // user can see how the aggregate progressive pipeline apportioned costs to
  // this contract. Only rendered when the combined share is available.
  const combinedShare = row.combinedShare
  const netCellTitle = combinedShare != null
    ? `Steuer ${formatCurrency(combinedShare.taxShareAnnual / 12, 0)} €/mo (${formatCurrency(combinedShare.taxShareAnnual, 0)} €/Jahr) · KV/PV ${formatCurrency(combinedShare.kvPvShare, 0)} €/mo`
    : undefined

  // Provenance pill: lowest-confidence input across all consumed fields for this
  // instance. Missing on the legacy compare-mode path; here it always exists
  // because simulatePortfolio sets it.
  // `evidenceStateToProvKind` is the shared mapping from EvidenceState to the
  // ProvLabel display axes — avoids ad-hoc boolean logic here (issue 13).
  const confidence = result?.inputConfidence
  const provKind = evidenceStateToProvKind(confidence)
  const isModel = provKind === 'model'
  const isConfirmed = provKind === 'confirmed'

  return (
    <tr>
      <td>
        <div className="combine-detail-instance-label">{row.instanceLabel}</div>
      </td>
      <td>
        <span className="combine-detail-product-pill" style={{ background: meta.color }}>
          {meta.shortLabel}
        </span>
      </td>
      <td>
        <span className={statusClass}>{statusLabel}</span>
      </td>
      <td>{capital !== undefined ? formatCurrency(capital, 0) : '–'}</td>
      <td>{riy !== undefined ? formatPercent(riy, 2) : '–'}</td>
      <td title={netCellTitle} aria-label={netCellTitle}>
        {monthlyNet !== undefined ? formatCurrency(monthlyNet, 0) : '–'}
        {breakEvenAge !== undefined && (
          <span className="break-even-note">
            {' '}(Break-even Alter {Math.round(breakEvenAge)})
          </span>
        )}
      </td>
      <td>
        {lumpSum === null
          ? <span className="combine-detail-locked" title="Kapitalauszahlung gesetzlich ausgeschlossen">gesperrt</span>
          : lumpSum !== undefined
            ? formatCurrency(lumpSum, 0)
            : '–'}
      </td>
      <td>
        {confidence !== undefined
          ? <ProvLabel isModified={false} isModel={isModel} isConfirmed={isConfirmed} />
          : <span className="pec-prov pec-prov--default">unbekannt</span>}
      </td>
    </tr>
  )
}

/**
 * Defensive fallback when `getProductMeta` returns `undefined`. Should never
 * fire for a real `ProductId` — the registry covers every union member — but
 * guards future refactors that widen the row type. Kept minimal so a missing
 * lookup doesn't crash the page.
 */
const FALLBACK_META = {
  id: 'unknown',
  label: 'Produkt',
  shortLabel: '?',
  color: '#94a3b8',
  order: 999,
  lockedCapital: false,
  hasFees: false,
  hasEmployerContribution: false,
} as const

const STATUS_LABELS: Record<Exclude<CombineDetailRow['status'], 'offered'>, string> = {
  active: 'aktiv',
  paid_up: 'beitragsfrei',
  surrendered: 'gekündigt',
}

/**
 * Collect every workspace instance into a flat row list, joining per-instance
 * simulation output for the selected scenario.
 *
 * Surrendered instances are dropped — they don't appear in `perInstance`
 * (the adapter skips them) and rendering empty rows would only confuse users.
 * Active and paid_up instances both render; paid_up instances use the
 * existing `initialCapital` policy in the engine to project from frozen
 * capital, so their result is comparable to active ones.
 *
 * `combinedForScenario` provides the back-allocated payout shares from the
 * aggregate progressive tax + KV/PV pipeline. When present, each row gets its
 * `combinedShare` populated from `byInstance[instanceId]` so the netto column
 * can show the correctly apportioned net rather than the per-instance estimate.
 */
function collectRows(
  workspace: Workspace,
  perInstance: Record<string, ProductResult[]>,
  scenarioId: string,
  combinedForScenario: CombinedResult | undefined,
): CombineDetailRow[] {
  const wsa = workspace.baseline.assumptions
  const rows: CombineDetailRow[] = []

  const productSlots: Array<{ id: ProductId; instances: { instanceId: string; label: string; status: InstanceCommon['status'] }[] }> = [
    { id: 'bav', instances: wsa.bav },
    { id: 'etf', instances: wsa.etf },
    { id: 'versicherung', instances: wsa.insurance },
    { id: 'basisrente', instances: wsa.basisrente },
    { id: 'altersvorsorgedepot', instances: wsa.altersvorsorgedepot },
    { id: 'riester', instances: wsa.riester },
  ]

  for (const slot of productSlots) {
    for (const inst of slot.instances) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue
      const meta = getProductMeta(slot.id) ?? FALLBACK_META
      const label = inst.label?.trim().length ? inst.label : meta.label
      const result = perInstance[inst.instanceId]?.find((r) => r.scenarioId === scenarioId)
      const combinedShare = combinedForScenario?.byInstance[inst.instanceId]
      rows.push({
        instanceId: inst.instanceId,
        productId: slot.id,
        instanceLabel: label,
        status: inst.status,
        result,
        combinedShare,
      })
    }
  }

  // Sort: by product order, then alphabetical on instance label so two ETF
  // instances ("Aktien-ETF", "Bonds-ETF") render in a deterministic order
  // independent of insert sequence.
  rows.sort((a, b) => {
    const oa = (getProductMeta(a.productId) ?? FALLBACK_META).order
    const ob = (getProductMeta(b.productId) ?? FALLBACK_META).order
    if (oa !== ob) return oa - ob
    return a.instanceLabel.localeCompare(b.instanceLabel, 'de')
  })

  return rows
}
