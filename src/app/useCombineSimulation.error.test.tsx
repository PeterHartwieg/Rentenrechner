// @vitest-environment jsdom
/**
 * `useCombineSimulation` error state (state contract §10.10).
 *
 * A throw inside the simulation used to reach the renderer. It is now caught
 * and surfaced as `error`, with the bundle fields still present (and empty) so
 * existing consumers keep compiling and reading — and so
 * `selectResultReadiness` can report `'error'` instead of a plausible zero.
 */

import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2 } from '../storage'
import { selectResultReadiness } from './resultReadiness'

vi.mock('../engine/portfolioAdapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine/portfolioAdapter')>()
  return {
    ...actual,
    simulatePortfolio: (...args: Parameters<typeof actual.simulatePortfolio>) => {
      if (shouldThrow) throw new Error('engine exploded')
      return actual.simulatePortfolio(...args)
    },
  }
})

let shouldThrow = false
afterEach(() => {
  shouldThrow = false
})

const { useCombineSimulation } = await import('./useCombineSimulation')

function makeWs() {
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    { ...defaultAssumptions } as unknown as Record<string, unknown>,
  )
}

describe('useCombineSimulation error state', () => {
  it('returns error: null and a real bundle on the happy path', () => {
    const ws = makeWs()
    const { result } = renderHook(() => useCombineSimulation(ws, de2026Rules))
    expect(result.current.error).toBeNull()
    expect(result.current.combinedByScenarioId.basis.monthlyNetIncome).toBeGreaterThan(0)
  })

  it('catches a throw, returns an empty bundle, and reads as an error state', () => {
    shouldThrow = true
    const ws = makeWs()
    const { result } = renderHook(() => useCombineSimulation(ws, de2026Rules))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.combinedByScenarioId).toEqual({})
    expect(result.current.perInstance).toEqual({})

    const readiness = selectResultReadiness(ws, result.current, result.current.error)
    expect(readiness.status).toBe('error')
    expect(readiness.canShowHouseholdTotal).toBe(false)
  })
})
