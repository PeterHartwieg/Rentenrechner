/**
 * Scenario-report suite: full replay inside `npm test` (issue #377).
 *
 * This is the `npm run verify` hook of the suite: every committed baseline is
 * replayed through the existing engine entry points and any unexpected
 * divergence fails the test run. Baselines are INTERNAL REGRESSION anchors
 * (see docs/scenario-reports.md) — a pass proves reproducibility, not legal
 * correctness. Independent anchors are covered by `externalGolden.test.ts`
 * and re-checked here through the `external-golden-anchored` case.
 */

import { describe, expect, it } from 'vitest'
import type { Workspace } from '../../domain/workspace'
import type { CaseInput } from './types'
import {
  CAPTURED_PROVENANCE,
  buildRegistry,
  capturedRulesIdentityJson,
  activeRulesSnapshotJson,
  resolveExternalAnchorExpected,
  runCase,
  runSuite,
} from './suite'
import { extractStages } from './stages'
import { activeRules, legalRuleData } from '../../rules'
import { deriveInsuranceTaxMode } from '../../engine/insurancePayout'
import { runCombineSimulation } from '../../app/useCombineSimulation'

const registry = buildRegistry()
const result = runSuite(registry, activeRules)

function caseById(id: string) {
  const suiteCase = registry.find((c) => c.id === id)
  if (!suiteCase) throw new Error(`unknown case ${id}`)
  return suiteCase
}

describe('scenario suite replay (INTERNAL REGRESSION)', () => {
  it('reproduces every captured baseline', () => {
    expect(result.totalCases).toBe(27)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      const failing = result.cases.filter((c) => !c.ok)
      throw new Error(
        `Scenario drift in ${failing.length} case(s). First divergences:\n` +
          failing
            .map(
              (c) =>
                `  ${c.caseId}: ${c.firstDivergence?.path ?? '(anchor/replay)'} ` +
                `expected ${JSON.stringify(c.firstDivergence?.expected)} actual ${JSON.stringify(c.firstDivergence?.actual)}`,
            )
            .join('\n') +
        '\nIf the new output is intended, run `npm run scenario:update -- --reason "..."`.',
      )
    }
  })

  it('captures a meaningful number of stages', () => {
    expect(result.totalStages).toBeGreaterThan(5_000)
  })

  it('shows matching rules provenance (year rules, legalRuleData AND cohort schedules)', () => {
    expect(capturedRulesIdentityJson()).not.toBeNull()
    expect(result.rulesProvenanceStatus).toBe('match')
    expect(result.ok).toBe(true)
    expect(activeRulesSnapshotJson()).toBe(capturedRulesIdentityJson())
  })

  it('records complete rules + engine provenance at capture time', () => {
    // The provenance file must identify MORE than the year JSON: the central
    // RuleSetIdentity stamp (#376 — year ID, revision, content fingerprint over
    // the year rules AND the legalRuleData catalog), the canonical snapshot
    // sha, the evaluated cohort schedules, the FULL cross-year rule values
    // (hashes detect change; values enable replay), and the calculation-source
    // digest of the capturing engine state.
    expect(CAPTURED_PROVENANCE).toBeDefined()
    expect(CAPTURED_PROVENANCE?.label).toBe('INTERNAL REGRESSION')
    expect(CAPTURED_PROVENANCE?.engineSources.digestSha).toMatch(/^[0-9a-f]{16}$/)
    expect(CAPTURED_PROVENANCE?.rulesIdentity.ruleSet.ruleSetId).toBe(`de${activeRules.year}`)
    expect(CAPTURED_PROVENANCE?.rulesIdentity.ruleSet.contentFingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(CAPTURED_PROVENANCE?.rulesIdentity.snapshotSha).toMatch(/^[0-9a-f]{16}$/)
    expect(
      Object.keys(
        CAPTURED_PROVENANCE?.rulesIdentity.cohortSchedules.besteuerungsanteilGrvByRetirementYear ?? {},
      ).length,
    ).toBeGreaterThanOrEqual(56)
    expect(CAPTURED_PROVENANCE?.rulesIdentity.activeRules.year).toBe(activeRules.year)
  })

  it('freezes the actual legalRuleData values, not only their hash', () => {
    const capturedData = CAPTURED_PROVENANCE?.rulesIdentity.legalRuleData
    expect(capturedData).toBeDefined()
    // Every catalogue key present:
    expect(Object.keys(capturedData ?? {}).sort()).toEqual(Object.keys(legalRuleData).sort())
    // And the values verbatim — deep equality against the live catalog:
    expect(capturedData).toEqual(legalRuleData)
    // Spot checks that the frozen entries are the real cross-year data:
    expect(capturedData?.legalConstants.soli).toEqual(legalRuleData.legalConstants.soli)
    expect(typeof capturedData?.sonderausgabenPauschbetrag.single).toBe('number')
    expect(typeof capturedData?.aktienfondsTeilfreistellungPrivat).toBe('number')
  })

  it('produces only finite stage values', () => {
    for (const suiteCase of registry) {
      const { stages } = extractStages(suiteCase.input, activeRules)
      for (const [path, value] of Object.entries(stages)) {
        if (typeof value === 'number') {
          expect(Number.isFinite(value), `${suiteCase.id}: ${path} = ${value}`).toBe(true)
        }
      }
    }
  })
})

describe('deterministic seeded Monte Carlo', () => {
  it('replays seed 20260908 bit-identically', () => {
    const run = runCase(caseById('monte-carlo-seeded/seed-20260908'), activeRules)
    expect(run.ok).toBe(true)
    expect(run.replayDrift).toBeUndefined()
  })

  it('replays seed 20260909 bit-identically', () => {
    const run = runCase(caseById('monte-carlo-seeded/seed-20260909'), activeRules)
    expect(run.ok).toBe(true)
    expect(run.replayDrift).toBeUndefined()
  })

  it('produces different paths for different seeds', () => {
    const a = extractStages(caseById('monte-carlo-seeded/seed-20260908').input, activeRules).stages
    const b = extractStages(caseById('monte-carlo-seeded/seed-20260909').input, activeRules).stages
    expect(a['mc.etf.capital.p50']).not.toBe(b['mc.etf.capital.p50'])
    expect(a['mc.seed']).toBe(20260908)
    expect(b['mc.seed']).toBe(20260909)
  })
})

describe('external golden anchoring', () => {
  it('anchors the §3 Nr. 63 cap case to the fixture constant', () => {
    const fixtureId = 'bav-tax-free-limit-annual'
    const expected = resolveExternalAnchorExpected(fixtureId)
    expect(expected).toBe(8_112)
    const stages = extractStages(
      caseById('combine-cap-thresholds/bav-single-at-tax-free-cap').input,
      activeRules,
    ).stages
    expect(stages['funding.headroom.bav.capAnnual']).toBeCloseTo(expected, 6)
  })

  it('passes every configured anchor check', () => {
    const anchored = result.cases.filter((c) => c.provenance === 'external-golden-anchored')
    expect(anchored.length).toBeGreaterThan(0)
    for (const c of anchored) {
      expect(c.anchorFailures, c.caseId).toEqual([])
    }
  })
})

describe('scenario families exercise the intended engine branches', () => {
  it('contract vintage covers the full tax-mode triangle, each leg in its own branch', () => {
    // The engine's own mode derivation, fed the literals of the frozen cases:
    // 1990 + eligible + long runtime → pre2005; 2010, runtime 27, payout 67 →
    // halbeinkuenfte; 2045, runtime 8 → abgeltungsteuer.
    expect(deriveInsuranceTaxMode(1990, 27, 67, true)).toBe('pre2005')
    expect(deriveInsuranceTaxMode(2010, 27, 67, false)).toBe('halbeinkuenfte')
    expect(deriveInsuranceTaxMode(2045, 8, 67, false)).toBe('abgeltungsteuer')

    const stages = extractStages(
      caseById('compare-contract-vintage/pre2005-kapitalverzehr').input,
      activeRules,
    ).stages
    expect(stages['tax.lumpSum.versicherung.basis.incomeTax']).toBe(0)

    const halbeinkuenfte = extractStages(
      caseById('compare-contract-vintage/halbeinkuenfte-kapitalverzehr').input,
      activeRules,
    ).stages
    expect(halbeinkuenfte['tax.lumpSum.versicherung.basis.incomeTax']).toBeGreaterThan(0)

    // The Abgeltungsteuer leg must produce a DIFFERENT tax than the
    // Halbeinkünfte leg — a same-value copy would silently re-pin the same
    // branch under a different name.
    const abgeltungsteuer = extractStages(
      caseById('compare-contract-vintage/abgeltungsteuer-kapitalverzehr').input,
      activeRules,
    ).stages
    expect(abgeltungsteuer['tax.lumpSum.versicherung.basis.incomeTax']).toBeGreaterThan(0)
    expect(abgeltungsteuer['tax.lumpSum.versicherung.basis.incomeTax']).not.toBe(
      halbeinkuenfte['tax.lumpSum.versicherung.basis.incomeTax'],
    )
    // The Leibrente case pays an annuity: the payout flows through the §22
    // Nr. 1 Ertragsanteil pipeline, while the hypothetical capital deduction
    // the engine still reports matches this vintage's Halbeinkünfte mode —
    // NOT the Abgeltungsteuer figure.
    const leibrente = extractStages(
      caseById('compare-contract-vintage/leibrente-ertragsanteil').input,
      activeRules,
    ).stages
    expect(leibrente['tax.lumpSum.versicherung.basis.incomeTax']).toBe(
      halbeinkuenfte['tax.lumpSum.versicherung.basis.incomeTax'],
    )
    expect(leibrente['net.versicherung.basis.netMonthlyPayout']).toBeGreaterThan(0)
    expect(leibrente['payout.versicherung.basis.grossMonthlyPayout']).toBeGreaterThan(0)
  })

  it('capital guarantee bites under the negative-return path', () => {
    const stages = extractStages(
      caseById('compare-horizons-returns/negative-return-with-guarantee').input,
      activeRules,
    ).stages
    expect(stages['accumulation.versicherung.basis.guaranteeApplied']).toBe(true)
    expect(stages['accumulation.versicherung.basis.capitalAtRetirement']).toBeGreaterThan(
      stages['accumulation.versicherung.basis.rawCapitalAtRetirement'] as number,
    )
    // And the default path does not need it:
    const baselineCase = extractStages(
      caseById('compare-baseline/all-products').input,
      activeRules,
    ).stages
    expect(baselineCase['accumulation.versicherung.basis.guaranteeApplied']).toBe(false)
  })

  it('paid-up instances contribute nothing during accumulation', () => {
    const stages = extractStages(
      caseById('combine-paid-up/one-active-one-paid-up-per-class').input,
      activeRules,
    ).stages
    expect(stages['accumulation.bav-2.basis.monthlyUserCost']).toBe(0)
    expect(stages['accumulation.bav-1.basis.monthlyUserCost']).toBeGreaterThan(0)
    expect(stages['accumulation.ins-1.basis.monthlyUserCost']).toBe(0)
  })

  it('health statuses change the household KV/PV base; PKV zeroes statutory KV', () => {
    const kvdr = extractStages(
      caseById('combine-health-statuses/kvdr').input,
      activeRules,
    ).stages
    const freiwillig = extractStages(
      caseById('combine-health-statuses/freiwillig-gkv').input,
      activeRules,
    ).stages
    const pkv = extractStages(caseById('combine-health-statuses/pkv').input, activeRules).stages
    expect(freiwillig['kvPv.basis.aggregate.totalKvMonthly']).toBeGreaterThan(
      kvdr['kvPv.basis.aggregate.totalKvMonthly'] as number,
    )
    expect(freiwillig['net.basis.monthlyNetIncome']).toBeLessThan(
      kvdr['net.basis.monthlyNetIncome'] as number,
    )
    // A PKV holder (publicHealthInsurance: false) owes no GKV retirement
    // contributions on the gated channels: the GRV KVdR half-rate and the
    // freiwillig/other-Versorgungsbezug channels gate on that flag. The bAV
    // Versorgungsbezug channel is NOT gated — §229 SGB V spreading applies
    // regardless — and this case pins exactly that split.
    expect(kvdr['kvPv.basis.aggregate.statutoryPensionKvMonthly']).toBeGreaterThan(0)
    expect(pkv['kvPv.basis.aggregate.statutoryPensionKvMonthly']).toBe(0)
    expect(pkv['kvPv.basis.aggregate.freiwilligOtherKvMonthly']).toBe(0)
    expect(pkv['kvPv.basis.aggregate.otherVersorgungsbezuegeKvMonthly']).toBe(0)
    expect(pkv['kvPv.basis.aggregate.bavKvMonthly']).toBeGreaterThan(0)
    expect(pkv['kvPv.basis.aggregate.bavPvMonthly']).toBeGreaterThan(0)
    expect(pkv['net.basis.monthlyNetIncome']).toBeGreaterThan(
      kvdr['net.basis.monthlyNetIncome'] as number,
    )
  })

  it('transfer events move capital out of the source and into the target', () => {
    const input = caseById('combine-transfer-certified/bav-to-avd').input
    if (input.kind !== 'combine') throw new Error('unexpected case kind')
    const withEvents = extractStages(input, activeRules).stages

    const control = JSON.parse(JSON.stringify(input)) as CaseInput
    if (control.kind !== 'combine') throw new Error('unexpected case kind')
    const stripped = (control.workspace as Workspace).baseline.assumptions
    stripped.bav = stripped.bav.map((i) => ({ ...i, transferEvents: [] }))
    stripped.altersvorsorgedepot = stripped.altersvorsorgedepot.map((i) => ({
      ...i,
      transferEvents: [],
    }))
    const withoutEvents = extractStages(control, activeRules).stages

    expect(withEvents['accumulation.bav-1.basis.capitalAtRetirement']).toBeLessThan(
      withoutEvents['accumulation.bav-1.basis.capitalAtRetirement'] as number,
    )
    expect(withEvents['accumulation.avd-1.basis.capitalAtRetirement']).toBeGreaterThan(
      withoutEvents['accumulation.avd-1.basis.capitalAtRetirement'] as number,
    )
  })

  it('reduces the 0 % ETF pot to contributions + initial capital − fees', () => {
    const input = caseById('combine-zero-return/two-bav-one-etf').input
    if (input.kind !== 'combine') throw new Error('unexpected case kind')
    const stages = extractStages(input, activeRules).stages
    const initialCapital =
      input.workspace.baseline.assumptions.etf.find((i) => i.instanceId === 'etf-1')
        ?.currentValueEUR ?? 0
    // At 0 % return the identity must hold to the cent: the pot is exactly the
    // paid-in contributions plus existing capital minus accumulated fees.
    expect(stages['accumulation.etf-1.basis.capitalAtRetirement']).toBeCloseTo(
      (stages['accumulation.etf-1.basis.totalContributionsBeforeFees'] as number) +
        initialCapital -
        (stages['accumulation.etf-1.basis.totalFees'] as number),
      2,
    )
  })

  it('reaches the shared bAV cap in the over-cap household', () => {
    const stages = extractStages(
      caseById('combine-cap-thresholds/bav-pair-over-shared-cap').input,
      activeRules,
    ).stages
    expect(stages['funding.headroom.bav.constrained']).toBe(true)
    // Apportionment fills the cap to within a fraction of a cent (scaling
    // residual ≈ 3.5e-4 EUR at this configuration) — never above it.
    expect(stages['funding.headroom.bav.fundedAnnual']).toBeLessThanOrEqual(
      stages['funding.headroom.bav.capAnnual'] as number,
    )
    expect(stages['funding.headroom.bav.fundedAnnual']).toBeCloseTo(
      stages['funding.headroom.bav.capAnnual'] as number,
      2,
    )
  })

  it('routes the household aggregate through combinePortfolio', () => {
    const input = caseById('combine-mixed-household/two-bav-two-etf').input
    if (input.kind !== 'combine') throw new Error('unexpected case kind')
    const bundle = runCombineSimulation(input.workspace, activeRules)
    const combined = bundle.combinedByScenarioId.basis
    // byInstance back-allocation must cover every simulated instance.
    const simulated = new Set(
      Object.values(bundle.perInstance).flatMap((rs) => rs.map((r) => r.instanceId)),
    )
    expect(Object.keys(combined.byInstance).sort()).toEqual([...simulated].sort())
  })

  it('married splitting flag changes the aggregate tax (proven by a no-partner control)', () => {
    // The case models ONE earner with the hasPartner flag — the partner's
    // salary and contracts do NOT enter the simulation. This control proves
    // the flag itself (not unmodeled partner income) drives the difference.
    const input = caseById('combine-married-splitting/single-earner-splitting').input
    if (input.kind !== 'combine') throw new Error('unexpected case kind')
    const withPartner = extractStages(input, activeRules).stages

    const control = JSON.parse(JSON.stringify(input)) as CaseInput
    if (control.kind !== 'combine') throw new Error('unexpected case kind')
    delete (control.workspace.baseline as { partner?: unknown }).partner
    const withoutPartner = extractStages(control, activeRules).stages

    expect(withPartner['tax.basis.aggregate.einkommensteuer']).not.toBe(
      withoutPartner['tax.basis.aggregate.einkommensteuer'],
    )
    expect(withPartner['tax.basis.aggregate.einkommensteuer']).toBeGreaterThan(0)
    expect(withoutPartner['tax.basis.aggregate.einkommensteuer']).toBeGreaterThan(0)
  })
})
