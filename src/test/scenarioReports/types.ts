/**
 * Types for the local scenario-report suite (issue #377).
 *
 * The suite freezes complete SYNTHETIC inputs as committed JSON, runs them
 * through the existing engine entry points, and compares the extracted stage
 * values against baselines that were captured ONCE at a recorded base revision.
 *
 * Provenance: every captured value is an INTERNAL REGRESSION anchor. It proves
 * "the engine still produces what it produced at the base revision" — it does
 * NOT prove legal correctness. Independent, externally-verified anchors live in
 * `src/test/externalGoldenFixtures.ts` (see `docs/validation.md`).
 */

import type { GermanRules, PersonalProfile, ScenarioAssumptions } from '../../domain'
import type { Workspace } from '../../domain/workspace'

/**
 * Flattened stage values for one case, keyed by dotted path.
 *
 * - `number`: compared with an absolute tolerance (default 1e-6 EUR —
 *   IEEE-754 reassociation headroom only).
 * - `boolean` / `null`: compared exactly.
 *
 * Key insertion order follows the engine pipeline: funding → statutory
 * baseline → salary phase → accumulation → payout (gross) → tax → KV/PV →
 * net. The "first divergent stage" in a report is the first failing key in
 * this order.
 */
export type StageMap = Record<string, number | boolean | null>

/**
 * A pipeline stage the engine does not expose as a discrete number. Listed
 * explicitly instead of inventing a decomposition that would silently pin a
 * wrong derivation.
 */
export interface UnsupportedStage {
  /** Dotted path (or path pattern) that is intentionally not captured. */
  path: string
  /** Why the suite does not (cannot) pin this stage honestly. */
  reason: string
}

/** Frozen, complete compare-mode input (one JSON file). */
export interface CompareCaseInput {
  kind: 'compare'
  profile: PersonalProfile
  /** Complete pre-sync assumptions. The runner mirrors `useSimulationResult`: */
  /** syncMonthlyContributions(anchor) → simulateRetirementComparison. */
  assumptions: ScenarioAssumptions
  /** Monthly net out-of-pocket anchor fed to `syncMonthlyContributions`. */
  anchorNetPerMonth: number
}

/** Frozen, complete combine-mode workspace input (one JSON file). */
export interface CombineCaseInput {
  kind: 'combine'
  workspace: Workspace
}

/** Frozen seeded Monte-Carlo input (one JSON file). */
export interface MonteCarloCaseInput extends Omit<CompareCaseInput, 'kind'> {
  kind: 'monte-carlo'
  scenarioId: string
}

export type CaseInput = CompareCaseInput | CombineCaseInput | MonteCarloCaseInput

export type CaseMode = CaseInput['kind']

/**
 * Identity of the engine a capture or evaluation ran against.
 *
 * `sha` is the git HEAD; `engineSourcesDigestSha` is a content digest over the
 * calculation-source directories (`src/engine`, `src/rules`, `src/domain`,
 * `src/app`, `src/utils`, `src/data`), so an uncommitted engine patch is
 * visible even when HEAD looks unchanged. `engineSourcesDirty` lists whether
 * any of those files differ from the committed state.
 */
export interface EngineIdentity {
  sha: string
  engineSourcesDigestSha: string
  engineSourcesDirty: boolean
  engineDirtyPaths: string[]
}

/**
 * State of the rules identity recorded in `baselines/provenance.json`
 * versus the rules actually supplied to this run.
 *
 * - `match`: identity strings are equal.
 * - `drift`: provenance exists but the rules differ — stage deltas mix
 *   rule changes with model changes.
 * - `missing`: no provenance file — the baseline cannot be attributed and
 *   the suite must NOT report a clean run.
 */
export type RulesProvenanceStatus = 'match' | 'drift' | 'missing'

/**
 * Provenance class of a case.
 *
 * - `internal-regression`: expected values were captured from our own engine
 *   at the recorded base revision. Regression protection only.
 * - `external-golden-anchored`: the same, PLUS selected stage values are
 *   checked against explicit anchors imported from
 *   `src/test/externalGoldenFixtures.ts` (independently validated constants).
 */
export type CaseProvenance = 'internal-regression' | 'external-golden-anchored'

/** One check of a stage path against an independent externalGolden constant. */
export interface ExternalAnchorCheck {
  /** Stage path whose value must equal the anchor. */
  stagePath: string
  /** Identifier of the source fixture in `src/test/externalGoldenFixtures.ts`. */
  externalFixtureId: string
  /** Independently captured value (imported from the fixture file, never re-derived). */
  expected: number
  /** Tolerance justified by the fixture's own `toleranceEUR` convention. */
  tolerance: number
}

export interface SuiteCase {
  /** Stable identifier: `<family-id>/<case-id>`. */
  id: string
  /** Case identifier without the family prefix (also the JSON key). */
  caseId: string
  familyId: string
  familyLabel: string
  /** What this case pins and why it exists. */
  purpose: string
  mode: CaseMode
  provenance: CaseProvenance
  /**
   * Engine entry point under test — the suite never re-implements calculator
   * math, it only feeds frozen inputs into these.
   */
  entryPoint:
    | 'simulateRetirementComparison'
    | 'runCombineSimulation'
    | 'runMonteCarlo'
  /** Absolute tolerance (EUR / ratio units) for this case's numeric stages. */
  tolerance: number
  /** Frozen input (loaded from committed JSON by the suite registry). */
  input: CaseInput
  /** Run the extraction twice and require bit-identical stage maps (seeded MC). */
  deterministicReplay: boolean
  /** Only for `external-golden-anchored` cases. */
  externalAnchors?: ExternalAnchorCheck[]
}

/** One divergent stage between baseline and current engine output. */
export interface StageDiff {
  path: string
  expected: number | boolean | null
  actual: number | boolean | null
  delta: number | null
  tolerance: number
}

/** Result of comparing one case against its baseline. */
export interface CaseRunResult {
  caseId: string
  familyId: string
  familyLabel: string
  mode: CaseMode
  provenance: CaseProvenance
  purpose: string
  ok: boolean
  /** Number of stage values compared. */
  stageCount: number
  /** First divergent stage (pipeline order) — `undefined` when ok. */
  firstDivergence?: StageDiff
  /** All divergent stages. */
  diffs: StageDiff[]
  /** Anchor checks against externalGolden fixtures (when configured). */
  anchorFailures: string[]
  /** Stage paths the engine does not expose, listed instead of invented. */
  unsupported: UnsupportedStage[]
  /** Set when deterministic replay (seeded MC) produced differing maps. */
  replayDrift?: StageDiff
}

export interface SuiteRunResult {
  cases: CaseRunResult[]
  totalCases: number
  failedCases: number
  totalStages: number
  /**
   * Gate: every case ok AND the rules provenance is present and matching.
   * Missing provenance never counts as a clean run.
   */
  ok: boolean
  /** Identity JSON of the rules ACTUALLY supplied to this run. */
  rulesIdentityJson: string
  /** True when the baseline rules identity differs from `rulesIdentityJson`. */
  rulesSnapshotDrift: boolean
  rulesProvenanceStatus: RulesProvenanceStatus
}

/** What the report emitter produces (JSON + Markdown). */
export interface ScenarioReport {
  label: 'INTERNAL REGRESSION'
  provenanceNote: string
  /** ISO timestamp of the evaluation that produced this report. */
  generatedAt: string
  generatedFrom: {
    /** Engine the baselines were captured against. */
    baseline: EngineIdentity & { baseShaCapturedAt: string }
    /** Engine THIS evaluation ran against (may be a dirty working tree). */
    evaluated: EngineIdentity
    baselineRulesSnapshotSha: string
    /** Identity of the rules actually supplied to this run — never a global default. */
    liveRulesSnapshotSha: string
    rulesSnapshotDrift: boolean
    rulesProvenanceStatus: RulesProvenanceStatus
  }
  summary: {
    totalCases: number
    failedCases: number
    totalStages: number
    families: number
  }
  cases: Array<{
    caseId: string
    family: string
    familyLabel: string
    mode: CaseMode
    provenance: CaseProvenance
    purpose: string
    entryPoint: SuiteCase['entryPoint']
    ok: boolean
    stageCount: number
    firstDivergence?: StageDiff
    diffs: StageDiff[]
    anchorFailures: string[]
    unsupported: UnsupportedStage[]
    replayDrift?: StageDiff
  }>
}

/** Extracts the stage map (and unsupported list) for one frozen input. */
export type StageExtractor = (input: CaseInput, rules: GermanRules) => {
  stages: StageMap
  unsupported: UnsupportedStage[]
}
