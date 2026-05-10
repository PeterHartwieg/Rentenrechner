/**
 * Active rule set for the calculator.
 *
 * Year-specific rates (BBG, GKV Zusatzbeitrag, Rentenwert, Basiszins, cohort
 * tables, …) live in a year-named file like `de2026.ts`. To switch rule years:
 *
 *   1. Add `de2027.ts` (copy from `de2026.ts`, update changed values).
 *   2. Change the `activeRules` re-export below to point at the new year.
 *   3. Run tests; goldens that depend on annual rates may need updates.
 *
 * Cross-year statutory constants (1/120 spreading, Fünftelregelung divisor,
 * 12-year contract minimum, etc.) live in `legalConstants.ts` and are
 * year-independent — they change only when the underlying law changes.
 */
import { de2026Rules as activeRules } from './de2026'

export { activeRules }
export { legalConstants } from './legalConstants'
export const RULES_YEAR: number = activeRules.year
