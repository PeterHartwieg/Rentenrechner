import './DetailComparisonTable.css'
import { Check, Link, Download, Printer } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/format';

interface DetailComparisonTableProps {
  products: {
    productId: string;
    label: string;
    scenarioLabel: string;
    monthlyUserCost: number;
    monthlyProductContribution: number;
    capitalAtRetirement: number;
    afterTaxLumpSum: number | null;
    netMonthlyPayout: number;
    leibrenteBreakEvenAge?: number;
    totalFees: number;
    valueMultipleOnUserCost: number | null;
    scenarioId: string;
  }[];
  linkCopied: boolean;
  /** When undefined the share button is hidden (e.g. combine mode where v1 share links drop portfolio state). */
  onCopyLink?: () => void;
  onExportCsv: () => void;
  onPrint: () => void;
}

export function DetailComparisonTable({
  products,
  linkCopied,
  onCopyLink,
  onExportCsv,
  onPrint,
}: DetailComparisonTableProps) {
  return (
    <section className="table-panel">
      <div className="section-header">
        <h2>Detailvergleich</h2>
        <div className="section-actions">
          {onCopyLink !== undefined && (
            <button type="button" className="export-btn" onClick={onCopyLink}>
              {linkCopied
                ? <Check size={14} aria-hidden="true" />
                : <Link size={14} aria-hidden="true" />}
              {linkCopied ? 'Kopiert!' : 'Link kopieren'}
            </button>
          )}
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
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Produkt</th>
              <th>Szenario</th>
              <th>Nettoaufwand mtl.</th>
              <th>Beitrag mtl.</th>
              <th>Kapital</th>
              <th>Kapital nach Steuer</th>
              <th>Netto-Rente</th>
              <th>Kosten</th>
              <th>Faktor</th>
            </tr>
          </thead>
          <tbody>
            {products.map((result) => (
              <tr key={`${result.productId}-${result.scenarioId}`}>
                <td>{result.label}</td>
                <td>{result.scenarioLabel}</td>
                <td>{formatCurrency(result.monthlyUserCost, 0)}</td>
                <td>{formatCurrency(result.monthlyProductContribution, 0)}</td>
                <td>{formatCurrency(result.capitalAtRetirement, 0)}</td>
                <td>
                  {result.afterTaxLumpSum === null
                    ? '-'
                    : formatCurrency(result.afterTaxLumpSum, 0)}
                </td>
                <td>
                  {formatCurrency(result.netMonthlyPayout, 0)}
                  {result.leibrenteBreakEvenAge !== undefined && (
                    <span className="break-even-note">
                      {' '}(Break-even Alter {Math.round(result.leibrenteBreakEvenAge)})
                    </span>
                  )}
                </td>
                <td>{formatCurrency(result.totalFees, 0)}</td>
                <td>
                  {result.valueMultipleOnUserCost === null
                    ? '-'
                    : `${formatNumber(result.valueMultipleOnUserCost, 1)}x`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
