import '../../ui/charts.css'
import './FeeDragChart.css'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Coins } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/format';

interface FeeDragChartProps {
  selectedResults: {
    productId: string;
    label: string;
    afterTaxLumpSum: number | null;
    capitalAtRetirement: number;
    totalFees: number;
  }[];
  productColors: Record<string, string>;
}

export function FeeDragChart({ selectedResults, productColors }: FeeDragChartProps) {
  return (
    <section className="chart-panel fee-drag-panel">
      <div className="section-heading">
        <Coins size={18} aria-hidden="true" />
        <div>
          <h2>Gebühren-Vergleich</h2>
          <p>Gebühren (rot) vs. verbleibendes Kapital nach Steuer – im gewählten Szenario.</p>
        </div>
      </div>
      <div className="chart-frame small">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={selectedResults.map((r) => ({
              name: r.label,
              'Kapital n. St.': r.afterTaxLumpSum ?? r.capitalAtRetirement,
              'Gebühren gesamt': r.totalFees,
              productId: r.productId,
            }))}
            margin={{ top: 12, right: 8, left: 0, bottom: 18 }}
          >
            <CartesianGrid strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="name" tickLine={false} />
            <YAxis
              tickFormatter={(value) => `${formatNumber(Number(value) / 1_000)}k`}
              width={64}
            />
            <Tooltip formatter={(value) => formatCurrency(Number(value), 0)} />
            <Legend />
            <Bar dataKey="Kapital n. St." stackId="a">
              {selectedResults.map((r) => (
                <Cell key={r.productId} fill={productColors[r.productId]} />
              ))}
            </Bar>
            <Bar dataKey="Gebühren gesamt" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
