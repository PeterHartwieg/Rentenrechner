import { describe, expect, it } from 'vitest'
import type { InstanceCommon } from './instances'
import { normaliseOfferedBav } from './normaliseOfferedBav'

describe('normaliseOfferedBav', () => {
  it.each([0, 200])('clears conversion provenance at €%s without changing neighbours or the caller', monthlyGrossConversion => {
    const offer = {
      status: 'offered', monthlyGrossConversion,
      inputStatus: { monthlyGrossConversion: 'document', currentValueEUR: 'entered' } as InstanceCommon['inputStatus'],
      evidenceMap: { monthlyGrossConversion: 'statement', currentValueEUR: 'user_confirmed' } as InstanceCommon['evidenceMap'],
    }
    const normalised = normaliseOfferedBav(offer)
    expect(normalised.monthlyGrossConversion).toBe(0)
    expect(normalised.inputStatus).toEqual({ currentValueEUR: 'entered' })
    expect(normalised.evidenceMap).toEqual({ currentValueEUR: 'user_confirmed' })
    expect(offer.inputStatus?.monthlyGrossConversion).toBe('document')
    expect(offer.evidenceMap.monthlyGrossConversion).toBe('statement')
    expect(normaliseOfferedBav(normalised)).toEqual(normalised)
  })

  it('zeroes offers without mutating their other fields or the caller', () => {
    const offer = { status: 'offered', monthlyGrossConversion: 200, label: 'Angebot' }
    expect(normaliseOfferedBav(offer)).toEqual({ ...offer, monthlyGrossConversion: 0 })
    expect(offer.monthlyGrossConversion).toBe(200)
    expect(normaliseOfferedBav(normaliseOfferedBav(offer))).toEqual(normaliseOfferedBav(offer))
  })

  it.each(['active', 'paid_up', undefined])('leaves status %s unchanged', status => {
    const instance = { status, monthlyGrossConversion: 200 }
    expect(normaliseOfferedBav(instance)).toBe(instance)
  })
})
