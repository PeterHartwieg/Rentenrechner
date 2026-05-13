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
        annual = p.netMonthlyPayout * 12
      }
      if (age === retirementAge && p.afterTaxLumpSum != null) {
        annual += p.afterTaxLumpSum
      }
      cumulative[p.productId] = (cumulative[p.productId] ?? 0) + annual
      point[p.productId] = cumulative[p.productId]
    }
    series.push(point)
  }
  return series
}
