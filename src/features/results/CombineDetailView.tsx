import './DetailComparisonTable.css'
import './CombineDetailView.css'
import { Download, Printer } from 'lucide-react'
import type { ProductResult } from '../../domain/results'
import type { Workspace } from '../../domain/workspace'
import type { ProductId } from '../../domain'
import { getProductMeta } from '../../app/productPresentation'
import { ProvLabel } from './provenance'
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
 */
interface CombineDetailRow {
  instanceId: string
  productId: ProductId
  instanceLabel: string
  status: 'active' | 'paid_up' | 'surrendered'
  result: ProductResult | undefined
}

interface CombineDetailViewProps {
  workspace: Workspace
  perInstance: Record<string, ProductResult[]>
  selectedScenarioId: string
  selectedScenarioLabel: string
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
  onExportCsv,
  onPrint,
}: CombineDetailViewProps) {
  const rows = collectRows(workspace, perInstance, selectedScenarioId)

  return (
    <section className="table-panel">
      <div className="section-header">
        <h2>Detailansicht (Mein Plan)</h2>
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
          Noch keine Verträge im Workspace. Im Tab „Mein Plan“ kannst du Bestandsverträge
          hinzufügen oder einen Empfehlungs-Plan übernehmen.
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

  const statusLabel = STATUS_LABELS[row.status]
  const statusClass = `combine-detail-status combine-detail-status--${row.status}`

  const capital = result?.capitalAtRetirement
  const riy = result?.accumulationRiy
  const monthlyNet = result?.netMonthlyPayout
  const breakEvenAge = result?.leibrenteBreakEvenAge
  const lumpSum = result?.afterTaxLumpSum

  // Provenance pill: lowest-confidence input across all consumed fields for this
  // instance. Missing on the legacy compare-mode path; here it always exists
  // because simulatePortfolio sets it. We map the three EvidenceState values
  // onto ProvLabel's two-axis (modified/model) signal — `user_confirmed` and
  // `statement` both render as confirmed, `model_estimate` renders as model.
  const confidence = result?.inputConfidence
  const isModel = confidence === 'model_estimate'
  const isConfirmed = confidence === 'user_confirmed' || confidence === 'statement'

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
      <td>
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

const STATUS_LABELS: Record<CombineDetailRow['status'], string> = {
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
 */
function collectRows(
  workspace: Workspace,
  perInstance: Record<string, ProductResult[]>,
  scenarioId: string,
): CombineDetailRow[] {
  const wsa = workspace.baseline.assumptions
  const rows: CombineDetailRow[] = []

  const productSlots: Array<{ id: ProductId; instances: { instanceId: string; label: string; status: 'active' | 'paid_up' | 'surrendered' }[] }> = [
    { id: 'bav', instances: wsa.bav },
    { id: 'etf', instances: wsa.etf },
    { id: 'versicherung', instances: wsa.insurance },
    { id: 'basisrente', instances: wsa.basisrente },
    { id: 'altersvorsorgedepot', instances: wsa.altersvorsorgedepot },
    { id: 'riester', instances: wsa.riester },
  ]

  for (const slot of productSlots) {
    for (const inst of slot.instances) {
      if (inst.status === 'surrendered') continue
      const meta = getProductMeta(slot.id) ?? FALLBACK_META
      const label = inst.label?.trim().length ? inst.label : meta.label
      const result = perInstance[inst.instanceId]?.find((r) => r.scenarioId === scenarioId)
      rows.push({
        instanceId: inst.instanceId,
        productId: slot.id,
        instanceLabel: label,
        status: inst.status,
        result,
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
