import { afterEach, describe, expect, it, vi } from 'vitest'
import { RULES_YEAR } from './index'
import { getCurrentYear, getRuleYearFreshness } from './currentYear'

// Inspect actual compiled rule exports, not the API's active-year-only manifest.
const ruleModules = import.meta.glob<Record<string, { year?: number }>>('./de????.ts', { eager: true })
const availableRuleYears = Object.values(ruleModules).flatMap((module) =>
  Object.entries(module).flatMap(([name, value]) =>
    name.endsWith('Rules') && typeof value.year === 'number' ? [value.year] : [],
  ),
)

it('has a rule set for the real calendar year before rollover becomes overdue', () => {
  const status = getRuleYearFreshness(availableRuleYears)
  const { calendarYear } = getCurrentYear()
  if (status === 'warning') {
    console.warn(`Rules rollover: add officially verified rules for ${RULES_YEAR + 1} before January 1 (follow-up to #171).`)
  }
  expect(status, `Missing rules for ${calendarYear}; active rules are ${RULES_YEAR}. See TODO(#171) in src/rules/index.ts.`)
    .not.toBe('overdue')
})

describe('rule-year freshness boundaries', () => {
  afterEach(() => vi.useRealTimers())

  it.each([
    ['2026-11-30T23:59:59', 'current'],
    ['2026-12-01T00:00:00', 'warning'],
    ['2026-12-31T23:59:59', 'warning'],
    ['2027-01-01T00:00:00', 'overdue'],
    ['2027-01-02', 'overdue'],
    ['2028-01-02', 'overdue'],
  ] as const)('reports %s as %s without next-year rules', (date, expected) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(date))
    expect(getRuleYearFreshness([RULES_YEAR])).toBe(expected)
  })

  it('keeps calendar year and rules year separate after January 1', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T23:59:59'))
    expect(getCurrentYear()).toEqual({ calendarYear: 2026, rulesYear: RULES_YEAR })
    vi.setSystemTime(new Date('2027-01-02'))
    expect(getCurrentYear()).toEqual({ calendarYear: 2027, rulesYear: RULES_YEAR })
    expect(getRuleYearFreshness()).toBe('overdue')
  })

  it.each(['2026-12-01', '2027-01-02'])('accepts an available next-year rule set on %s', (date) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(date))
    // Availability only: this does not create or copy any statutory values.
    expect(getRuleYearFreshness([RULES_YEAR, RULES_YEAR + 1])).toBe('current')
  })
})
