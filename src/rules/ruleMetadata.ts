/**
 * Calculation-model and rules provenance metadata.
 *
 * This module gives the upcoming scenario runner and UI a way to stamp every
 * result with WHAT produced it — which rule set, which algorithm version —
 * and to look that information up again later. It is deliberately small:
 * plain data types plus shared model-level constants, no engine code.
 *
 * What it is NOT: a replay mechanism. Carrying an ID does not reconstruct the
 * law of another year — see `REPLAY_LIMITATIONS`. Per-rule-set provenance
 * lives in the year file itself (`de2026.ts` → `de2026RulesMetadata`) so the
 * provenance is updated in the same commit as the values it describes.
 */

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
  /** Stable ID of the year file, e.g. 'de2026'. */
  ruleSetId: string
  /** The calendar year the statutory values are issued for. */
  ruleYear: number
  /** Algorithm that consumed this rule set. */
  calculationModel: CalculationModelVersion
  /** Source / effective-date provenance for the areas this rule set covers. */
  areas: readonly RuleAreaProvenance[]
  projectionAssumption: string
  replayLimitations: readonly string[]
}

// ---------------------------------------------------------------------------
// Model-level constants (shared by every rule set this engine can compile)
// ---------------------------------------------------------------------------

export const TAX_CALCULATION_MODEL: CalculationModelVersion = {
  id: 'de-est-grundtarif-zone-formula',
  version: 1,
  summary:
    'Five-zone §32a EStG Grundtarif evaluated on full euros of zvE with per-zone ' +
    'coefficients from the active rule set (statutory floor per zone); solidarity ' +
    'surcharge as min(ESt × 5.5 %, (ESt − Freigrenze) × 11.9 %) above the year-specific ' +
    'Freigrenze. Version bumps only on algorithm change — zone restructuring, a new ' +
    'rounding step, a different formula shape — never on annual coefficient updates.',
}

/**
 * Rule year vs. projection horizon: the engine projects decades past the rule
 * year while carrying the active rule set forward unchanged. Results for years
 * > `ruleYear` are holding assumptions, not legislation.
 */
export const PROJECTION_ASSUMPTION =
  'Projection years after the rule year reuse the active rule set unchanged. The ' +
  'engine does not predict future legislation: values applied beyond `ruleYear` are ' +
  'a documented holding assumption, not law. Results must not be read as year-specific ' +
  'legislation for any year past the rule year.'

/**
 * Why a ruleSetId alone does not guarantee historical replay. Kept at model
 * level because these hold for every year file the engine can compile.
 */
export const REPLAY_LIMITATIONS: readonly string[] = [
  'A result stamped with a ruleSetId is reproducible only while the matching year file ' +
    'is compiled into the bundle (src/rules/index.ts swaps the active set atomically); ' +
    'older year files may be retired, after which the ID identifies but cannot reproduce.',
  'The ID documents which rule set produced a result — it does not reconstruct historical ' +
    'law. Replaying a result from another rule year requires that year file with verified ' +
    'values, plus its own external goldens.',
  'Cross-year cohort tables (besteuerungsanteilGrv, versorgungsfreibetrag, ertragsanteilByAge ' +
    'in legalConstants.ts) are parametrised over retirement years inside a single rule set; ' +
    'they are not a substitute for year rule files.',
  'When the calculation-model version changes, stored results stay valid for the model ' +
    'version they were stamped with; they are not silently recomputed under the new model.',
]
