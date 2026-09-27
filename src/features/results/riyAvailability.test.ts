import { describe, expect, it } from 'vitest'
import { availableRiy } from './riyAvailability'

describe('RIY availability', () => {
  it('does not present the legacy zero fallback as cost-free when fees were charged', () => {
    expect(availableRiy({ accumulationRiy: 0, totalFees: 1234 })).toBeUndefined()
    expect(availableRiy({ accumulationRiy: 0, totalFees: 0 })).toBe(0)
    expect(availableRiy({ accumulationRiy: 0.002, totalFees: 1234 })).toBe(0.002)
    expect(availableRiy(undefined)).toBeUndefined()
  })
})
