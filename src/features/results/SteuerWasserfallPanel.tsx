import { Landmark } from 'lucide-react'
import type { ProductResult } from '../../domain'
import { getProductMeta } from '../../engine/productRegistry'
import { formatCurrency } from '../../utils/format'

interface Props {
  selectedResults: Pick<
    ProductResult,
    'productId' | 'label' | 'grossMonthlyPayout' | 'netMonthlyPayout'
  >[]
}

export function SteuerWasserfallPanel({ selectedResults }: Props) {
  return (
    <section className="chart-panel">
      <div className="section-heading">
        <Landmark size={18} aria-hidden="true" />
        <div>
          <h2>Steuer-Wasserfall</h2>
          <p>Monatliche Brutto-Rente → Steuer &amp; KV/PV → Netto-Rente im Vergleich</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
        {selectedResults.map((r) => {
          const color = getProductMeta(r.productId)?.color ?? '#94a3b8'
          const deduction = Math.max(0, r.grossMonthlyPayout - r.netMonthlyPayout)
          const deductionPct =
            r.grossMonthlyPayout > 0 ? deduction / r.grossMonthlyPayout : 0
          return (
            <div
              key={r.productId}
              style={{
                borderLeft: `3px solid ${color}`,
                paddingLeft: '0.75rem',
              }}
            >
              <strong style={{ color }}>{r.label}</strong>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.25rem', fontSize: '0.875rem' }}>
                <tbody>
                  <tr>
                    <td>Brutto-Rente</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(r.grossMonthlyPayout, 0)}/Monat</td>
                  </tr>
                  <tr style={{ color: '#ef4444' }}>
                    <td>− Steuer &amp; KV/PV ({Math.round(deductionPct * 100)} %)</td>
                    <td style={{ textAlign: 'right' }}>−{formatCurrency(deduction, 0)}/Monat</td>
                  </tr>
                  <tr style={{ fontWeight: 600 }}>
                    <td>= Netto-Rente</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(r.netMonthlyPayout, 0)}/Monat</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </section>
  )
}
