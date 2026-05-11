import type { ProductResult } from '../domain'
import type { CombinedResult } from '../engine/portfolioCombine'

export interface CompareExportRow {
  productId: ProductResult['productId']
  productLabel: string
  scenarioId: string
  scenarioLabel: string
  capitalAtRetirement: number
  afterTaxLumpSum: number | null
  netMonthlyPayout: number
  inputConfidence: ProductResult['inputConfidence']
}

export interface CombineInstanceExportRow {
  instanceId: string
  productId: ProductResult['productId']
  productLabel: string
  scenarioId: string
  scenarioLabel: string
  capitalAtRetirement: number
  afterTaxLumpSum: number | null
  netMonthlyPayout: number
  inputConfidence: ProductResult['inputConfidence']
}

export function projectCompareExportRows(products: ProductResult[]): CompareExportRow[] {
  return products.map((p) => ({
    productId: p.productId,
    productLabel: p.label,
    scenarioId: p.scenarioId,
    scenarioLabel: p.scenarioLabel,
    capitalAtRetirement: p.capitalAtRetirement,
    afterTaxLumpSum: p.afterTaxLumpSum,
    netMonthlyPayout: p.netMonthlyPayout,
    inputConfidence: p.inputConfidence,
  }))
}

export function projectCombineInstanceExportRows(input: {
  perInstance: Record<string, ProductResult[]>
  combinedByScenarioId: Record<string, Pick<CombinedResult, 'byInstance'>>
}): CombineInstanceExportRow[] {
  const rows: CombineInstanceExportRow[] = []
  for (const [instanceId, products] of Object.entries(input.perInstance)) {
    for (const p of products) {
      const combined = input.combinedByScenarioId[p.scenarioId]
      const instanceShare = combined?.byInstance[instanceId]
      rows.push({
        instanceId,
        productId: p.productId,
        productLabel: p.label,
        scenarioId: p.scenarioId,
        scenarioLabel: p.scenarioLabel,
        capitalAtRetirement: p.capitalAtRetirement,
        afterTaxLumpSum: p.afterTaxLumpSum,
        netMonthlyPayout: instanceShare?.monthlyNet ?? p.netMonthlyPayout,
        inputConfidence: p.inputConfidence,
      })
    }
  }
  return rows
}
