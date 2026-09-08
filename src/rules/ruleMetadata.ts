/**
 * Calculation-model and rules provenance metadata.
 *
 * Gives the scenario runner and UI a way to stamp every result with WHAT
 * produced it — which rule set, which revision, which algorithm version,
 * which content fingerprint — and to look that up later. Plain data types
 * plus small deterministic helpers; no engine code.
 *
 * What it is NOT: a replay mechanism. Nothing in the application preserves
 * historical outputs — inputs are stored and recalculated under the current
 * rules. Reproducing an old number needs the exact engine revision plus a
 * complete rule snapshot; see `REPLAY_LIMITATIONS`. Per-rule-set provenance
 * lives in the year file (`de2026.ts` → `de2026RulesMetadata`) so provenance
 * moves in the same commit as the values it describes.
 */

import type { GermanRules } from '../domain'
import type { LegalRuleData } from './legalConstants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Identifies one implemented algorithm (independent of the coefficient
 * values fed into it). Two rule sets can share a calculation model while
 * carrying different year coefficients.
 */
export interface CalculationModelVersion {
  /** Stable identifier, e.g. 'de-est-grundtarif-zone-formula'. */
  id: string
  /**
   * Monotonic version. Bump ONLY when the algorithm itself changes (zone
   * restructuring, a new rounding step, a different formula shape) — never
   * on annual coefficient updates, which are rule-set data.
   */
  version: number
  /** One-paragraph statement of what the version pins. */
  summary: string
}

/** How a value set is pinned in the test suite. */
export type RulePinKind =
  /** Asserted against captures from an official external calculator. */
  | 'external-golden'
  /** Asserted as a literal tripwire (change requires a law-amendment citation). */
  | 'statutory-pin'
  /** Carries an inline source citation only — no direct golden coverage. */
  | 'inline-citation'

/** Source / effective-date provenance for one rules area. */
export interface RuleAreaProvenance {
  /**
   * Dotted key into the rule inputs — `GermanRules` fields (e.g.
   * 'incomeTax.tariff') or `legalConstants` groups (e.g. 'soli').
   */
  area: string
  /** Statutory basis, cited the way this repo already cites it. */
  statute: string
  /** Where the values came from, as cited in this repo (capture date / URL). */
  source: string
  /**
   * ISO date (YYYY-MM-DD) from which the value set applies, per the cited
   * source. Omitted for cross-year constants whose in-force date is not
   * pinned in this repo.
   */
  effectiveFrom?: string
  /** Test coverage class for this area. */
  pinnedBy: RulePinKind
}

/** Provenance for one compiled rule set (one year file). */
export interface RuleSetMetadata {
  /** Stable ID of the year file, e.g. 'de2026' — identifies the YEAR only. */
  ruleSetId: string
  /** The calendar year the statutory values are issued for. */
  ruleYear: number
  /**
   * Monotonic revision WITHIN the rule year. Same-year amendments (a
   * Stichtagsnovelle, a re-published value) bump this and update `source`
   * in the same commit. Two results sharing `ruleSetId` but differing in
   * `revision` were produced under different rules.
   */
  revision: number
  /** Algorithm that consumed this rule set. */
  calculationModel: CalculationModelVersion
  /**
   * Which parts of the engine this provenance covers. Deliberately narrow:
   * these entries cover the areas routed through `src/engine/tax.ts` and
   * their rule inputs. They are NOT a claim that every engine formula or
   * every field of the rule set is documented here — other areas carry
   * inline citations in the year file comments.
   */
  scope: string
  /** Source / effective-date provenance for the covered areas. */
  areas: readonly RuleAreaProvenance[]
  projectionAssumption: string
  replayLimitations: readonly string[]
}

/** Compact identity stamp a runner records alongside each result. */
export interface RuleSetIdentity {
  ruleSetId: string
  ruleYear: number
  revision: number
  /**
   * Content fingerprint of the compiled year rules AND every exported
   * cross-year rule datum (the `legalRuleData` catalog in
   * `legalConstants.ts`) via `ruleSetFingerprint`. Amendments to either
   * move it.
   */
  contentFingerprint: string
}

// ---------------------------------------------------------------------------
// Model-level constants (shared by every rule set this engine can compile)
// ---------------------------------------------------------------------------

export const TAX_CALCULATION_MODEL: CalculationModelVersion = {
  id: 'de-est-grundtarif-zone-formula',
  version: 1,
  summary:
    'Five-zone §32a EStG Grundtarif evaluated on full euros of zvE, coefficients taken ' +
    'from the active rule set with a statutory floor per zone; solidarity surcharge as ' +
    'the lesser of the flat rate and the Milderungszone amount above the year-specific ' +
    'Freigrenze. Version bumps only on algorithm change — zone restructuring, a new ' +
    'rounding step, a different formula shape — never on annual coefficient updates.',
}

/**
 * Rule year vs. projection horizon. The projection runs decades past the
 * rule year, but that does NOT mean every future-year value is simply held
 * constant: the active set already models enacted multi-year schedules
 * (cohort tables progressing to 2058, product start years, age splits by
 * contract year). Beyond those enacted schedules, values are held at
 * rule-year level as a holding assumption; future amendments are unknown
 * and not predicted.
 */
export const PROJECTION_ASSUMPTION =
  'The engine projects decades past the rule year using two kinds of future-year ' +
  'values. (1) Enacted schedules the rules already model — e.g. the Besteuerungsanteil ' +
  'and Versorgungsfreibetrag cohort tables running to 2058, the AVD product start year, ' +
  'insurance age splits by contract year — are legislated values and are applied to ' +
  'their years. (2) Everything beyond such enacted schedules reuses the active rule ' +
  'year unchanged as a documented holding assumption. Neither kind is a prediction of ' +
  'future legislation, and results for years past the rule year must not be presented ' +
  'as verified year-specific law.'

/**
 * Why a ruleSetId alone never guarantees historical replay. Kept at model
 * level because these hold for every year file this engine can compile.
 */
export const REPLAY_LIMITATIONS: readonly string[] = [
  'Nothing in the application preserves historical outputs: scenarios are stored as ' +
    'inputs and recalculated under the currently compiled rules. A result is reproduced ' +
    'only by recomputing it under the producing rule set.',
  'Reproducing a past result requires the exact engine revision (git SHA) plus a ' +
    'complete rule snapshot from that revision — the year file AND all cross-year ' +
    'legalConstants and cohort algorithms (besteuerungsanteilGrv, versorgungsfreibetrag, ' +
    'ertragsanteilByAge) AND the engine formula code as of that revision. Matching the ' +
    'year file alone is not sufficient.',
  'The ruleSetId identifies a rule YEAR, not revisions within it: same-year amendments ' +
    'change values without changing the ID. Pair the ID with `revision` and the runtime ' +
    '`contentFingerprint` (see `RuleSetIdentity`) to tell them apart.',
  'A content fingerprint is a change detector, not a reproduction mechanism: it says ' +
    'two rule sets differ, and pairs with a stored snapshot (`canonicalRuleSetSnapshot`) ' +
    'plus the engine revision for any attempt at exact replay.',
  'This metadata documents the tax areas routed through src/engine/tax.ts; it does not ' +
    'snapshot the whole engine. Historical replay needs the full engine revision ' +
    'regardless of how complete this metadata is.',
  'When the calculation-model version changes, the application has nothing to carry ' +
    'over: it stores inputs, not outputs, so scenarios simply recompute under the new ' +
    'model. Only a runner that separately stored stamped outputs could compare results ' +
    'across model versions — nothing in this codebase does that today.',
]

// ---------------------------------------------------------------------------
// Content identity helpers — deterministic, dependency-free, synchronous
// ---------------------------------------------------------------------------

/**
 * Canonical serialization of the rule content this engine compiles: the year
 * rules AND the `legalRuleData` catalog — every exported non-function datum
 * of `legalConstants.ts` — keys sorted recursively, arrays in order, numbers
 * via JSON round-trip. Two (rules, catalog) pairs serialize identically iff
 * they carry the same values regardless of key order.
 *
 * Scope note: this covers rule DATA. The cross-year cohort FUNCTIONS in
 * `legalConstants.ts` (`besteuerungsanteilGrv`, `versorgungsfreibetrag`,
 * `ertragsanteilByAge`, `halbeinkuenfteMinAgeForContractStartYear`) are code,
 * not data — their behavior is pinned only by the engine revision, never by
 * this snapshot.
 */
export function canonicalRuleSetSnapshot(rules: GermanRules, legalData: LegalRuleData): string {
  return canonicalize({ legalData, rules })
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * Content fingerprint of the compiled rule content: two domain-separated
 * FNV-1a rounds over the canonical snapshot of the year rules and the
 * `legalRuleData` catalog, 16 hex chars. A quick change detector that moves
 * whenever EITHER input is amended (same-year value change, soli slope,
 * §39b cap, §1a divisor, Pauschbeträge, InvStG Teilfreistellung, …) — always
 * pair it with the stored snapshot and the engine revision for exact replay
 * (see REPLAY_LIMITATIONS).
 *
 * Honesty note: two 32-bit FNV passes over the same input are a change
 * detector, not a collision-resistant 64-bit hash. Equal fingerprints strongly
 * suggest equal content; they prove nothing.
 */
export function ruleSetFingerprint(rules: GermanRules, legalData: LegalRuleData): string {
  const canonical = canonicalRuleSetSnapshot(rules, legalData)
  return (
    fnv1a32(0x811c9dc5, `rules-identity/1:${canonical}`) +
    fnv1a32(0x01935a97, `rules-identity/2:${canonical}`)
  )
}

function fnv1a32(offsetBasis: number, input: string): string {
  let hash = offsetBasis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Compose the identity stamp from a rule set, the cross-year rule data, and its metadata. */
export function ruleSetIdentity(
  rules: GermanRules,
  legalData: LegalRuleData,
  metadata: RuleSetMetadata,
): RuleSetIdentity {
  return {
    ruleSetId: metadata.ruleSetId,
    ruleYear: metadata.ruleYear,
    revision: metadata.revision,
    contentFingerprint: ruleSetFingerprint(rules, legalData),
  }
}
