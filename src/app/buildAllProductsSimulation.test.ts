import { describe, expect, it } from 'vitest'
import { buildAllProductsSimulation } from './buildAllProductsSimulation'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { PRODUCT_IDS } from '../engine/productRegistry'
import type { ProductId } from '../domain'

describe('buildAllProductsSimulation', () => {
  it('defaults to all 6 products when productIds is omitted', () => {
    const result = buildAllProductsSimulation(defaultProfile, defaultAssumptions)
    const productIdsInResult = [...new Set(result.products.map((p) => p.productId))]
    // Every PRODUCT_IDS entry must appear in the result.
    for (const id of PRODUCT_IDS) {
      expect(productIdsInResult).toContain(id)
    }
    expect(productIdsInResult.sort()).toEqual([...PRODUCT_IDS].sort())
  })

  it('honours a caller-supplied subset when productIds is provided', () => {
    const subset: readonly ProductId[] = ['etf', 'bav']
    const result = buildAllProductsSimulation(defaultProfile, defaultAssumptions, subset)
    const productIdsInResult = [...new Set(result.products.map((p) => p.productId))]
    expect(productIdsInResult.sort()).toEqual([...subset].sort())
  })

  it('ignores assumptions.visibleProducts and uses the supplied list', () => {
    // assumptions.visibleProducts = ['etf'] — result must still include all 6.
    const narrowed = {
      ...defaultAssumptions,
      visibleProducts: ['etf'] as ProductId[],
    }
    const result = buildAllProductsSimulation(defaultProfile, narrowed)
    const productIdsInResult = [...new Set(result.products.map((p) => p.productId))]
    expect(productIdsInResult.sort()).toEqual([...PRODUCT_IDS].sort())
  })
})
