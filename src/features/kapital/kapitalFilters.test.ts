import { describe, expect, it } from 'vitest'
import { buildAllProductsSimulation } from '../../app/buildAllProductsSimulation'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { buildCompareChipOptions } from './kapitalFilters'

describe('capital chart comparison choices', () => {
  it('never sums mutually exclusive alternatives into a fictional portfolio', () => {
    const assumptions = { ...defaultAssumptions, visibleProducts: ['etf', 'bav'] as typeof defaultAssumptions.visibleProducts }
    const results = buildAllProductsSimulation(defaultProfile, assumptions).products.filter(p => p.scenarioId === 'basis')
    const options = buildCompareChipOptions({ assumptions, productResults: results, startAge: 30, retirementAge: 67, horizonAge: 100 })
    expect(options.map(option => option.id)).toEqual(['etf', 'bav'])
    for (const option of options) {
      expect(option.results).toHaveLength(1)
      expect(option.results[0]).toBe(results.find(r => r.productId === option.id))
    }
  })
})
