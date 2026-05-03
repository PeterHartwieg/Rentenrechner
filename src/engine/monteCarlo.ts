import type {
  GermanRules,
  PersonalProfile,
  ProductId,
  ProductResult,
  ReturnScenario,
  ScenarioAssumptions,
} from '../domain'
import { PRODUCT_REGISTRY, getProductMeta } from './productRegistry'
import { buildContext } from './simulationContext'

export interface MonteCarloPercentiles {
  p5: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  p95: number
}

export interface ProductMonteCarloSummary {
  productId: ProductId
  label: string
  shortLabel: string
  color: string
  runs: number
  capital: MonteCarloPercentiles
  netMonthlyPayout: MonteCarloPercentiles
  expectedCapital: number
  expectedNetMonthlyPayout: number
  bestCapitalProbability: number
  bestPensionProbability: number
  belowUserCostProbability: number
  targetNetPensionProbability: number | null
  guaranteeLabel?: string
  guaranteeFloor: MonteCarloPercentiles | null
  guaranteeAppliedProbability: number | null
}

export interface MonteCarloYearlyBand {
  productId: ProductId
  year: number
  age: number
  p10: number
  p50: number
  p90: number
}

export interface MonteCarloResult {
  scenarioId: string
  scenarioLabel: string
  annualReturn: number
  annualVolatility: number
  runs: number
  seed: number
  marketAnnualReturn: MonteCarloPercentiles
  summaries: ProductMonteCarloSummary[]
  yearlyBands: MonteCarloYearlyBand[]
}

export interface MonteCarloRunInput {
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  rules: GermanRules
  scenarioId: string
  visibleProducts: ProductId[]
}

interface ProductAccumulator {
  productId: ProductId
  label: string
  shortLabel: string
  color: string
  capitalValues: number[]
  payoutValues: number[]
  belowUserCostCount: number
  targetNetPensionCount: number
  bestCapitalCount: number
  bestPensionCount: number
  guaranteeLabel?: string
  guaranteeFloorValues: number[]
  guaranteeAppliedCount: number
  yearlyBalances: number[][]
}

export class SeededNormal {
  private state: number
  private spare: number | null = null

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  private uniform(): number {
    this.state += 0x6d2b79f5
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }

  normal(): number {
    if (this.spare !== null) {
      const value = this.spare
      this.spare = null
      return value
    }
    const u = Math.max(this.uniform(), Number.MIN_VALUE)
    const v = this.uniform()
    const radius = Math.sqrt(-2 * Math.log(u))
    const angle = 2 * Math.PI * v
    this.spare = radius * Math.sin(angle)
    return radius * Math.cos(angle)
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function percentileFromSorted(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const index = (sorted.length - 1) * pct
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  if (lo === hi) return sorted[lo]
  const weight = index - lo
  return sorted[lo] * (1 - weight) + sorted[hi] * weight
}

function percentiles(values: number[]): MonteCarloPercentiles {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    p5: percentileFromSorted(sorted, 0.05),
    p10: percentileFromSorted(sorted, 0.10),
    p25: percentileFromSorted(sorted, 0.25),
    p50: percentileFromSorted(sorted, 0.50),
    p75: percentileFromSorted(sorted, 0.75),
    p90: percentileFromSorted(sorted, 0.90),
    p95: percentileFromSorted(sorted, 0.95),
  }
}

export function generateMarketReturnPath(input: {
  years: number
  expectedAnnualReturn: number
  annualVolatility: number
  rng: SeededNormal
}): number[] {
  const { years, expectedAnnualReturn, annualVolatility, rng } = input
  if (years <= 0) return []
  if (annualVolatility <= 0) return Array.from({ length: years }, () => expectedAnnualReturn)

  const logMean = Math.log1p(expectedAnnualReturn) - 0.5 * annualVolatility * annualVolatility
  return Array.from({ length: years }, () => {
    const gross = Math.exp(logMean + annualVolatility * rng.normal()) - 1
    return Math.min(1.5, Math.max(-0.9, gross))
  })
}

function geometricAnnualReturn(path: readonly number[]): number {
  if (path.length === 0) return 0
  const terminal = path.reduce((value, annualReturn) => value * (1 + annualReturn), 1)
  return Math.pow(terminal, 1 / path.length) - 1
}

function comparableCapital(product: ProductResult): number {
  return product.afterTaxLumpSum ?? product.capitalAtRetirement
}

function productAccumulator(product: ProductResult): ProductAccumulator {
  const meta = getProductMeta(product.productId)
  return {
    productId: product.productId,
    label: product.label,
    shortLabel: meta?.shortLabel ?? product.label,
    color: meta?.color ?? '#64748b',
    capitalValues: [],
    payoutValues: [],
    belowUserCostCount: 0,
    targetNetPensionCount: 0,
    bestCapitalCount: 0,
    bestPensionCount: 0,
    guaranteeLabel: product.guaranteeLabel,
    guaranteeFloorValues: [],
    guaranteeAppliedCount: 0,
    yearlyBalances: product.rows.map(() => []),
  }
}

function selectedScenario(
  assumptions: ScenarioAssumptions,
  scenarioId: string,
): ReturnScenario {
  return (
    assumptions.returnScenarios.find((scenario) => scenario.id === scenarioId) ??
    assumptions.returnScenarios.find((scenario) => scenario.id === 'basis') ??
    assumptions.returnScenarios[0]
  )
}

export function runMonteCarlo(input: MonteCarloRunInput): MonteCarloResult | null {
  const { profile, assumptions, rules } = input
  const visible = new Set<ProductId>(input.visibleProducts)
  if (visible.size === 0 || assumptions.monteCarlo.runs <= 0) return null

  const scenario = selectedScenario(assumptions, input.scenarioId)
  const runs = Math.max(1, Math.floor(assumptions.monteCarlo.runs))
  const yearsToRetirement = profile.retirementAge - profile.age
  const baseContext = buildContext(profile, assumptions, rules)
  const rng = new SeededNormal(assumptions.monteCarlo.seed)
  const accumulators = new Map<ProductId, ProductAccumulator>()
  const marketAnnualReturns: number[] = []
  const targetNetPension = profile.desiredNetMonthlyPension ?? 0

  const productsToSimulate = PRODUCT_REGISTRY.filter((entry) =>
    visible.has(entry.metadata.id as ProductId),
  )

  for (let run = 0; run < runs; run += 1) {
    const marketReturnPath = generateMarketReturnPath({
      years: yearsToRetirement,
      expectedAnnualReturn: scenario.annualReturn,
      annualVolatility: assumptions.monteCarlo.annualVolatility,
      rng,
    })
    marketAnnualReturns.push(geometricAnnualReturn(marketReturnPath))

    const ctx = { ...baseContext, marketReturnPath }
    const products = productsToSimulate.map((entry) => entry.simulate(ctx, scenario))

    let bestCapital: { productId: ProductId; value: number } | null = null
    let bestPension: { productId: ProductId; value: number } | null = null

    for (const product of products) {
      let acc = accumulators.get(product.productId)
      if (!acc) {
        acc = productAccumulator(product)
        accumulators.set(product.productId, acc)
      }

      const capital = comparableCapital(product)
      acc.capitalValues.push(capital)
      acc.payoutValues.push(product.netMonthlyPayout)
      if (capital < product.totalUserCost) acc.belowUserCostCount += 1
      if (product.guaranteeFloorAtRetirement !== undefined) {
        acc.guaranteeLabel = product.guaranteeLabel ?? acc.guaranteeLabel
        acc.guaranteeFloorValues.push(product.guaranteeFloorAtRetirement)
        if (product.guaranteeApplied) acc.guaranteeAppliedCount += 1
      }
      if (targetNetPension > 0) {
        const totalNetPension = baseContext.statutoryPension.netMonthlyPension + product.netMonthlyPayout
        if (totalNetPension >= targetNetPension) acc.targetNetPensionCount += 1
      }
      product.rows.forEach((row, index) => {
        if (!acc.yearlyBalances[index]) acc.yearlyBalances[index] = []
        acc.yearlyBalances[index].push(row.balance)
      })

      if (!bestCapital || capital > bestCapital.value) {
        bestCapital = { productId: product.productId, value: capital }
      }
      if (!bestPension || product.netMonthlyPayout > bestPension.value) {
        bestPension = { productId: product.productId, value: product.netMonthlyPayout }
      }
    }

    if (bestCapital) {
      const acc = accumulators.get(bestCapital.productId)
      if (acc) acc.bestCapitalCount += 1
    }
    if (bestPension) {
      const acc = accumulators.get(bestPension.productId)
      if (acc) acc.bestPensionCount += 1
    }
  }

  const summaries = [...accumulators.values()]
    .sort((a, b) => (getProductMeta(a.productId)?.order ?? 99) - (getProductMeta(b.productId)?.order ?? 99))
    .map((acc) => ({
      productId: acc.productId,
      label: acc.label,
      shortLabel: acc.shortLabel,
      color: acc.color,
      runs,
      capital: percentiles(acc.capitalValues),
      netMonthlyPayout: percentiles(acc.payoutValues),
      expectedCapital: average(acc.capitalValues),
      expectedNetMonthlyPayout: average(acc.payoutValues),
      bestCapitalProbability: acc.bestCapitalCount / runs,
      bestPensionProbability: acc.bestPensionCount / runs,
      belowUserCostProbability: acc.belowUserCostCount / runs,
      targetNetPensionProbability:
        targetNetPension > 0 ? acc.targetNetPensionCount / runs : null,
      guaranteeLabel: acc.guaranteeLabel,
      guaranteeFloor:
        acc.guaranteeFloorValues.length > 0 ? percentiles(acc.guaranteeFloorValues) : null,
      guaranteeAppliedProbability:
        acc.guaranteeFloorValues.length > 0 ? acc.guaranteeAppliedCount / runs : null,
    }))

  const yearlyBands = [...accumulators.values()].flatMap((acc) =>
    acc.yearlyBalances.map((balances, index) => {
      const rowStats = percentiles(balances)
      return {
        productId: acc.productId,
        year: index + 1,
        age: profile.age + index + 1,
        p10: rowStats.p10,
        p50: rowStats.p50,
        p90: rowStats.p90,
      }
    }),
  )

  return {
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    annualReturn: scenario.annualReturn,
    annualVolatility: assumptions.monteCarlo.annualVolatility,
    runs,
    seed: assumptions.monteCarlo.seed,
    marketAnnualReturn: percentiles(marketAnnualReturns),
    summaries,
    yearlyBands,
  }
}
