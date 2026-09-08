/**
 * Scenario-report suite core (issue #377): registry, runner, diff engine.
 *
 * The registry pairs
 *   - frozen inputs      from `inputs/<familyId>.json`   (committed)
 *   - frozen baselines   from `baselines/<familyId>.json` (committed, captured ONCE)
 *   - case metadata       from the CASE_META table below
 * and `runSuite` replays every case through the existing engine entry points.
 *
 * Baselines are INTERNAL REGRESSION anchors: they pin "the engine still produces
 * what it produced at the base revision". They are NOT legal proof. Independent
 * anchors live in `src/test/externalGoldenFixtures.ts` and are consulted only
 * through the `anchor` entries in CASE_META.
 *
 * Updating a baseline is a deliberate act: `npm run scenario:update -- --reason "..."`.
 * The runner never auto-accepts divergence — an unexpected delta fails the suite.
 */

import { createHash } from 'node:crypto'
import type { GermanRules } from '../../domain'
import {
  activeRules,
  activeRulesMetadata,
  canonicalRuleSetSnapshot,
  legalRuleData,
  ruleSetIdentity,
} from '../../rules'
import type { LegalRuleData, RuleSetIdentity } from '../../rules'
import {
  bavContributionLimitGoldenValues,
} from '../externalGoldenFixtures'
import { cohortScheduleFingerprint } from './rulesFingerprint'
import type { CohortScheduleFingerprint } from './rulesFingerprint'
import type {
  CaseInput,
  CaseRunResult,
  ExternalAnchorCheck,
  StageDiff,
  StageMap,
  SuiteCase,
  SuiteRunResult,
} from './types'
import { extractStages } from './stages'

// ---------------------------------------------------------------------------
// Frozen input / baseline / provenance loading
// ---------------------------------------------------------------------------

const inputModules = import.meta.glob('./inputs/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Record<string, CaseInput>>

const baselineModules = import.meta.glob('./baselines/family-*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Record<string, StageMap>>

const provenanceModule = import.meta.glob('./baselines/provenance.json', {
  eager: true,
  import: 'default',
}) as Record<string, ScenarioProvenanceFile>

function basename(path: string): string {
  const last = path.split('/').pop() ?? path
  return last.replace(/\.json$/, '')
}

const INPUTS_BY_FAMILY: Record<string, Record<string, CaseInput>> = Object.fromEntries(
  Object.entries(inputModules).map(([path, value]) => [basename(path), value]),
)

/** familyId → caseId → frozen input (as committed under `inputs/`). */
export function loadFrozenInputs(): Record<string, Record<string, CaseInput>> {
  return INPUTS_BY_FAMILY
}

const BASELINES_BY_FAMILY: Record<string, Record<string, StageMap>> = Object.fromEntries(
  Object.entries(baselineModules).map(([path, value]) => [basename(path).replace(/^family-/, ''), value]),
)

/**
 * Shape of `baselines/provenance.json` — written once by the capture command.
 *
 * The rules identity is deliberately COMPLETE and reuses the central rule
 * metadata (#376): the compact `RuleSetIdentity` stamp (ruleSetId, ruleYear,
 * revision, contentFingerprint over the year rules AND the `legalRuleData`
 * catalog — every exported non-function datum of `legalConstants.ts`), the
 * snapshot sha of `canonicalRuleSetSnapshot(rules, legalRuleData)`, the full
 * year-rules JSON AND the full `legalRuleData` values as the replayable
 * snapshot proper (hashes detect change; the values enable replay), and the
 * EVALUATED cohort schedules (see rulesFingerprint.ts) — the code-shaped part
 * no JSON snapshot can see. Plus the engine-source digest of the capturing
 * revision.
 */
export interface ScenarioProvenanceFile {
  label: 'INTERNAL REGRESSION'
  baseSha: string
  baseShaCapturedAt: string
  /** Content digest over the calculation-source directories at capture time. */
  engineSources: {
    digestSha: string
    /** True when the capture ran against uncommitted calculation sources. */
    dirty: boolean
    /** The dirty files themselves (empty when clean). */
    paths: string[]
    /** Recorded when capture was explicitly allowed on a dirty tree. */
    allowDirtyReason?: string
  }
  rulesIdentity: {
    /** Compact identity stamp from src/rules/ruleMetadata.ts. */
    ruleSet: RuleSetIdentity
    /** sha256-16 prefix of `canonicalRuleSetSnapshot(rules, legalRuleData)`. */
    snapshotSha: string
    /** Evaluated cohort schedules (code the JSON snapshot cannot see). */
    cohortSchedules: CohortScheduleFingerprint
    /** Full year-rules JSON — the replayable snapshot proper. */
    activeRules: GermanRules
    /**
     * Full cross-year rule data (the `legalRuleData` catalog, verbatim) —
     * the values behind `snapshotSha`, so replay needs no other source.
     */
    legalRuleData: LegalRuleData
  }
  /** Human-readable capture notes (rules year, entry points used, reason). */
  notes: string
}

export const CAPTURED_PROVENANCE: ScenarioProvenanceFile | undefined =
  provenanceModule['./baselines/provenance.json']

// ---------------------------------------------------------------------------
// Case metadata
// ---------------------------------------------------------------------------

interface CaseMeta {
  familyId: string
  familyLabel: string
  caseId: string
  /** What this case pins and why it exists. */
  purpose: string
  provenance: SuiteCase['provenance']
  /** Run extraction twice and require bit-identical maps (seeded Monte Carlo). */
  deterministicReplay?: boolean
  /** Check this stage against an externalGolden fixture constant. */
  anchor?: { stagePath: string; fixtureId: string; tolerance: number }
}

/** Metadata of every case in the suite (for docs, scripts and tests). */
export function suiteCaseMeta(): CaseMeta[] {
  return CASE_META
}

export const SUITE_TOLERANCE = 1e-6

const CASE_META: CaseMeta[] = [
  // A — compare baseline
  {
    familyId: 'compare-baseline',
    familyLabel: 'A · Vergleich — Basisszenario',
    caseId: 'all-products',
    purpose:
      'Pins the full compare-mode pipeline for all six products at the default anchor (200 EUR/month net): funding, GRV baseline, accumulation, payout, lump-sum tax, KV/PV and net per return scenario.',
    provenance: 'internal-regression',
  },
  {
    familyId: 'compare-baseline',
    familyLabel: 'A · Vergleich — Basisszenario',
    caseId: 'default-pair',
    purpose:
      'Two-product comparison (ETF + bAV). Guards the fair-comparison invariant surface in the smallest configuration: both products must invest bavFunding.monthlyNetCost.',
    provenance: 'internal-regression',
  },
  // B — payout modes
  {
    familyId: 'compare-payout-modes',
    familyLabel: 'B · Vergleich — Auszahlungsmodi',
    caseId: 'kapitalverzehr',
    purpose:
      'Capital-drawdown payouts for bAV and private insurance; pins the lump-sum/drawdown tax and KV/PV path with no annuitisation.',
    provenance: 'internal-regression',
  },
  {
    familyId: 'compare-payout-modes',
    familyLabel: 'B · Vergleich — Auszahlungsmodi',
    caseId: 'zeitrente',
    purpose:
      '15-year Zeitrente for bAV and private insurance; pins payoutEndAge and the finite-horizon payout cascade.',
    provenance: 'internal-regression',
  },
  {
    familyId: 'compare-payout-modes',
    familyLabel: 'B · Vergleich — Auszahlungsmodi',
    caseId: 'leibrente',
    purpose:
      'Lifelong annuity (Rentenfaktor 30/28) for bAV and private insurance; pins rentenfaktor-based gross payouts and the Leibrente break-even stage.',
    provenance: 'internal-regression',
  },
  // C — contract vintage
  {
    familyId: 'compare-contract-vintage',
    familyLabel: 'C · Vergleich — Vertragsalter',
    caseId: 'pre2005-kapitalverzehr',
    purpose:
      'Pre-2005 insurance contract (§52 Abs. 28 EStG a.F. eligible): capital payout must be tax-free; pins the pre2005 tax-mode branch.',
    provenance: 'internal-regression',
  },
  {
    familyId: 'compare-contract-vintage',
    familyLabel: 'C · Vergleich — Vertragsalter',
    caseId: 'halbeinkuenfte-kapitalverzehr',
    purpose:
      'Post-2004 contract (2010 vintage) meeting the Halbeinkünfte conditions: pins the §20 Abs. 1 Nr. 6 EStG half-gain branch.',
    provenance: 'internal-regression',
  },
  {
    familyId: 'compare-contract-vintage',
    familyLabel: 'C · Vergleich — Vertragsalter',
    caseId: 'leibrente-ertragsanteil',
    purpose:
      '2026-vintage contract paid as Leibrente: runtime (2026→2053) ≥ 12 years and payout at 67, so the capital-payout mode for this vintage would be Halbeinkünfte — this case pins the §22 Nr. 1 Ertragsanteil annuity override instead. NOT an Abgeltungsteuer case (see the sibling below).',
    provenance: 'internal-regression',
  },
  {
    familyId: 'compare-contract-vintage',
    familyLabel: 'C · Vergleich — Vertragsalter',
    caseId: 'abgeltungsteuer-kapitalverzehr',
    purpose:
      'Current contract (start 2026) with early retirement at 60: runtime 20 ≥ 12 years but the payout lands below the Halbeinkünfte minimum age (62 for ≥2012 contracts), so the full gain is taxed at §20 Abs. 2 EStG Abgeltungsteuer — pins the third leg of the vintage triangle (pre2005 / halbeinkuenfte / abgeltungsteuer).',
    provenance: 'internal-regression',
  },
  // D — horizons and returns
  {
    familyId: 'compare-horizons-returns',
    familyLabel: 'D · Vergleich — Horizont & Rendite',
    caseId: 'short-horizon',
    purpose:
      'Seven-year accumulation horizon (age 60 → 67): pins near-term funding, low contribution counts and payout bootstrapping from a short career tail.',
    provenance: 'internal-regression',
  },
  {
    familyId: 'compare-horizons-returns',
    familyLabel: 'D · Vergleich — Horizont & Rendite',
    caseId: 'zero-return',
    purpose:
      '0 % return across all scenarios: accumulation must reduce to contributions minus fees, isolating fee and funding math from market growth.',
    provenance: 'internal-regression',
  },
  {
    familyId: 'compare-horizons-returns',
    familyLabel: 'D · Vergleich — Horizont & Rendite',
    caseId: 'negative-return-with-guarantee',
    purpose:
      '−2 % return with an insurance capital guarantee (100 % of contributions): pins guaranteeFloorAtRetirement / guaranteeApplied and the ETF Vorabpauschale on losses.',
    provenance: 'internal-regression',
  },
  // E — seeded Monte Carlo
  {
    familyId: 'monte-carlo-seeded',
    familyLabel: 'E · Monte Carlo (deterministisch)',
    caseId: 'seed-20260908',
    purpose:
      'Seeded (20260908), 200-run Monte Carlo over ETF + private insurance; pins percentiles, expectations and guarantee probability for one fixed market path family.',
    provenance: 'internal-regression',
    deterministicReplay: true,
  },
  {
    familyId: 'monte-carlo-seeded',
    familyLabel: 'E · Monte Carlo (deterministisch)',
    caseId: 'seed-20260909',
    purpose:
      'Same configuration with seed 20260909: pins that the seed (not just the configuration) drives the sampled path — the two baselines must differ in percentiles but both replay exactly.',
    provenance: 'internal-regression',
    deterministicReplay: true,
  },
  // F — combine single bAV
  {
    familyId: 'combine-single-bav',
    familyLabel: 'F · Kombination — Einzelvertrag bAV',
    caseId: 'single-conversion',
    purpose:
      'Smallest combine-mode household (one bAV): pins portfolioFunding headroom, aggregate retirement tax and KV/PV routing with a single contract.',
    provenance: 'internal-regression',
  },
  // G — mixed household
  {
    familyId: 'combine-mixed-household',
    familyLabel: 'G · Kombination — gemischter Haushalt',
    caseId: 'two-bav-two-etf',
    purpose:
      'Two bAV + two ETF instances with existing capital: pins cross-instance bAV cap apportionment, per-instance ETF cost bases and household aggregation.',
    provenance: 'internal-regression',
  },
  // H — cap thresholds
  {
    familyId: 'combine-cap-thresholds',
    familyLabel: 'H · Kombination — Freibetrags-Grenzen',
    caseId: 'bav-single-at-tax-free-cap',
    purpose:
      'Single bAV conversion exactly at the §3 Nr. 63 tax-free limit (676 EUR/month): the funded amount, overflow and headroom stages sit precisely on the statutory boundary.',
    provenance: 'external-golden-anchored',
    anchor: {
      stagePath: 'funding.headroom.bav.capAnnual',
      fixtureId: 'bav-tax-free-limit-annual',
      tolerance: 0.01,
    },
  },
  {
    familyId: 'combine-cap-thresholds',
    familyLabel: 'H · Kombination — Freibetrags-Grenzen',
    caseId: 'bav-pair-over-shared-cap',
    purpose:
      'Two bAV conversions whose combined annual amount exceeds the shared tax-free cap: pins proportional apportionment (who funds, who overflows) and the constrained flag.',
    provenance: 'internal-regression',
  },
  {
    familyId: 'combine-cap-thresholds',
    familyLabel: 'H · Kombination — Freibetrags-Grenzen',
    caseId: 'basisrente-riester-avd-headroom',
    purpose:
      'One instance each of Basisrente, Riester and AVD near their respective caps (Schicht-1, §10a, AltZertG): pins per-product headroom shapes side by side.',
    provenance: 'internal-regression',
  },
  // I — health statuses
  {
    familyId: 'combine-health-statuses',
    familyLabel: 'I · Kombination — Krankenversicherungsstatus',
    caseId: 'kvdr',
    purpose:
      'Retirement health status KVdR: pins the §237/§229-restricted KV assessment base across all five payout channels.',
    provenance: 'internal-regression',
  },
  {
    familyId: 'combine-health-statuses',
    familyLabel: 'I · Kombination — Krankenversicherungsstatus',
    caseId: 'freiwillig-gkv',
    purpose:
      'Retirement health status freiwillig GKV (§240 SGB V): pins the broad-base KV/PV contributions on AVD/Riester/Basisrente payouts.',
    provenance: 'internal-regression',
  },
  {
    familyId: 'combine-health-statuses',
    familyLabel: 'I · Kombination — Krankenversicherungsstatus',
    caseId: 'pkv',
    purpose:
      'PKV holder (publicHealthInsurance: false, PKV/PV premiums 450/120 EUR). KNOWN DEFECT, tracked as GitHub issue #390 and recorded here OBSERVATIONALLY: the gated statutory retirement KV/PV channels (GRV KVdR half-rate, freiwillig §240 base, sonstige Versorgungsbezüge) are zero as the engine supports — but in combine mode the bAV Versorgungsbezug channel still charges KV/PV although the shared compare-mode monthly primitive gates it, and the bundle-level baseline.statutoryPension.kvPvMonthly contradicts the zero aggregate. This case FREEZES the defect for regression detection; it is NOT an approved modeling choice and NOT an expected legal result. The KVdR sibling proves the gate has something to switch off.',
    provenance: 'internal-regression',
  },
  // J — paid-up
  {
    familyId: 'combine-paid-up',
    familyLabel: 'J · Kombination — beitragsfrei gestellt',
    caseId: 'one-active-one-paid-up-per-class',
    purpose:
      'One active + one paid-up bAV, one paid-up private insurance: pins the paid-up phase (no contributions, fees continue) and that paid-up instances do not consume cap headroom.',
    provenance: 'internal-regression',
  },
  // K/L — transfers
  {
    familyId: 'combine-transfer-certified',
    familyLabel: 'K · Kombination — Übertrag (zertifiziert)',
    caseId: 'bav-to-avd',
    purpose:
      'Certified bAV → AVD transfer (18 000 EUR, 2029): pins outbound capitalWithdrawals on the source, capitalInjections on the target and that the source stays active.',
    provenance: 'internal-regression',
  },
  {
    familyId: 'combine-transfer-surrender',
    familyLabel: 'L · Kombination — Storno & Wiederanlage',
    caseId: 'insurance-to-etf',
    purpose:
      'Private-insurance surrender (5 % haircut) reinvested into ETF (20 000 EUR, 2029): pins the post-haircut withdrawal, after-tax inbound injection and the extended ETF cost basis.',
    provenance: 'internal-regression',
  },
  // M — married splitting
  {
    familyId: 'combine-married-splitting',
    familyLabel: 'M · Kombination — Ehegattensplitting',
    caseId: 'single-earner-splitting',
    purpose:
      'ONE modeled earner with the married flag: hasPartner (partner profile: tax class 5, 20 k EUR, no partner contracts) switches the aggregate retirement-tax pipeline onto §32a Abs. 5 EStG splitting. The partner salary is NOT modeled — the splitting branch is proven by the no-partner control test, not by two-earner income.',
    provenance: 'internal-regression',
  },
  // N — zero return in combine mode
  {
    familyId: 'combine-zero-return',
    familyLabel: 'N · Kombination — Nullrendite',
    caseId: 'two-bav-one-etf',
    purpose:
      'Combine-mode household (two bAV + one ETF with existing capital) at 0 % return: isolates funding, fee and aggregation effects from market growth on the portfolio path.',
    provenance: 'internal-regression',
  },
]

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

function entryPointFor(input: CaseInput): SuiteCase['entryPoint'] {
  switch (input.kind) {
    case 'compare':
      return 'simulateRetirementComparison'
    case 'combine':
      return 'runCombineSimulation'
    case 'monte-carlo':
      return 'runMonteCarlo'
  }
}

export class MissingBaselineError extends Error {
  constructor(caseId: string) {
    super(
      `No baseline captured for case "${caseId}". Run \`npm run scenario:capture\` at a recorded ` +
        'base revision, or `npm run scenario:update -- --reason "..."` deliberately.',
    )
    this.name = 'MissingBaselineError'
  }
}

/** Builds the full suite from committed JSON + the metadata table. */
export function buildRegistry(): SuiteCase[] {
  return buildRegistryEntries(CASE_META, INPUTS_BY_FAMILY, BASELINES_BY_FAMILY)
}

/**
 * Pure registry builder — exported so the guard tests can exercise the
 * missing-input / missing-baseline / unknown-input rejection paths without
 * touching the committed JSON.
 */
export function buildRegistryEntries(
  meta: CaseMeta[],
  inputsByFamily: Record<string, Record<string, CaseInput>>,
  baselinesByFamily: Record<string, Record<string, StageMap>>,
): SuiteCase[] {
  return meta.map((meta) => {
    const input = inputsByFamily[meta.familyId]?.[meta.caseId]
    if (!input) {
      throw new Error(`No frozen input found for case "${meta.familyId}/${meta.caseId}"`)
    }
    const baseline = baselinesByFamily[meta.familyId]?.[meta.caseId]
    if (!baseline) {
      throw new MissingBaselineError(`${meta.familyId}/${meta.caseId}`)
    }
    const anchors: ExternalAnchorCheck[] | undefined = meta.anchor
      ? [
          {
            stagePath: meta.anchor.stagePath,
            expected: resolveExternalAnchorExpected(meta.anchor.fixtureId),
            externalFixtureId: meta.anchor.fixtureId,
            tolerance: meta.anchor.tolerance,
          },
        ]
      : undefined
    return {
      id: `${meta.familyId}/${meta.caseId}`,
      caseId: meta.caseId,
      familyId: meta.familyId,
      familyLabel: meta.familyLabel,
      purpose: meta.purpose,
      mode: input.kind,
      provenance: meta.provenance,
      entryPoint: entryPointFor(input),
      tolerance: SUITE_TOLERANCE,
      input,
      deterministicReplay: meta.deterministicReplay ?? false,
      externalAnchors: anchors,
    }
  })
}

/**
 * Resolves the expected value for an anchor from `externalGoldenFixtures.ts`.
 * The fixture file is the single source of the number — it is never re-derived
 * here, so an engine change cannot silently move an independent anchor.
 */
export function resolveExternalAnchorExpected(fixtureId: string): number {
  const entry = bavContributionLimitGoldenValues.find((v) => v.id === fixtureId)
  if (!entry) {
    throw new Error(`Unknown external golden anchor fixture id: ${fixtureId}`)
  }
  return entry.expected
}

// ---------------------------------------------------------------------------
// Diff engine
// ---------------------------------------------------------------------------

export function valuesEqual(
  expected: number | boolean | null,
  actual: number | boolean | null,
  tolerance: number,
): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') {
    // Non-finite numbers are never a match — Infinity === Infinity is not a
    // successful calculation, it is a broken one. Overflow or NaN must fail
    // the gate even when both sides collapse to the same non-finite value.
    if (!Number.isFinite(expected) || !Number.isFinite(actual)) return false
    return Math.abs(actual - expected) <= tolerance
  }
  // booleans and null compare exactly; number-vs-boolean/null is a shape change.
  return expected === actual
}

export function diffStageMaps(
  expected: StageMap,
  actual: StageMap,
  tolerance: number,
): StageDiff[] {
  const diffs: StageDiff[] = []
  for (const [path, expectedValue] of Object.entries(expected)) {
    // Presence is compared separately: a deleted path whose baseline value was
    // null must still fail — "missing" and "explicit null" are different facts.
    // `kind` records which of the two happened, so a removed null-valued path
    // never renders as an ordinary value change.
    const actualPresent = path in actual
    const actualValue = actualPresent ? actual[path] : null
    if (!actualPresent || !valuesEqual(expectedValue, actualValue, tolerance)) {
      diffs.push({
        path,
        kind: actualPresent ? 'value-changed' : 'removed',
        expectedPresent: true,
        actualPresent,
        expected: expectedValue,
        actual: actualValue,
        delta: deltaOf(expectedValue, actualValue),
        tolerance,
      })
    }
  }
  // Engine started emitting a stage the baseline does not know: shape drift.
  for (const [path, actualValue] of Object.entries(actual)) {
    if (path in expected) continue
    diffs.push({
      path,
      kind: 'added',
      expectedPresent: false,
      actualPresent: true,
      expected: null,
      actual: actualValue,
      delta: null,
      tolerance,
    })
  }
  return diffs
}

function deltaOf(
  expected: number | boolean | null,
  actual: number | boolean | null,
): number | null {
  if (typeof expected === 'number' && typeof actual === 'number' && Number.isFinite(expected) && Number.isFinite(actual)) {
    return actual - expected
  }
  return null
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Canonical rules identity of a run, built from the central rule metadata
 * (#376): the compact `RuleSetIdentity` stamp (`ruleSetId`, `ruleYear`,
 * `revision`, `contentFingerprint` over the year rules AND the `legalRuleData`
 * catalog via `ruleSetIdentity(rules, legalRuleData, activeRulesMetadata)`),
 * the snapshot sha of `canonicalRuleSetSnapshot(rules, legalRuleData)`, the
 * evaluated cohort schedules (code no JSON snapshot can see), the full
 * year-rules JSON, and the full `legalRuleData` values — so the frozen
 * identity is a complete replayable snapshot, not only hashes. Every part
 * must match the capture for stage deltas to be attributable to a model
 * change alone.
 *
 * The rules argument is ALWAYS the caller's choice — the suite never silently
 * substitutes a global default, so a custom run reports exactly the rules it
 * was given. `activeRulesMetadata` always describes the compiled year file;
 * when a caller passes different rules, the content fingerprint, snapshot sha
 * and rules JSON are the parts that move.
 *
 * NOTE on key order: `capturedRulesIdentityJson` reassembles this object from
 * the stored provenance — the literal key order here and there must stay
 * identical, or stored-vs-live comparison would false-positive on ordering.
 */
export function rulesIdentityJson(rules: GermanRules): string {
  return JSON.stringify({
    ruleSet: ruleSetIdentity(rules, legalRuleData, activeRulesMetadata),
    snapshotSha: snapshotShaOf(rules),
    cohortSchedules: cohortScheduleFingerprint(),
    activeRules: rules,
    legalRuleData,
  })
}

/** sha256-16 prefix of the canonical rule snapshot (rules + legalRuleData). */
function snapshotShaOf(rules: GermanRules): string {
  return createHash('sha256')
    .update(canonicalRuleSetSnapshot(rules, legalRuleData))
    .digest('hex')
    .slice(0, 16)
}

/** Rules this checkout would use in production (`src/rules/index.ts`). */
export function activeRulesSnapshotJson(): string {
  return rulesIdentityJson(activeRules)
}

/** Canonical rules identity captured at the base revision, or null if absent. */
export function capturedRulesIdentityJson(): string | null {
  const identity = CAPTURED_PROVENANCE?.rulesIdentity
  return identity
    ? JSON.stringify({
        ruleSet: identity.ruleSet,
        snapshotSha: identity.snapshotSha,
        cohortSchedules: identity.cohortSchedules,
        activeRules: identity.activeRules,
        legalRuleData: identity.legalRuleData,
      })
    : null
}

export function runCase(suiteCase: SuiteCase, rules: GermanRules): CaseRunResult {
  const { stages, unsupported } = extractStages(suiteCase.input, rules)
  const baseline = BASELINES_BY_FAMILY[suiteCase.familyId]?.[suiteCase.caseId]
  if (!baseline) throw new MissingBaselineError(suiteCase.id)

  const diffs = diffStageMaps(baseline, stages, suiteCase.tolerance)

  const anchorFailures: string[] = []
  for (const anchor of suiteCase.externalAnchors ?? []) {
    const actual = stages[anchor.stagePath]
    if (typeof actual !== 'number' || !valuesEqual(anchor.expected, actual, anchor.tolerance)) {
      anchorFailures.push(
        `${anchor.stagePath}: expected ${anchor.expected} (external golden "${anchor.externalFixtureId}", ±${anchor.tolerance}), got ${String(actual)}`,
      )
    }
  }

  let replayDrift: StageDiff | undefined
  if (suiteCase.deterministicReplay) {
    const replay = extractStages(suiteCase.input, rules)
    const drift = diffStageMaps(stages, replay.stages, 0)
    if (drift.length > 0) {
      replayDrift = drift[0]
    }
  }

  return {
    caseId: suiteCase.id,
    familyId: suiteCase.familyId,
    familyLabel: suiteCase.familyLabel,
    mode: suiteCase.mode,
    provenance: suiteCase.provenance,
    purpose: suiteCase.purpose,
    ok: diffs.length === 0 && anchorFailures.length === 0 && replayDrift === undefined,
    stageCount: Object.keys(baseline).length,
    firstDivergence: diffs[0],
    diffs,
    anchorFailures,
    unsupported,
    replayDrift,
  }
}

/**
 * Three-valued rules provenance status. Missing provenance is its own state —
 * it must never collapse into "match" and silently validate a clean run.
 */
export function provenanceStatusOf(
  captured: string | null,
  live: string,
): SuiteRunResult['rulesProvenanceStatus'] {
  if (captured === null) return 'missing'
  return captured === live ? 'match' : 'drift'
}

export function runSuite(cases: SuiteCase[], rules: GermanRules): SuiteRunResult {
  const results = cases.map((suiteCase) => runCase(suiteCase, rules))
  const liveIdentity = rulesIdentityJson(rules)
  const captured = capturedRulesIdentityJson()
  const rulesProvenanceStatus = provenanceStatusOf(captured, liveIdentity)

  return {
    cases: results,
    totalCases: results.length,
    failedCases: results.filter((r) => !r.ok).length,
    totalStages: results.reduce((sum, r) => sum + r.stageCount, 0),
    ok: results.every((r) => r.ok) && rulesProvenanceStatus === 'match',
    rulesIdentityJson: liveIdentity,
    rulesSnapshotDrift: rulesProvenanceStatus === 'drift',
    rulesProvenanceStatus,
  }
}
