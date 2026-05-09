import { describe, expect, it } from 'vitest'
import { buildFeeDragChartData } from './feeDragChartData'

describe('buildFeeDragChartData', () => {
  it('payout stack (blue + green) equals cumulativeNetPayouts, not inflated by fees', () => {
    const retirementAge = 67
    const comparisonEndAge = 90
    const payoutYears = comparisonEndAge - retirementAge // 23
    const netMonthlyPayout = 1_000
    const expectedCumulativeNetPayouts = netMonthlyPayout * 12 * payoutYears // 276_000
    const totalFees = 50_000
    const totalUserCost = 100_000

    const rows = buildFeeDragChartData(
      [
        {
          productId: 'etf',
          label: 'ETF',
          netMonthlyPayout,
          payoutEndAge: comparisonEndAge,
          totalFees,
          totalUserCost,
        },
      ],
      retirementAge,
      comparisonEndAge,
    )

    expect(rows).toHaveLength(1)
    const [row] = rows

    const payoutStack = row['Nettoaufwand gesamt'] + row['Netto-Rendite']

    // The payout stack must equal the lifecycle max cumulative net payout.
    expect(payoutStack).toBeCloseTo(expectedCumulativeNetPayouts, 2)

    // Fees are an independent quantity; including them would overstate the total.
    expect(payoutStack + row['Gebühren gesamt']).not.toBeCloseTo(expectedCumulativeNetPayouts, 2)
  })

  it('contributed is capped at cumulativeNetPayouts when cost exceeds payout', () => {
    const retirementAge = 67
    const comparisonEndAge = 90
    const payoutYears = comparisonEndAge - retirementAge // 23
    const netMonthlyPayout = 500
    const cumulativeNetPayouts = netMonthlyPayout * 12 * payoutYears // 138_000
    // User cost exceeds total payout (e.g. heavy-fee product with low net return)
    const totalUserCost = 200_000

    const rows = buildFeeDragChartData(
      [
        {
          productId: 'bav',
          label: 'bAV',
          netMonthlyPayout,
          payoutEndAge: comparisonEndAge,
          totalFees: 30_000,
          totalUserCost,
        },
      ],
      retirementAge,
      comparisonEndAge,
    )

    expect(rows).toHaveLength(1)
    const [row] = rows

    // contributed is clamped to cumulativeNetPayouts; gain is 0
    expect(row['Nettoaufwand gesamt']).toBeCloseTo(cumulativeNetPayouts, 2)
    expect(row['Netto-Rendite']).toBe(0)
    // payout stack still equals cumulativeNetPayouts
    expect(row['Nettoaufwand gesamt'] + row['Netto-Rendite']).toBeCloseTo(cumulativeNetPayouts, 2)
  })

  it('uses etfPayoutRows sum instead of monthly payout formula when provided', () => {
    const retirementAge = 67
    const comparisonEndAge = 90
    const etfPayoutRows = [
      { netAnnualPayout: 10_000 },
      { netAnnualPayout: 11_000 },
      { netAnnualPayout: 12_000 },
    ]
    const expectedCumulative = 33_000
    const totalUserCost = 20_000

    const rows = buildFeeDragChartData(
      [
        {
          productId: 'etf',
          label: 'ETF',
          netMonthlyPayout: 999, // should be ignored when etfPayoutRows is provided
          totalFees: 5_000,
          totalUserCost,
          etfPayoutRows,
        },
      ],
      retirementAge,
      comparisonEndAge,
    )

    expect(rows).toHaveLength(1)
    const [row] = rows

    const payoutStack = row['Nettoaufwand gesamt'] + row['Netto-Rendite']
    expect(payoutStack).toBeCloseTo(expectedCumulative, 2)
    expect(row['Nettoaufwand gesamt']).toBeCloseTo(totalUserCost, 2) // cost < payout
    expect(row['Netto-Rendite']).toBeCloseTo(expectedCumulative - totalUserCost, 2)
  })
})
