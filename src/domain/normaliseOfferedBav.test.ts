import { describe, expect, it } from 'vitest'
import { normaliseOfferedBav } from './normaliseOfferedBav'

describe('normaliseOfferedBav', () => {
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
