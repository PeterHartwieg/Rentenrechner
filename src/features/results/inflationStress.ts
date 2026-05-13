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
      row[`${product.label} nominal`] = product.netMonthlyPayout
      row[`${product.label} real`] = product.netMonthlyPayout / deflator
    }
    rows.push(row)
  }
  return rows
}
