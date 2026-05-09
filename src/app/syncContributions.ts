/**
 * Monthly-contribution sync helpers — re-export barrel.
 *
 * The implementation has moved to `src/utils/syncContributions.ts` so that
 * engine and API modules can import from it without creating an upward
 * `engine → app` dependency. This barrel keeps backward-compat for all
 * existing `src/app/` callers.
 */
export { normalizeMonthlyNettoBelastung, syncMonthlyContributions } from '../utils/syncContributions'
