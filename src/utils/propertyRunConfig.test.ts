import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEED,
  MAX_RUNS_MULTIPLIER,
  MAX_SEED,
  propertyRunParams,
  resolvePropertyRunConfig,
} from './propertyRunConfig'

describe('resolvePropertyRunConfig — PR-suite defaults', () => {
  it('no overrides reproduce the authored PR suite exactly (seed base 378, multiplier 1)', () => {
    expect(resolvePropertyRunConfig({})).toEqual({ seed: DEFAULT_SEED, runsMultiplier: 1 })
  })

  it('empty-string overrides are treated as unset (CI often passes empty env)', () => {
    expect(resolvePropertyRunConfig({ PROPERTY_RUNS_MULTIPLIER: '', PROPERTY_SEED: '' })).toEqual({
      seed: DEFAULT_SEED,
      runsMultiplier: 1,
    })
    expect(resolvePropertyRunConfig({ PROPERTY_RUNS_MULTIPLIER: '  ' })).toEqual({
      seed: DEFAULT_SEED,
      runsMultiplier: 1,
    })
  })
})

describe('resolvePropertyRunConfig — bounded multiplier', () => {
  it('accepts the full bounded range 1..8', () => {
    expect(resolvePropertyRunConfig({ PROPERTY_RUNS_MULTIPLIER: '1' }).runsMultiplier).toBe(1)
    expect(resolvePropertyRunConfig({ PROPERTY_RUNS_MULTIPLIER: String(MAX_RUNS_MULTIPLIER) }).runsMultiplier).toBe(
      MAX_RUNS_MULTIPLIER,
    )
  })

  it.each(['0', '-1', String(MAX_RUNS_MULTIPLIER + 1), '999'])(
    'rejects out-of-domain multiplier %s instead of silently ignoring it',
    (multiplier) => {
      expect(() => resolvePropertyRunConfig({ PROPERTY_RUNS_MULTIPLIER: multiplier })).toThrow(
        /PROPERTY_RUNS_MULTIPLIER must be an integer between 1 and 8/,
      )
    },
  )

  it.each(['two', '1.5', 'NaN'])('rejects non-integer multiplier %s', (multiplier) => {
    expect(() => resolvePropertyRunConfig({ PROPERTY_RUNS_MULTIPLIER: multiplier })).toThrow(
      /must be an integer/,
    )
  })
})

describe('resolvePropertyRunConfig — explicit reproducible seed', () => {
  it('accepts an explicit seed base in the 32-bit domain', () => {
    expect(resolvePropertyRunConfig({ PROPERTY_SEED: '42' }).seed).toBe(42)
    expect(resolvePropertyRunConfig({ PROPERTY_SEED: String(MAX_SEED) }).seed).toBe(MAX_SEED)
  })

  it.each(['-1', String(MAX_SEED + 1), '3.14', 'abc'])('rejects invalid seed %s', (seed) => {
    expect(() => resolvePropertyRunConfig({ PROPERTY_SEED: seed })).toThrow(/PROPERTY_SEED/)
  })
})

describe('propertyRunParams — per-property derivation', () => {
  it('offsets the seed and keeps the authored count at multiplier 1 (PR defaults)', () => {
    expect(propertyRunParams(40, 3, { seed: DEFAULT_SEED, runsMultiplier: 1 })).toEqual({
      seed: DEFAULT_SEED + 3,
      numRuns: 40,
    })
  })

  it('scales the count and preserves the offset under a larger multiplier', () => {
    expect(propertyRunParams(40, 3, { seed: DEFAULT_SEED, runsMultiplier: 5 })).toEqual({
      seed: DEFAULT_SEED + 3,
      numRuns: 200,
    })
  })

  it('a swapped seed base re-bases every property without touching counts', () => {
    expect(propertyRunParams(30, 1, { seed: 900, runsMultiplier: 1 })).toEqual({ seed: 901, numRuns: 30 })
  })
})
