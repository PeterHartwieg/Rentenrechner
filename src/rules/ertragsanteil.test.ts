import { describe, expect, it } from 'vitest'
import { ertragsanteilByAge } from './legalConstants'

// Independently transcribed from the official §22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG table:
// https://www.gesetze-im-internet.de/estg/__22.html (verified 2026-10-30).
// One percentage per completed age, grouped by decades starting at age 0.
// Keep this oracle independent of the production bands.
const lawPercentByAge = [
  59, 59, 58, 58, 57, 57, 56, 56, 56, 55,
  55, 54, 54, 53, 53, 52, 52, 51, 51, 50,
  50, 49, 49, 48, 48, 47, 47, 46, 45, 45,
  44, 44, 43, 42, 42, 41, 40, 40, 39, 38,
  38, 37, 36, 35, 35, 34, 33, 33, 32, 31,
  30, 29, 29, 28, 27, 26, 26, 25, 24, 23,
  22, 22, 21, 20, 19, 18, 18, 17, 16, 15,
  15, 14, 13, 13, 12, 11, 10, 10, 9, 9,
  8, 7, 7, 6, 6, 5, 5, 5, 4, 4,
  4, 4, 3, 3, 2, 2, 2, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1,
] as const

describe('ertragsanteilByAge — official §22 EStG table', () => {
  it('covers every age from 0 through 120', () => {
    expect(lawPercentByAge).toHaveLength(121)
  })

  it.each(lawPercentByAge.map((percent, age) => [age, percent]))(
    'age %i has a statutory Ertragsanteil of %i percent',
    (age, percent) => {
      expect(ertragsanteilByAge(age)).toBe(percent / 100)
    },
  )

  it.each([
    [-10, 0.59],
    [-0.1, 0.59],
    [1.9, 0.59],
    [59.9, 0.23],
    [60.9, 0.22],
    [96.9, 0.02],
    [97.1, 0.01],
    [150, 0.01],
  ])('floors fractional ages and clamps negative ages: %s → %s', (age, expected) => {
    expect(ertragsanteilByAge(age)).toBe(expected)
  })
})
