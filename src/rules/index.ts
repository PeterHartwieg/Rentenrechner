/**
 * Active rule set for the calculator.
 *
 * Year-specific rates (BBG, GKV Zusatzbeitrag, Rentenwert, Basiszins, cohort
 * tables, …) live in a year-named file like `de2026.ts`. To switch rule years:
 *
 *   1. Add `de2027.ts` (copy from `de2026.ts`, update changed values AND the
 *      co-located provenance metadata block at the bottom of the file; any
 *      same-year amendment bumps `revision` and re-points the affected
 *      `source` in the same commit).
 *   2. Change the `activeRules` re-export below to point at the new year.
 *   3. Run tests; goldens that depend on annual rates may need updates — and
 *      every new value set needs its own external captures before it may ship
 *      (see docs/rules-versioning.md).
 *
 * Cross-year statutory constants (1/120 spreading, Fünftelregelung divisor,
 * 12-year contract minimum, Soli rate / Milderungszone, etc.) live in
 * `legalConstants.ts` and are year-independent — they change only when the
 * underlying law changes.
 */
import { de2026Rules as activeRules, de2026RulesMetadata } from './de2026'
import { ruleSetIdentity } from './ruleMetadata'
import type { RuleSetIdentity, RuleSetMetadata } from './ruleMetadata'

export { activeRules }
export { de2026RulesMetadata }
export { legalConstants } from './legalConstants'
export {
  canonicalRuleSetSnapshot,
  PROJECTION_ASSUMPTION,
  REPLAY_LIMITATIONS,
  ruleSetFingerprint,
  ruleSetIdentity,
  TAX_CALCULATION_MODEL,
} from './ruleMetadata'
export type {
  CalculationModelVersion,
  RuleAreaProvenance,
  RulePinKind,
  RuleSetIdentity,
  RuleSetMetadata,
} from './ruleMetadata'
export const RULES_YEAR: number = activeRules.year

/**
 * Provenance for the active rule set. Scenario runner and UI stamp this onto
 * every result (`ruleSetId`, `ruleYear`, `revision`, `calculationModel`)
 * instead of inventing their own versioning. See docs/rules-versioning.md:
 * an ID identifies what produced a result, it does not reproduce it — replay
 * needs the exact engine revision plus a complete rule snapshot.
 */
export const activeRulesMetadata: RuleSetMetadata = de2026RulesMetadata

/**
 * Compact identity stamp for results produced by the currently compiled rule
 * set: year ID + same-year revision + content fingerprint. Re-derive via
 * `ruleSetIdentity(activeRules, activeRulesMetadata)`; a stored stamp whose
 * fingerprint differs from the current one was produced under different rule
 * content (e.g. a same-year amendment).
 */
export const activeRuleSetIdentity: RuleSetIdentity = ruleSetIdentity(
  activeRules,
  de2026RulesMetadata,
)

/**
 * Look up provenance for a stored result's `ruleSetId`. Returns null for any
 * ID this build cannot speak for (other rule year, retired year file, or a
 * future build) — callers must surface that as "produced under different
 * rules", never as a silent pass-through.
 */
export function rulesMetadataById(ruleSetId: string): RuleSetMetadata | null {
  return ruleSetId === de2026RulesMetadata.ruleSetId ? de2026RulesMetadata : null
}
