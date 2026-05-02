import { describe, expect, it } from 'vitest'
import type { ProductId, ProductResult } from '../../domain'
import { simulateDefault, resultFor } from '../../test/factories'
import { LIFECYCLE_HORIZON_AGE } from './lifecycleHorizon'
import {
  buildLifecycleLineSeries,
  findLeibrenteCrossovers,
  LEIBRENTE_CROSSOVER_SEARCH_CAP,
  lifecycleLineKeys,
} from './breakEvenSeries'

function pickResults(results: ProductResult[], ids: ProductId[]): ProductResult[] {
  return ids.map((id) => resultFor(results, id, 'basis'))
}

describe('findLeibrenteCrossovers', () => {
  it('detects ETF (Kapitalverzehr) being overtaken by bAV (Leibrente) past depletion', () => {
    const sim = simulateDefault()
    const products = pickResults(sim.products, ['etf', 'bav'])

    const crossovers = findLeibrenteCrossovers(products, 30, 67)

    expect(crossovers).toHaveLength(1)
    const [cross] = crossovers
    expect(cross.leibrenteId).toBe('bav')
    expect(cross.drawDownId).toBe('etf')
    // ETF depletes around age 90; bAV catches up well past the chart horizon.
    expect(cross.age).toBeGreaterThan(90)
    expect(cross.age).toBeLessThanOrEqual(LEIBRENTE_CROSSOVER_SEARCH_CAP)
    expect(cross.amount).toBeGreaterThan(0)
  })

  it('returns nothing when only Leibrente products are visible', () => {
    const sim = simulateDefault()
    const bav = resultFor(sim.products, 'bav', 'basis')
    expect(findLeibrenteCrossovers([bav], 30, 67)).toEqual([])
  })

  it('returns nothing when only Kapitalverzehr products are visible', () => {
    const sim = simulateDefault()
    const etf = resultFor(sim.products, 'etf', 'basis')
    expect(findLeibrenteCrossovers([etf], 30, 67)).toEqual([])
  })

  it('reports a crossover only after a strict-behind row, not the trivial age-0 tie', () => {
    const sim = simulateDefault()
    const products = pickResults(sim.products, ['etf', 'bav'])
    const crossovers = findLeibrenteCrossovers(products, 30, 67)
    const cross = crossovers[0]
    expect(cross).toBeDefined()
    // Sanity-check that the chart series at the prior age was strictly
    // behind, so we know the helper isn't reporting the age-0 tie.
    const lbKey = lifecycleLineKeys('bav').payout
    const ddKey = lifecycleLineKeys('etf').payout
    const longSeries = buildLifecycleLineSeries(
      products,
      30,
      67,
      LEIBRENTE_CROSSOVER_SEARCH_CAP,
    )
    const prior = longSeries.find((row) => Number(row.age) === cross.age - 1)
    expect(prior).toBeDefined()
    if (prior) {
      expect(Number(prior[lbKey])).toBeLessThan(Number(prior[ddKey]))
    }
  })

  it('reports an out-of-frame crossover when chart horizon is shorter than catch-up age', () => {
    const sim = simulateDefault()
    const products = pickResults(sim.products, ['etf', 'bav'])
    const crossovers = findLeibrenteCrossovers(products, 30, 67)
    expect(crossovers[0].age).toBeGreaterThan(LIFECYCLE_HORIZON_AGE)
  })
})
