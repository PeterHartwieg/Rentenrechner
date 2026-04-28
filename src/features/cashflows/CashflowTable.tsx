import type { ProductResult } from '../../domain/types'
import { formatCurrency } from '../../utils/format'

type Props = {
  cashflowResult: ProductResult | undefined
  selectedResults: { productId: string; label: string }[]
  cashflowProductId: string
  cashflowAnnualTaxSvSavings: number
  onChangeCashflowProduct: (productId: string) => void
  rowAfterTaxBalance: (
    balance: number,
    cumulativeContributions: number,
    cumulativeVorabpauschale: number,
  ) => number | null
}

export function CashflowTable({
  cashflowResult,
  selectedResults,
  cashflowProductId,
  cashflowAnnualTaxSvSavings,
  onChangeCashflowProduct,
  rowAfterTaxBalance,
}: Props) {
  return (
    <section className="table-panel cashflow-panel">
      <div className="cashflow-header">
        <h2>Jahres-Cashflows</h2>
        <div className="cashflow-selector">
          <label htmlFor="cashflow-product">Produkt</label>
          <select
            id="cashflow-product"
            value={cashflowProductId}
            onChange={(event) => onChangeCashflowProduct(event.target.value)}
          >
            {selectedResults.map((r) => (
              <option key={r.productId} value={r.productId}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {cashflowResult ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Alter</th>
                <th>Nettoaufwand p.a.</th>
                <th>Beitrag p.a.</th>
                <th>AG-Anteil p.a.</th>
                <th>Steuer-/SV-Ersparnis</th>
                <th>Gebühren p.a.</th>
                <th>Kum. Gebühren</th>
                <th>Kapital</th>
                <th>Kapital n. St.</th>
                <th>Reales Kapital</th>
                <th>Real n. St.</th>
              </tr>
            </thead>
            <tbody>
              {cashflowResult.rows.map((row) => {
                const afterTax = rowAfterTaxBalance(row.balance, row.cumulativeProductContributions, row.cumulativeVorabpauschale)
                const realAfterTax =
                  afterTax !== null && row.balance > 0
                    ? afterTax * (row.realBalance / row.balance)
                    : null
                return (
                  <tr key={row.year}>
                    <td style={{ textAlign: 'left' }}>{row.age}</td>
                    <td>{formatCurrency(row.yearlyUserCost, 0)}</td>
                    <td>{formatCurrency(row.yearlyProductContribution, 0)}</td>
                    <td>{formatCurrency(row.yearlyEmployerContribution, 0)}</td>
                    <td>
                      {cashflowAnnualTaxSvSavings > 0
                        ? formatCurrency(cashflowAnnualTaxSvSavings, 0)
                        : '—'}
                    </td>
                    <td>{formatCurrency(row.yearlyFees, 0)}</td>
                    <td>{formatCurrency(row.cumulativeFees, 0)}</td>
                    <td>{formatCurrency(row.balance, 0)}</td>
                    <td>{afterTax !== null ? formatCurrency(afterTax, 0) : '—'}</td>
                    <td>{formatCurrency(row.realBalance, 0)}</td>
                    <td>{realAfterTax !== null ? formatCurrency(realAfterTax, 0) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td style={{ textAlign: 'left' }}>Gesamt</td>
                <td>{formatCurrency(cashflowResult.totalUserCost, 0)}</td>
                <td>{formatCurrency(cashflowResult.totalProductContributions, 0)}</td>
                <td>{formatCurrency(cashflowResult.totalEmployerContributions, 0)}</td>
                <td>
                  {cashflowResult.taxAndSvSavings > 0
                    ? formatCurrency(cashflowResult.taxAndSvSavings, 0)
                    : '—'}
                </td>
                <td>{formatCurrency(cashflowResult.totalFees, 0)}</td>
                <td>{formatCurrency(cashflowResult.totalFees, 0)}</td>
                <td>{formatCurrency(cashflowResult.capitalAtRetirement, 0)}</td>
                <td>
                  {cashflowResult.afterTaxLumpSum !== null
                    ? formatCurrency(cashflowResult.afterTaxLumpSum, 0)
                    : '—'}
                </td>
                <td>{formatCurrency(cashflowResult.realCapitalAtRetirement, 0)}</td>
                <td>
                  {cashflowResult.afterTaxLumpSum !== null && cashflowResult.capitalAtRetirement > 0
                    ? formatCurrency(
                        cashflowResult.afterTaxLumpSum *
                          (cashflowResult.realCapitalAtRetirement / cashflowResult.capitalAtRetirement),
                        0,
                      )
                    : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
      {cashflowResult?.etfPayoutRows && cashflowResult.etfPayoutRows.length > 0 && (
        <div className="payout-phase">
          <h3 className="payout-phase-heading">Rentenphase (ETF-Entnahme)</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Alter</th>
                  <th>Kapital</th>
                  <th>Brutto mtl.</th>
                  <th>Steuerpfl. Gewinn</th>
                  <th>Sparerpauschb.</th>
                  <th>Steuer</th>
                  <th>Netto mtl.</th>
                  <th>Kapital Ende</th>
                </tr>
              </thead>
              <tbody>
                {cashflowResult.etfPayoutRows.map((row) => (
                  <tr key={row.year}>
                    <td style={{ textAlign: 'left' }}>{row.age}</td>
                    <td>{formatCurrency(row.capitalAtStart, 0)}</td>
                    <td>{formatCurrency(row.grossAnnualPayout / 12, 0)}</td>
                    <td>{formatCurrency(row.taxableGain, 0)}</td>
                    <td>{formatCurrency(row.saverAllowanceUsed, 0)}</td>
                    <td>{formatCurrency(row.taxDue, 0)}</td>
                    <td>{formatCurrency(row.netMonthlyPayout, 0)}</td>
                    <td>{formatCurrency(row.capitalAtEnd, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
