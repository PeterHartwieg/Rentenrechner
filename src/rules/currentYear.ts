import { RULES_YEAR } from './index'

/** Read at call time: ages/labels follow the calendar; calculations use compiled rules. */
export function getCurrentYear(now = new Date()): { calendarYear: number; rulesYear: number } {
  return { calendarYear: now.getFullYear(), rulesYear: RULES_YEAR }
}

/** Build/test guard only; the calendar must never silently select statutory values. */
export function getRuleYearFreshness(
  availableRuleYears: readonly number[] = [RULES_YEAR],
  now = new Date(),
): 'current' | 'warning' | 'overdue' {
  const { calendarYear, rulesYear } = getCurrentYear(now)
  if (calendarYear > rulesYear && !availableRuleYears.includes(calendarYear)) return 'overdue'
  if (calendarYear === rulesYear && now.getMonth() >= 11 && !availableRuleYears.includes(rulesYear + 1)) {
    return 'warning'
  }
  return 'current'
}
