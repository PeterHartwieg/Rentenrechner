/**
 * Guard tests for the scenario-report machinery itself (issue #377).
 *
 * These prove the DETECTION works before anyone relies on its silence:
 *   - an unchanged replay passes;
 *   - an injected numeric error is detected at its exact path with the right delta;
 *   - a deleted stage fails even when its baseline value was null (missing ≠ null);
 *   - non-finite values (NaN/±Infinity) never compare equal — a broken
 *     calculation must not ride through as "unchanged";
 *   - sub-tolerance noise does not fire;
 *   - unknown inputs / missing baselines / unknown fixture ids are rejected.
 *
 * The tamper tests operate on a REAL extraction of a REAL frozen input
 * (`compare-baseline/default-pair` — the fastest case), not on synthetic maps,
 * so the detection path exercised is the one the suite actually uses.
 */

import { describe, expect, it } from 'vitest'
import type { StageMap } from './types'
import {
  MissingBaselineError,
  buildRegistryEntries,
  diffStageMaps,
  resolveExternalAnchorExpected,
  rulesIdentityJson,
  runCase,
  runSuite,
  valuesEqual,
  provenanceStatusOf,
} from './suite'
import { extractStages } from './stages'
import { activeRules } from '../../rules'
import { de2026Rules } from '../../rules/de2026'
import defaultPairInput from './inputs/compare-baseline.json'
import defaultPairBaseline from './baselines/family-compare-baseline.json'

// The tamper tests run against the REAL frozen input and the REAL committed
// baseline of the fastest case (`compare-baseline/default-pair`), so the
// detection path exercised is exactly the one the suite uses in production.
const registry = buildRegistryEntries(
  [
    {
      familyId: 'compare-baseline',
      familyLabel: 'A',
      caseId: 'default-pair',
      purpose: 'fastest real case',
      provenance: 'internal-regression',
    },
  ],
  { 'compare-baseline': defaultPairInput as never },
  { 'compare-baseline': defaultPairBaseline as never },
)

const suiteCase = registry[0]

/** Real stage map of the frozen default-pair input. */
const liveStages: StageMap = extractStages(suiteCase.input, activeRules).stages

describe('unchanged replay', () => {
  it('passes end-to-end with zero diffs', () => {
    const run = runCase(suiteCase, activeRules)
    expect(run.ok).toBe(true)
    expect(run.diffs).toEqual([])
    expect(run.anchorFailures).toEqual([])
    expect(run.stageCount).toBeGreaterThan(100)
  })

  it('does not flag sub-tolerance noise (tolerance = 1e-6 is IEEE headroom only)', () => {
    const tampered: StageMap = {
      ...liveStages,
      'accumulation.bav.basis.capitalAtRetirement':
        (liveStages['accumulation.bav.basis.capitalAtRetirement'] as number) + 5e-7,
    }
    expect(diffStageMaps(liveStages, tampered, suiteCase.tolerance)).toEqual([])
  })
})

describe('injected error detection', () => {
  it('detects a +50 EUR tamper at its exact path with the right delta', () => {
    const tampered: StageMap = {
      ...liveStages,
      'accumulation.bav.basis.capitalAtRetirement':
        (liveStages['accumulation.bav.basis.capitalAtRetirement'] as number) + 50,
    }
    const diffs = diffStageMaps(liveStages, tampered, suiteCase.tolerance)
    expect(diffs).toHaveLength(1)
    expect(diffs[0].path).toBe('accumulation.bav.basis.capitalAtRetirement')
    expect(diffs[0].delta).toBeCloseTo(50, 9)
    expect(diffs[0].expected).toBe(liveStages['accumulation.bav.basis.capitalAtRetirement'])
  })

  it('reports the injected path as the FIRST divergence through runCase-style comparison', () => {
    const tampered: StageMap = {
      ...liveStages,
      'net.bav.basis.netMonthlyPayout':
        (liveStages['net.bav.basis.netMonthlyPayout'] as number) - 25,
      'payout.bav.basis.grossMonthlyPayout':
        (liveStages['payout.bav.basis.grossMonthlyPayout'] as number) - 25,
    }
    const diffs = diffStageMaps(liveStages, tampered, suiteCase.tolerance)
    expect(diffs.length).toBe(2)
    // Pipeline order: payout (gross) is extracted before net.
    expect(diffs[0].path).toBe('payout.bav.basis.grossMonthlyPayout')
    expect(diffs[1].path).toBe('net.bav.basis.netMonthlyPayout')
  })

  it('detects a flipped boolean stage despite the numeric tolerance', () => {
    const tampered: StageMap = {
      ...liveStages,
      'accumulation.bav.basis.guaranteeApplied': true,
    }
    const diffs = diffStageMaps(liveStages, tampered, suiteCase.tolerance)
    expect(diffs).toHaveLength(1)
    expect(diffs[0].path).toBe('accumulation.bav.basis.guaranteeApplied')
  })
})

describe('shape and finiteness failures', () => {
  it('fails a DELETED stage even when its baseline value was null', () => {
    const nullValuedPath = Object.keys(liveStages).find(
      (path) => liveStages[path] === null,
    )
    // The frozen inputs produce at least one explicit-null stage (optional
    // engine field not applicable on that path).
    expect(nullValuedPath).toBeDefined()
    const withDeletion: StageMap = { ...liveStages }
    delete withDeletion[nullValuedPath!]
    const diffs = diffStageMaps(liveStages, withDeletion, suiteCase.tolerance)
    expect(diffs).toHaveLength(1)
    expect(diffs[0].path).toBe(nullValuedPath)
    expect(diffs[0].expected).toBe(null)
    expect(diffs[0].actual).toBe(null)
  })

  it('fails an added stage the baseline does not know (shape drift)', () => {
    const withAddition: StageMap = { ...liveStages, 'brand.new.stage': 1 }
    const diffs = diffStageMaps(liveStages, withAddition, suiteCase.tolerance)
    expect(diffs).toHaveLength(1)
    expect(diffs[0].path).toBe('brand.new.stage')
    expect(diffs[0].expected).toBe(null)
  })

  it('never treats NaN as a match — not against a number, not against NaN', () => {
    expect(valuesEqual(1234.5, Number.NaN, suiteCase.tolerance)).toBe(false)
    expect(valuesEqual(Number.NaN, Number.NaN, suiteCase.tolerance)).toBe(false)
    const withNaN: StageMap = { ...liveStages, 'accumulation.etf.basis.capitalAtRetirement': Number.NaN }
    expect(diffStageMaps(liveStages, withNaN, suiteCase.tolerance)).toHaveLength(1)
    const nanBaseline: StageMap = { 'x': Number.NaN }
    expect(diffStageMaps(nanBaseline, { 'x': Number.NaN }, suiteCase.tolerance)).toHaveLength(1)
  })

  it('never treats ±Infinity as a match', () => {
    expect(valuesEqual(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, suiteCase.tolerance)).toBe(false)
    expect(valuesEqual(Number.NEGATIVE_INFINITY, 0, suiteCase.tolerance)).toBe(false)
    const withInfinity: StageMap = {
      ...liveStages,
      'accumulation.etf.basis.capitalAtRetirement': Number.POSITIVE_INFINITY,
    }
    const diffs = diffStageMaps(liveStages, withInfinity, suiteCase.tolerance)
    expect(diffs).toHaveLength(1)
    expect(diffs[0].delta).toBe(null) // no meaningful delta for a non-finite value
  })

  it('treats number-vs-boolean and number-vs-null as shape changes', () => {
    expect(valuesEqual(1, true, suiteCase.tolerance)).toBe(false)
    expect(valuesEqual(0, null, suiteCase.tolerance)).toBe(false)
    expect(valuesEqual(null, null, suiteCase.tolerance)).toBe(true)
    expect(valuesEqual(true, false, suiteCase.tolerance)).toBe(false)
  })
})

describe('input and provenance rejection', () => {
  it('rejects a case with no frozen input', () => {
    expect(() =>
      buildRegistryEntries(
        [{ familyId: 'ghost-family', familyLabel: 'G', caseId: 'ghost', purpose: '', provenance: 'internal-regression' }],
        {},
        {},
      ),
    ).toThrow(/No frozen input found/)
  })

  it('rejects a case with input but no captured baseline', () => {
    expect(() =>
      buildRegistryEntries(
        [{ familyId: 'compare-baseline', familyLabel: 'A', caseId: 'default-pair', purpose: '', provenance: 'internal-regression' }],
        { 'compare-baseline': defaultPairInput as never },
        {},
      ),
    ).toThrow(MissingBaselineError)
  })

  it('rejects an unknown external fixture id', () => {
    expect(() => resolveExternalAnchorExpected('no-such-fixture')).toThrow(/Unknown external golden anchor fixture id/)
  })

  it('fails the gate when provenance is missing instead of reporting a clean run', () => {
    // Missing provenance is its own state, never "match":
    expect(provenanceStatusOf(null, rulesIdentityJson(activeRules))).toBe('missing')
    expect(provenanceStatusOf('{"different":true}', rulesIdentityJson(activeRules))).toBe('drift')
    expect(provenanceStatusOf(rulesIdentityJson(activeRules), rulesIdentityJson(activeRules))).toBe('match')

    const run = runSuite([suiteCase], de2026Rules)
    // de2026Rules IS the active rules today, so identity matches…
    expect(rulesIdentityJson(de2026Rules)).toBe(rulesIdentityJson(activeRules))
    expect(run.ok).toBe(true)
    // …but a mutated rules object must trip the drift gate:
    const driftedRules: typeof activeRules = {
      ...activeRules,
      employeeAllowance: activeRules.employeeAllowance + 1,
    }
    const driftRun = runSuite([suiteCase], driftedRules)
    expect(driftRun.rulesProvenanceStatus).toBe('drift')
    expect(driftRun.rulesSnapshotDrift).toBe(true)
    expect(driftRun.ok).toBe(false)
  })
})
