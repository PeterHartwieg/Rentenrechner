import type { ProductId, ProductResult } from '../../domain'
import type { Workspace, WorkspaceAssumptionsV2 } from '../../domain/workspace'
import type { LifecyclePayoutRow, LifecycleSeriesResult } from './breakEvenSeries'
import { getProductMeta } from '../../app/productPresentation'

export const PORTFOLIO_LIFECYCLE_ID = 'portfolio'

export interface SavingsStackRow {
  age: number
  totalBalance: number
  layers: Array<{ productId: string; balance: number }>
}

export interface PortfolioLifecycleView {
  id: string
  label: string
  count: number
  productId?: ProductId
  result: LifecycleSeriesResult
  savingsStackRows?: SavingsStackRow[]
}

type InstanceLike = {
  instanceId: string
  label: string
  status: string
}

export function buildPortfolioLifecycleViews(args: {
  workspace: Workspace
  perInstance: Record<string, ProductResult[]>
  scenarioId: string
  startAge: number
  retirementAge: number
  horizonAge: number
}): PortfolioLifecycleView[] {
  const visibleProductIds = args.workspace.baseline.assumptions.visibleProducts
  const groups = productGroups(args.workspace.baseline.assumptions)
    .filter((group) => visibleProductIds.includes(group.productId))
    .map((group) => {
      const results = group.instances
        .filter((instance) => isIncludedLifecycleStatus(instance.status))
        .map((instance) => args.perInstance[instance.instanceId]?.find((r) => r.scenarioId === args.scenarioId))
        .filter((result): result is ProductResult => Boolean(result))
      return { ...group, results }
    })
    .filter((group) => group.results.length > 0)

  const productViews: PortfolioLifecycleView[] = groups.map((group) => {
    const meta = getProductMeta(group.productId)
    const labelBase = meta?.shortLabel ?? group.productId
    const label =
      group.results.length > 1
        ? `${labelBase} (${group.results.length} Verträge)`
        : labelBase
    return {
      id: group.productId,
      label,
      count: group.results.length,
      productId: group.productId,
      result: aggregateLifecycleResults({
        id: group.productId,
        label,
        results: group.results,
        startAge: args.startAge,
        retirementAge: args.retirementAge,
        horizonAge: args.horizonAge,
      }),
    }
  })

  if (productViews.length === 0) return []

  const portfolioResults = groups.flatMap((group) => group.results)
  const portfolioView: PortfolioLifecycleView = {
    id: PORTFOLIO_LIFECYCLE_ID,
    label: 'Gesamtportfolio',
    count: portfolioResults.length,
    result: aggregateLifecycleResults({
      id: PORTFOLIO_LIFECYCLE_ID,
      label: 'Gesamtportfolio',
      results: portfolioResults,
      startAge: args.startAge,
      retirementAge: args.retirementAge,
      horizonAge: args.horizonAge,
    }),
    savingsStackRows: buildSavingsStackRows(groups, args.startAge, args.retirementAge),
  }

  return [portfolioView, ...productViews]
}

function productGroups(wsa: WorkspaceAssumptionsV2): Array<{
  productId: ProductId
  instances: InstanceLike[]
}> {
  return [
    { productId: 'etf', instances: wsa.etf },
    { productId: 'bav', instances: wsa.bav },
    { productId: 'versicherung', instances: wsa.insurance },
    { productId: 'basisrente', instances: wsa.basisrente },
    { productId: 'altersvorsorgedepot', instances: wsa.altersvorsorgedepot },
    { productId: 'riester', instances: wsa.riester },
  ]
}

function isIncludedLifecycleStatus(status: string): boolean {
  return status === 'active' || status === 'paid_up'
}

function buildSavingsStackRows(
  groups: Array<{ productId: ProductId; results: ProductResult[] }>,
  startAge: number,
  retirementAge: number,
): SavingsStackRow[] {
  const rows: SavingsStackRow[] = []
  for (let age = startAge + 1; age <= retirementAge; age++) {
    const layers = groups.map((group) => ({
      productId: group.productId as string,
      balance: group.results.reduce((sum, result) => {
        const row = result.rows.find((r) => r.age === age)
        return sum + (row?.balance ?? (age >= retirementAge ? result.capitalAtRetirement : 0))
      }, 0),
    }))
    const totalBalance = layers.reduce((sum, layer) => sum + layer.balance, 0)
    rows.push({ age, totalBalance, layers })
  }
  return rows
}

function aggregateLifecycleResults(args: {
  id: string
  label: string
  results: ProductResult[]
  startAge: number
  retirementAge: number
  horizonAge: number
}): LifecycleSeriesResult {
  const rows: Array<{ age: number; balance: number }> = []
  for (let age = args.startAge + 1; age <= args.retirementAge; age++) {
    rows.push({
      age,
      balance: args.results.reduce((sum, result) => {
        const row = result.rows.find((r) => r.age === age)
        return sum + (row?.balance ?? (age >= args.retirementAge ? result.capitalAtRetirement : 0))
      }, 0),
    })
  }

  const lifecyclePayoutRows: LifecyclePayoutRow[] = []
  const cumulativeGrossByInstance = new Map<string, number>()
  for (let age = args.retirementAge + 1; age <= args.horizonAge; age++) {
    const yearIndex = age - args.retirementAge - 1
    let grossAnnualPayout = 0
    let netAnnualPayout = 0
    let capitalAtEnd = 0

    for (const result of args.results) {
      const instanceKey = result.instanceId ?? `${result.productId}-${args.results.indexOf(result)}`
      const gross = annualGrossPayoutAt(result, args.retirementAge, yearIndex)
      const net = annualNetPayoutAt(result, args.retirementAge, yearIndex)
      const previousGross = cumulativeGrossByInstance.get(instanceKey) ?? 0
      const nextGross = previousGross + gross
      cumulativeGrossByInstance.set(instanceKey, nextGross)

      grossAnnualPayout += gross
      netAnnualPayout += net
      capitalAtEnd += capitalAtEndFor(result, nextGross, yearIndex)
    }

    lifecyclePayoutRows.push({
      age,
      grossAnnualPayout,
      netAnnualPayout,
      capitalAtEnd,
    })
  }

  return {
    productId: args.id,
    label: args.label,
    rows,
    lifecyclePayoutRows,
    monthlyUserCost: args.results.reduce((sum, result) => sum + result.monthlyUserCost, 0),
    totalUserCost: args.results.reduce((sum, result) => sum + result.totalUserCost, 0),
    capitalAtRetirement: args.results.reduce((sum, result) => sum + result.capitalAtRetirement, 0),
    grossMonthlyPayout: args.results.reduce((sum, result) => sum + result.grossMonthlyPayout, 0),
    netMonthlyPayout: args.results.reduce((sum, result) => sum + result.netMonthlyPayout, 0),
    payoutEndAge: aggregatePayoutEndAge(args.results),
  }
}

function annualNetPayoutAt(
  result: ProductResult,
  retirementAge: number,
  yearIndex: number,
): number {
  if (result.payoutEndAge !== undefined && retirementAge + yearIndex >= result.payoutEndAge) return 0
  if (result.productId === 'etf') return result.etfPayoutRows[yearIndex]?.netAnnualPayout ?? 0
  return result.netMonthlyPayout * 12
}

function annualGrossPayoutAt(
  result: ProductResult,
  retirementAge: number,
  yearIndex: number,
): number {
  if (result.payoutEndAge !== undefined && retirementAge + yearIndex >= result.payoutEndAge) return 0
  if (result.productId === 'etf') return result.etfPayoutRows[yearIndex]?.grossAnnualPayout ?? 0
  return result.grossMonthlyPayout * 12
}

function capitalAtEndFor(
  result: ProductResult,
  cumulativeGrossPayout: number,
  yearIndex: number,
): number {
  if (result.productId === 'etf') return Math.max(0, result.etfPayoutRows[yearIndex]?.capitalAtEnd ?? 0)
  return Math.max(0, result.capitalAtRetirement - cumulativeGrossPayout)
}

function aggregatePayoutEndAge(results: ProductResult[]): number | undefined {
  if (results.some((result) => result.payoutEndAge === undefined)) return undefined
  return Math.max(...results.map((result) => result.payoutEndAge ?? 0))
}
