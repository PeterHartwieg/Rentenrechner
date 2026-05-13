import type { ProductResult } from '../../domain'

export interface InflationStressRow {
  age: number
  [key: string]: number
}

export interface InflationStressInput {
  products: ProductResult[]
  retirementAge: number
  retirementEndAge: number
  inflationRate: number
}

export function buildInflationStressRows({
  products,
  retirementAge,
  retirementEndAge,
  inflationRate,
}: InflationStressInput): InflationStressRow[] {
  const rows: InflationStressRow[] = []
  for (let age = retirementAge; age <= retirementEndAge; age++) {
    const yearsElapsed = age - retirementAge
    const deflator = Math.pow(1 + inflationRate, yearsElapsed)
    const row: InflationStressRow = { age }
    for (const product of products) {
      const paidOut = product.payoutEndAge === undefined || age <= product.payoutEndAge
      row[`${product.label} nominal`] = paidOut ? product.netMonthlyPayout : 0
      row[`${product.label} real`] = paidOut ? product.netMonthlyPayout / deflator : 0
    }
    rows.push(row)
  }
  return rows
}
