import { getProductMeta } from '../../engine/productRegistry';

export interface FeeDragChartRow {
  name: string;
  /** Blue: portion of cumulative net payouts covered by net contributions. */
  'Nettoaufwand gesamt': number;
  /** Green: surplus of cumulative net payouts above net contributions. */
  'Netto-Rendite': number;
  /** Red: total accumulated fees — rendered in a separate stack so the blue+green total equals lifecycle max cumulative net payout. */
  'Gebühren gesamt': number;
  productId: string;
}

export interface FeeDragResultEntry {
  productId: string;
  label: string;
  netMonthlyPayout: number;
  payoutEndAge?: number;
  totalFees: number;
  totalUserCost: number;
  etfPayoutRows?: { netAnnualPayout: number }[];
}

/**
 * Derives the chart rows for `FeeDragChart` from the provided results.
 *
 * Invariant: `row['Nettoaufwand gesamt'] + row['Netto-Rendite']` equals the
 * lifecycle max cumulative net payout for that product. `'Gebühren gesamt'`
 * is an independent quantity and must NOT be added to the payout stack.
 */
export function buildFeeDragChartData(
  selectedResults: FeeDragResultEntry[],
  retirementAge: number,
  comparisonEndAge: number,
): FeeDragChartRow[] {
  return selectedResults.map((r) => {
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
  });
}
