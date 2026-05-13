import { formatCurrency, formatPercent } from '../../utils/format'
import { getProductMeta } from '../../engine/productRegistry'
import type { ProductId } from '../../domain/products/common'

export type RetirementHealthStatus = 'kvdr' | 'freiwillig_gkv' | 'pkv'

interface KvPvEntry {
  productId: ProductId
  label: string
  grossMonthlyPayout: number
  kvPvMonthly: number
}

interface Props {
  selectedResults: KvPvEntry[]
  monthlyKvPvBbg: number
  /** Combined gross monthly income across all retirement income sources (products + GRV). */
  combinedGrossMonthly: number
  healthStatus: RetirementHealthStatus
}

export function KvPvLastPanel({ selectedResults, monthlyKvPvBbg, combinedGrossMonthly, healthStatus }: Props) {
  const bbgFillPct = Math.min(combinedGrossMonthly / monthlyKvPvBbg, 1) * 100
  const exceedsBbg = combinedGrossMonthly > monthlyKvPvBbg
  const healthLabel =
    healthStatus === 'kvdr'
      ? 'KVdR-Pflichtversichert'
      : healthStatus === 'freiwillig_gkv'
        ? 'Freiwillig GKV-versichert'
        : 'Privat versichert (PKV)'

  const healthExplainer =
    healthStatus === 'kvdr'
      ? 'Als KVdR-Mitglied zahlen Sie KV/PV nur auf Versorgungsbezuege (z. B. bAV); private Rentenversicherung, Basisrente, AVD und Riester sind fuer KVdR-Mitglieder beitragsfrei.'
      : healthStatus === 'freiwillig_gkv'
        ? 'Als freiwillig GKV-Versicherte/r wird das gesamte Renteneinkommen bis zur BBG mit dem allgemeinen Beitragssatz verbeitragt.'
        : 'PKV-Versicherte zahlen keine gesetzlichen KV/PV-Beitraege auf Renteneinkunefte.'

  return (
    <div className="assumption-panel">
      <div className="section-heading">
        <h2>KV/PV-Last</h2>
      </div>

      <p>
        Monatliche Kranken- und Pflegeversicherungsbeitraege auf Renteneinkunefte.{' '}
        <strong>{healthLabel}</strong>. {healthExplainer}
      </p>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
          <span>GRV-Rente: <strong>{formatCurrency(combinedGrossMonthly, 0)}/Monat</strong></span>
          <span>BBG: <strong>{formatCurrency(monthlyKvPvBbg, 0)}/Monat</strong></span>
        </div>
        <div
          role="meter"
          aria-label={`GRV-Rente ${formatCurrency(combinedGrossMonthly, 0)} von BBG ${formatCurrency(monthlyKvPvBbg, 0)}`}
          style={{
            height: '10px',
            background: '#e5e7eb',
            borderRadius: '5px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${bbgFillPct}%`,
              height: '100%',
              background: exceedsBbg ? '#ef4444' : '#0f766e',
              borderRadius: '5px',
              transition: 'width 0.3s',
            }}
          />
        </div>
        {exceedsBbg && (
          <p className="small-print" style={{ marginTop: '4px', color: '#dc2626' }}>
            GRV-Rente uebersteigt BBG. KV/PV wird anteilig auf alle Einkommensquellen verteilt (proportionale Aufteilung nach §240 SGB V).
          </p>
        )}
      </div>

      <table className="detail-comparison-table">
        <thead>
          <tr>
            <th>Produkt</th>
            <th>Brutto-Rente</th>
            <th>KV/PV/Monat</th>
            <th>KV/PV in %</th>
          </tr>
        </thead>
        <tbody>
          {selectedResults.map((r) => {
            const meta = getProductMeta(r.productId)
            const label = meta?.label ?? r.label
            const kvPvPct = r.grossMonthlyPayout > 0 ? r.kvPvMonthly / r.grossMonthlyPayout : 0
            return (
              <tr key={r.productId}>
                <td>{label}</td>
                <td>{formatCurrency(r.grossMonthlyPayout, 0)}</td>
                <td>{formatCurrency(r.kvPvMonthly, 0)}</td>
                <td>{formatPercent(kvPvPct)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="small-print">
        KV/PV berechnet via calculateRetirementKvPv. ETF (Kapitalverzehr) unterliegt keiner KV/PV.
        Die GRV ist im Gesamteinkommen enthalten, aber nicht einzeln aufgefuehrt.
      </p>
    </div>
  )
}
