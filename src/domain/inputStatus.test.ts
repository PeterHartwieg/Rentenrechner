/**
 * Input-status sanitisers — semantics, not implementation.
 *
 * The binding rule these tests pin: a corrupt status byte or a malformed
 * pension entry method must degrade to "no metadata", never take the
 * surrounding scenario down with it.
 */

import { describe, expect, it } from 'vitest'
import {
  RESERVED_INPUT_STATUS_KEYS,
  isInputStatus,
  sanitizeInputStatusMap,
  sanitizePensionEntryMethod,
} from './inputStatus'

describe('sanitizeInputStatusMap', () => {
  it('keeps every known status value', () => {
    const map = sanitizeInputStatusMap({
      a: 'unknown',
      b: 'assumed',
      c: 'entered',
      d: 'document',
    })
    expect(map).toEqual({ a: 'unknown', b: 'assumed', c: 'entered', d: 'document' })
  })

  it('drops entries with an unknown status value and keeps the rest', () => {
    expect(sanitizeInputStatusMap({ good: 'entered', bad: 'confirmed', worse: 7 })).toEqual({
      good: 'entered',
    })
  })

  it('returns undefined when nothing usable survives', () => {
    expect(sanitizeInputStatusMap({ bad: 'nope' })).toBeUndefined()
    expect(sanitizeInputStatusMap({})).toBeUndefined()
    expect(sanitizeInputStatusMap(null)).toBeUndefined()
    expect(sanitizeInputStatusMap('entered')).toBeUndefined()
    expect(sanitizeInputStatusMap(['entered'])).toBeUndefined()
  })

  it('drops non-reserved keys only for the scenario-level map', () => {
    const input = { 'profile.age': 'entered', 'profile.lieblingsfarbe': 'entered' }
    expect(sanitizeInputStatusMap(input, { restrictToReservedKeys: true })).toEqual({
      'profile.age': 'entered',
    })
    // Per-instance maps are free-form (keyed like `evidenceMap`).
    expect(sanitizeInputStatusMap(input)).toEqual(input)
  })

  it('accepts every reserved key', () => {
    const all = Object.fromEntries(RESERVED_INPUT_STATUS_KEYS.map((k) => [k, 'entered']))
    expect(sanitizeInputStatusMap(all, { restrictToReservedKeys: true })).toEqual(all)
  })
})

describe('isInputStatus', () => {
  it('accepts the four statuses and nothing else', () => {
    expect(isInputStatus('unknown')).toBe(true)
    expect(isInputStatus('assumed')).toBe(true)
    expect(isInputStatus('entered')).toBe(true)
    expect(isInputStatus('document')).toBe(true)
    expect(isInputStatus('user_confirmed')).toBe(false)
    expect(isInputStatus(undefined)).toBe(false)
  })
})

describe('sanitizePensionEntryMethod', () => {
  it('round-trips every well-formed kind', () => {
    expect(sanitizePensionEntryMethod({ kind: 'skipped' })).toEqual({ kind: 'skipped' })
    expect(sanitizePensionEntryMethod({ kind: 'document', monthlyGrossEUR: 1400 })).toEqual({
      kind: 'document',
      monthlyGrossEUR: 1400,
    })
    expect(
      sanitizePensionEntryMethod({ kind: 'career', careerStartAge: 22, pauseYears: 3 }),
    ).toEqual({ kind: 'career', careerStartAge: 22, pauseYears: 3 })
    expect(sanitizePensionEntryMethod({ kind: 'years', contributionYears: 18 })).toEqual({
      kind: 'years',
      contributionYears: 18,
    })
    expect(sanitizePensionEntryMethod({ kind: 'points', entgeltpunkte: 21.5 })).toEqual({
      kind: 'points',
      entgeltpunkte: 21.5,
    })
    expect(
      sanitizePensionEntryMethod({ kind: 'projected-gross', monthlyGrossEUR: 0 }),
    ).toEqual({ kind: 'projected-gross', monthlyGrossEUR: 0 })
  })

  it('drops extra payload fields rather than carrying them through', () => {
    expect(
      sanitizePensionEntryMethod({ kind: 'years', contributionYears: 18, injected: 'x' }),
    ).toEqual({ kind: 'years', contributionYears: 18 })
  })

  it('degrades to undefined for unknown, missing or non-finite payloads', () => {
    expect(sanitizePensionEntryMethod({ kind: 'telepathy' })).toBeUndefined()
    expect(sanitizePensionEntryMethod({ kind: 'document' })).toBeUndefined()
    expect(sanitizePensionEntryMethod({ kind: 'points', entgeltpunkte: NaN })).toBeUndefined()
    expect(sanitizePensionEntryMethod({ kind: 'years', contributionYears: -1 })).toBeUndefined()
    expect(
      sanitizePensionEntryMethod({ kind: 'career', careerStartAge: 20 }),
    ).toBeUndefined()
    expect(sanitizePensionEntryMethod(undefined)).toBeUndefined()
    expect(sanitizePensionEntryMethod([])).toBeUndefined()
  })
})
