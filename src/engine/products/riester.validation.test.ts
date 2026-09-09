import { describe, expect, it } from 'vitest'
import { validateRiester } from './riester.validation'
import { defaultRiesterAssumptions } from '../../data/defaultScenario'
import type { RiesterAssumptions, RiesterEligibility } from '../../domain'

const base: RiesterAssumptions = JSON.parse(JSON.stringify(defaultRiesterAssumptions))

function withEligibility(overrides: Record<string, unknown>): RiesterAssumptions {
  return { ...base, eligibility: { ...base.eligibility, ...overrides } as RiesterEligibility }
}

describe('validateRiester — claimsChildAllowance (#371)', () => {
  it('accepts the flag being absent (backwards-compatible stored state)', () => {
    expect(validateRiester(base)).toBe(true)
  })

  it.each([true, false])('accepts claimsChildAllowance = %s', (value) => {
    expect(validateRiester(withEligibility({ claimsChildAllowance: value }))).toBe(true)
  })

  // The engine reads `!== false`, so any of these would silently count as
  // claiming the Kinderzulage.
  it.each(['false', 0, null])('rejects claimsChildAllowance = %p', (value) => {
    expect(validateRiester(withEligibility({ claimsChildAllowance: value }))).toBe(false)
  })
})
