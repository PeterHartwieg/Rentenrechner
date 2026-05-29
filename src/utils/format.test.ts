import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './format'

/**
 * Tests for `formatRelativeTime` — the German-localised relative-time
 * formatter used by `/eingaben/produkte`'s right-rail receipt strip
 * ("zuletzt geändert vor 2 Min." etc.).
 *
 * The helper is pure: it takes an elapsed-milliseconds delta and returns
 * a German string. We exercise the seconds → minutes → hours → days →
 * weeks boundaries plus the "soeben" floor and the negative-input
 * (clock-skew) safety branch.
 */

describe('formatRelativeTime', () => {
  it('returns "soeben" for 0 ms (just edited)', () => {
    expect(formatRelativeTime(0)).toBe('soeben')
  })

  it('returns "soeben" for sub-10-second deltas (jitter window)', () => {
    expect(formatRelativeTime(5_000)).toBe('soeben')
    expect(formatRelativeTime(9_999)).toBe('soeben')
  })

  it('returns "vor X Sek." for 10-second-to-1-minute deltas', () => {
    expect(formatRelativeTime(10_000)).toBe('vor 10 Sek.')
    expect(formatRelativeTime(30_000)).toBe('vor 30 Sek.')
    expect(formatRelativeTime(59_000)).toBe('vor 59 Sek.')
  })

  it('returns "vor X Min." for 1-minute-to-1-hour deltas', () => {
    expect(formatRelativeTime(60_000)).toBe('vor 1 Min.')
    expect(formatRelativeTime(2 * 60_000)).toBe('vor 2 Min.')
    expect(formatRelativeTime(59 * 60_000)).toBe('vor 59 Min.')
  })

  it('returns "vor X Std." for 1-hour-to-1-day deltas', () => {
    expect(formatRelativeTime(60 * 60_000)).toBe('vor 1 Std.')
    expect(formatRelativeTime(2 * 60 * 60_000)).toBe('vor 2 Std.')
    expect(formatRelativeTime(23 * 60 * 60_000)).toBe('vor 23 Std.')
  })

  it('returns "vor 1 Tag" / "vor X Tagen" for 1-to-7-day deltas', () => {
    expect(formatRelativeTime(24 * 60 * 60_000)).toBe('vor 1 Tag')
    expect(formatRelativeTime(2 * 24 * 60 * 60_000)).toBe('vor 2 Tagen')
    expect(formatRelativeTime(6 * 24 * 60 * 60_000)).toBe('vor 6 Tagen')
  })

  it('returns "vor 1 Woche" / "vor X Wochen" for 7+ day deltas', () => {
    expect(formatRelativeTime(7 * 24 * 60 * 60_000)).toBe('vor 1 Woche')
    expect(formatRelativeTime(14 * 24 * 60 * 60_000)).toBe('vor 2 Wochen')
    expect(formatRelativeTime(28 * 24 * 60 * 60_000)).toBe('vor 4 Wochen')
  })

  it('clamps negative deltas (clock skew) to "soeben"', () => {
    expect(formatRelativeTime(-1_000)).toBe('soeben')
    expect(formatRelativeTime(-60_000)).toBe('soeben')
  })

  it('clamps non-finite deltas (NaN / Infinity) to "soeben"', () => {
    expect(formatRelativeTime(NaN)).toBe('soeben')
    expect(formatRelativeTime(Infinity)).toBe('soeben')
    expect(formatRelativeTime(-Infinity)).toBe('soeben')
  })
})
