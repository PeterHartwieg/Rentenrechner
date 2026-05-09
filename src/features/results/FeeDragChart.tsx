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
import { qaTargetAttrs, useFeedbackTarget } from '../qa-feedback/useFeedbackTarget';
import { useQaMode } from '../qa-feedback/useQaMode';
import { buildFeeDragChartData, type FeeDragResultEntry } from './feeDragChartData';

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

  const { targetProps: containerTargetProps } = useFeedbackTarget({
    id: 'results.feeDragChart.container',
    label: 'Gebühren-Vergleich-Chart',
    precision: 'section',
  });
  const { targetProps: legendTargetProps } = useFeedbackTarget({
    id: 'results.feeDragChart.legend',
    label: 'Gebühren-Vergleich-Chart Legende',
    precision: 'section',
  });
  const { enabled: qaEnabled } = useQaMode();

  return (
    <section className="chart-panel fee-drag-panel" {...containerTargetProps}>
      <div className="section-heading">
        <Coins size={18} aria-hidden="true" />
        <div>
          <h2>Gebühren-Vergleich</h2>
          <p>
            Kumulierte Netto-Auszahlungen bis Alter {comparisonEndAge} (blau + grün) vs.
            Gesamtgebühren (rot, separate Säule) – im gewählten Szenario.
          </p>
        </div>
      </div>
      <div className="fee-drag-chart-wrap">
        <div className="chart-frame small">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={buildFeeDragChartData(selectedResults, retirementAge, comparisonEndAge)}
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
              <Bar dataKey="Netto-Rendite" stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="Gebühren gesamt" stackId="b" fill="#ef4444" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="fee-drag-legend fee-drag-legend--overlay" {...legendTargetProps}>
          {LEGEND_ITEMS.map(({ color, label }) => {
            // Derive a stable camelCase id segment from the label.
            const labelId = Object.entries({ ü: 'ue', ö: 'oe', ä: 'ae', ß: 'ss', Ü: 'Ue', Ö: 'Oe', Ä: 'Ae' })
              .reduce((s, [k, v]) => s.replaceAll(k, v), label)
              .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
              .replace(/^[A-Z]/, (c) => c.toLowerCase())
            return (
              <span
                key={label}
                className="fee-drag-legend__item"
                {...qaTargetAttrs(qaEnabled, {
                  id: `results.feeDragChart.legend.${labelId}`,
                  label,
                  precision: 'exact',
                })}
              >
                <span className="fee-drag-legend__swatch" style={{ background: color }} />
                {label}
              </span>
            )
          })}
        </div>
      </div>

      {/* Visually-hidden data table for screen readers */}
      <FeeDragAccessibleTable
        selectedResults={selectedResults}
        retirementAge={retirementAge}
        comparisonEndAge={comparisonEndAge}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Accessible table — visually hidden, screen-reader summary of fee-drag data
// ---------------------------------------------------------------------------

interface FeeDragAccessibleTableProps {
  selectedResults: FeeDragResultEntry[];
  retirementAge: number;
  comparisonEndAge: number;
}

function FeeDragAccessibleTable({
  selectedResults,
  retirementAge,
  comparisonEndAge,
}: FeeDragAccessibleTableProps) {
  if (selectedResults.length === 0) return null;
  const rows = buildFeeDragChartData(selectedResults, retirementAge, comparisonEndAge);
  return (
    <table className="sr-only" aria-label="Gebühren-Vergleich (Zusammenfassung)">
      <caption>
        Nettoaufwand, Netto-Rendite und Gebühren pro Produkt bis Alter {comparisonEndAge}
      </caption>
      <thead>
        <tr>
          <th scope="col">Produkt</th>
          <th scope="col">Nettoaufwand gesamt</th>
          <th scope="col">Netto-Rendite</th>
          <th scope="col">Gebühren gesamt</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.productId}>
            <td>{row.name}</td>
            <td>{formatCurrency(row['Nettoaufwand gesamt'], 0)}</td>
            <td>{formatCurrency(row['Netto-Rendite'], 0)}</td>
            <td>{formatCurrency(row['Gebühren gesamt'], 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
