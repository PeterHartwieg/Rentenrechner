import '../../ui/charts.css'
import './FeeDragChart.css'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Coins } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/format';
import { getProductMeta } from '../../engine/productRegistry';
import { LIFECYCLE_HORIZON_AGE } from './lifecycleHorizon';

interface FeeDragChartProps {
  selectedResults: {
    productId: string;
    label: string;
    netMonthlyPayout: number;
    payoutEndAge?: number;
    totalFees: number;
    totalUserCost: number;
    etfPayoutRows?: { netAnnualPayout: number }[];
  }[];
  productColors: Record<string, string>;
  retirementAge: number;
  retirementEndAge: number;
}

const LEGEND_ITEMS = [
  { color: '#0ea5e9', label: 'Nettoaufwand gesamt' },
  { color: '#22c55e', label: 'Netto-Rendite' },
  { color: '#ef4444', label: 'Gebühren gesamt' },
];

function ColoredXAxisTick({
  x, y, payload, labelToColor,
}: {
  x?: string | number; y?: string | number;
  payload?: { value: string };
  labelToColor: Record<string, string>;
}) {
  if (!payload) return null;
  const color = labelToColor[payload.value] ?? '#6b7280';
  const yPos = typeof y === 'number' ? y : Number(y ?? 0);
  return (
    <text x={x} y={yPos + 12} textAnchor="middle" fill={color} fontSize={12} fontWeight={600}>
      {payload.value}
    </text>
  );
}

export function FeeDragChart({
  selectedResults,
  productColors,
  retirementAge,
  retirementEndAge,
}: FeeDragChartProps) {
  const comparisonEndAge = Math.max(LIFECYCLE_HORIZON_AGE, retirementEndAge);
  const labelToColor = Object.fromEntries(
    selectedResults.map((r) => [getProductMeta(r.productId as Parameters<typeof getProductMeta>[0])?.shortLabel ?? r.label, productColors[r.productId]])
  );

  return (
    <section className="chart-panel fee-drag-panel">
      <div className="section-heading">
        <Coins size={18} aria-hidden="true" />
        <div>
          <h2>Gebühren-Vergleich</h2>
          <p>
            Eingezahlter Nettoaufwand bis Rentenbeginn vs. kumulierte Netto-Auszahlungen bis
            Alter {comparisonEndAge} (bzw. Vertragsende) und Gesamtgebühren – im gewählten Szenario.
          </p>
        </div>
      </div>
      <div className="chart-frame small fee-drag-chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={selectedResults.map((r) => {
              const endAge = r.payoutEndAge ?? comparisonEndAge;
              const payoutYears = Math.max(0, endAge - retirementAge);
              const cumulativeNetPayouts = r.etfPayoutRows
                ? r.etfPayoutRows.reduce((sum, row) => sum + row.netAnnualPayout, 0)
                : r.netMonthlyPayout * 12 * payoutYears;
              const contributed = Math.min(r.totalUserCost, cumulativeNetPayouts);
              const gain = Math.max(cumulativeNetPayouts - contributed, 0);
              return {
                name: getProductMeta(r.productId as Parameters<typeof getProductMeta>[0])?.shortLabel ?? r.label,
                'Nettoaufwand gesamt': contributed,
                'Netto-Rendite': gain,
                'Gebühren gesamt': r.totalFees,
                productId: r.productId,
              };
            })}
            margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              tick={(props) => <ColoredXAxisTick {...props} labelToColor={labelToColor} />}
              interval={0}
            />
            <YAxis
              tickFormatter={(value) => `${formatNumber(Number(value) / 1_000)}k`}
              width={64}
            />
            <Tooltip formatter={(value) => formatCurrency(Number(value), 0)} />
            <Bar dataKey="Nettoaufwand gesamt" stackId="a" fill="#0ea5e9" isAnimationActive={false} />
            <Bar dataKey="Netto-Rendite" stackId="a" fill="#22c55e" isAnimationActive={false} />
            <Bar dataKey="Gebühren gesamt" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
        <div className="fee-drag-legend fee-drag-legend--overlay">
          {LEGEND_ITEMS.map(({ color, label }) => (
            <span key={label} className="fee-drag-legend__item">
              <span className="fee-drag-legend__swatch" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
