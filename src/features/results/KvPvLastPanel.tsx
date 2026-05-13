import { formatCurrency, formatPercent } from '../../utils/format'
import { getProductMeta } from '../../engine/productRegistry'

interface KvPvEntry {
  productId: string
  label: string
  grossMonthlyPayout: number
  netMonthlyPayout: number
}

interface Props {
  selectedResults: KvPvEntry[]
  monthlyKvPvBbg: number
}

export function KvPvLastPanel({ selectedResults, monthlyKvPvBbg }: Props) {
  return (
    <div className="assumption-panel">
      <div className="section-heading">
        <h2>KV/PV-Last</h2>
      </div>
      <p>
        Monatliche Kranken- und Pflegeversicherungsbeiträge im Rentenalter (GKV-Pflichtversicherte).
        Versorgungsbezüge (bAV, pAV) unterliegen dem vollen KV/PV-Beitragssatz; die gesetzliche
        Rente dem halben Arbeitnehmer-Anteil. BBG: {formatCurrency(monthlyKvPvBbg, 0)}/Monat.
      </p>
      <table className="detail-comparison-table">
        <thead>
          <tr>
            <th>Produkt</th>
            <th>Brutto-Rente</th>
            <th>Netto-Rente</th>
            <th>Abzüge gesamt</th>
            <th>Abzüge in %</th>
          </tr>
        </thead>
        <tbody>
          {selectedResults.map((r) => {
            const meta = getProductMeta(r.productId)
            const label = meta?.label ?? r.label
            const deductions = r.grossMonthlyPayout - r.netMonthlyPayout
            const deductionPct = r.grossMonthlyPayout > 0
              ? deductions / r.grossMonthlyPayout
              : 0
            return (
              <tr key={r.productId}>
                <td>{label}</td>
                <td>{formatCurrency(r.grossMonthlyPayout, 0)}</td>
                <td>{formatCurrency(r.netMonthlyPayout, 0)}</td>
                <td>{formatCurrency(deductions, 0)}</td>
                <td>{formatPercent(deductionPct)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="small-print">
        Abzüge umfassen Einkommensteuer, KV und PV. KV/PV gilt nur für GKV-Versicherte.
        ETF (Kapitalverzehr) unterliegt keiner KV/PV auf Auszahlungen.
      </p>
    </div>
  )
}
