import { describe, expect, it } from 'vitest'
import { buildSequenceOfReturnsPaths } from './marketReturns'

function arithmeticMean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

describe('buildSequenceOfReturnsPaths (#245)', () => {
  it('builds deterministic paths with the same arithmetic mean but different ordering', () => {
    const paths = buildSequenceOfReturnsPaths({
      annualReturn: 0.05,
      years: 6,
    })

    expect(paths.map((path) => path.id)).toEqual([
      'good-early',
      'bad-early',
      'shuffled-baseline',
    ])

    for (const path of paths) {
      expect(path.returns).toHaveLength(6)
      expect(arithmeticMean(path.returns)).toBeCloseTo(0.05, 12)
    }

    const goodEarly = paths[0].returns
    const badEarly = paths[1].returns
    expect(goodEarly[0]).toBeGreaterThan(goodEarly.at(-1)!)
    expect(badEarly[0]).toBeLessThan(badEarly.at(-1)!)
    expect(goodEarly).not.toEqual(badEarly)
  })
})
