import type { ProductResult } from '../../domain'

/** Stable per-product dataKeys for the lifecycle line chart. */
export function lifecycleLineKeys(productId: string) {
  return {
    paidIn: `${productId}__paidIn`,
    balance: `${productId}__balance`,
    payout: `${productId}__payout`,
  }
}

/**
 * Build per-age data for the lifecycle line chart.
 *
 * Three positive lines per product:
 * - Netto eingezahlt: cumulative net user cost paid into the product.
 * - Restkapital: contract/depot balance. It rises during accumulation and
 *   depletes during retirement at the gross payout rate.
 * - Netto ausgezahlt: cumulative net payouts received after tax and KV/PV.
 */
export function buildLifecycleLineSeries(
  results: ProductResult[],
  startAge: number,
  retirementAge: number,
  horizonAge: number,
): Record<string, number>[] {
  const series: Record<string, number>[] = []
  const cumGrossPayouts = new Map<string, number>(results.map((r) => [r.productId, 0]))
  const cumNetPayouts = new Map<string, number>(results.map((r) => [r.productId, 0]))

  for (let age = startAge; age <= horizonAge; age++) {
    const point: Record<string, number> = { age }
    for (const r of results) {
      const keys = lifecycleLineKeys(r.productId)
      let balance: number
      let paidIn: number
      let cumNet: number

      if (age <= retirementAge) {
        // Accumulation: real depot/contract balance from rows.
        if (age === startAge) {
          balance = 0
        } else {
          const row = r.rows.find((row) => row.age === age)
          balance = row?.balance ?? r.capitalAtRetirement
        }
        const yearsElapsed = Math.max(0, age - startAge)
        paidIn = Math.min(r.totalUserCost, yearsElapsed * r.monthlyUserCost * 12)
        cumNet = 0
      } else {
        // Retirement: balance depletes at the gross rate (gross = what leaves
        // the contract); the payout line tracks the net the user actually
        // pockets after tax and KV/PV.
        const yearIndex = age - retirementAge - 1
        const annualGross = annualGrossPayoutAt(r, retirementAge, yearIndex)
        const annualNet = annualNetPayoutAt(r, retirementAge, yearIndex)
        const cumGross = (cumGrossPayouts.get(r.productId) ?? 0) + annualGross
        cumGrossPayouts.set(r.productId, cumGross)
        cumNet = (cumNetPayouts.get(r.productId) ?? 0) + annualNet
        cumNetPayouts.set(r.productId, cumNet)
        if (r.productId === 'etf') {
          const row = r.etfPayoutRows[yearIndex]
          balance = row ? Math.max(0, row.capitalAtEnd) : 0
        } else {
          balance = Math.max(0, r.capitalAtRetirement - cumGross)
        }
        paidIn = r.totalUserCost
      }

      point[keys.paidIn] = Math.round(paidIn)
      point[keys.balance] = Math.round(balance)
      point[keys.payout] = Math.round(cumNet)
    }
    series.push(point)
  }
  return series
}

function annualNetPayoutAt(
  result: ProductResult,
  retirementAge: number,
  yearIndex: number,
): number {
  if (result.payoutEndAge !== undefined) {
    const ageAtYearStart = retirementAge + yearIndex
    if (ageAtYearStart >= result.payoutEndAge) return 0
  }
  if (result.productId === 'etf') {
    const row = result.etfPayoutRows[yearIndex]
    if (row) return row.netAnnualPayout
    return 0
  }
  return result.netMonthlyPayout * 12
}

function annualGrossPayoutAt(
  result: ProductResult,
  retirementAge: number,
  yearIndex: number,
): number {
  if (result.payoutEndAge !== undefined) {
    const ageAtYearStart = retirementAge + yearIndex
    if (ageAtYearStart >= result.payoutEndAge) return 0
  }
  return result.grossMonthlyPayout * 12
}
