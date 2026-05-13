import type { ProductResult } from '../../domain'

export type LifetimeIncomePoint = { age: number } & Record<string, number>

interface BuildOptions {
  retirementAge: number
  horizonAge: number
}

export function buildLifetimeIncomeSeries(
  products: ProductResult[],
  opts: BuildOptions,
): LifetimeIncomePoint[] {
  const { retirementAge, horizonAge } = opts
  const cumulative: Record<string, number> = {}
  for (const p of products) {
    cumulative[p.productId] = 0
  }

  const series: LifetimeIncomePoint[] = []
  for (let age = retirementAge; age <= horizonAge; age++) {
    const point: LifetimeIncomePoint = { age }
    for (const p of products) {
      let annual: number
      if ('etfPayoutRows' in p && p.etfPayoutRows) {
        const row = p.etfPayoutRows.find((r) => r.age === age)
        annual = row ? row.netAnnualPayout : 0
      } else {
        const payoutActive = p.payoutEndAge === undefined || age <= p.payoutEndAge
        annual = payoutActive ? p.netMonthlyPayout * 12 : 0
      }
      cumulative[p.productId] = (cumulative[p.productId] ?? 0) + annual
      point[p.productId] = cumulative[p.productId]
    }
    series.push(point)
  }
  return series
}
