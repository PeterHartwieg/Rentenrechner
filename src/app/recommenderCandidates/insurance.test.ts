/**
 * Private insurance (pAV) candidate generator — per-product unit tests.
 *
 * Coverage:
 *   - Visible candidate: returns null when no insurance instance is present;
 *     prefers offered over active when both exist; falls back to active when
 *     only an active instance is present; produces an "activate" id for an
 *     offered target.
 *   - Reasons: `afterTaxLumpSum` is null when payoutMode is leibrente
 *     (Ertragsanteil at payout time); non-null when payoutMode allows a lump
 *     sum (kapitalverzehr / zeitrente).
 *   - Ranking inputs: gross == netCash (no accumulation tax leverage);
 *     mcInputs.totalFeeDecimal sums wrapper + fund asset fee.
 *   - Materialized what-if: passing an offered candidate through
 *     `recommendNextEuro` + `buildWhatIfFromCandidate` activates the offered
 *     contract and bumps monthlyContribution by grossMonthlyEUR.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import {
  buildWhatIfFromCandidate,
  recommendNextEuro,
  type RecommendNextEuroInput,
} from '../recommender'
import { runCombineSimulation } from '../useCombineSimulation'
import { makeInsuranceCandidate } from './insurance'
import { buildAnnaWorkspace, buildBerndWorkspace, buildGeneratorContext } from './testHelpers'

describe('makeInsuranceCandidate — visible candidate behavior', () => {
  it('returns null when no insurance instance is present', () => {
    const ws = buildBerndWorkspace()
    ws.baseline.assumptions.insurance = []
    const g = buildGeneratorContext(ws, 200)
    expect(makeInsuranceCandidate(g)).toBeNull()
  })

  it('returns null when marginal is non-positive (even with an active instance)', () => {
    const ws = buildBerndWorkspace()
    ws.baseline.assumptions.insurance = [
      {
        ...defaultAssumptions.insurance,
        instanceId: 'ins-active',
        label: 'pAV',
        status: 'active',
        contractStartYear: 2020,
        evidenceMap: {},
        monthlyContribution: 100,
      },
    ]
    const g = buildGeneratorContext(ws, 0)
    expect(makeInsuranceCandidate(g)).toBeNull()
  })

  it('produces an "activate" candidate when an offered instance exists', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.insurance = [
      {
        ...defaultAssumptions.insurance,
        instanceId: 'ins-offer',
        label: 'pAV-Angebot',
        status: 'offered',
        contractStartYear: de2026Rules.year,
        evidenceMap: {},
        monthlyContribution: 0,
      },
    ]
    const g = buildGeneratorContext(ws, 200)
    const draft = makeInsuranceCandidate(g)
    expect(draft).not.toBeNull()
    expect(draft!.id).toBe('activate_ins-offer')
    expect(draft!.label).toContain('Versicherungsangebot nutzen')
    expect(draft!.targetInstanceId).toBe('ins-offer')
  })

  it('produces an "add to" candidate for an active instance when no offer exists', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.insurance = [
      {
        ...defaultAssumptions.insurance,
        instanceId: 'ins-active',
        label: 'Bestehende pAV',
        status: 'active',
        contractStartYear: 2020,
        evidenceMap: {},
        monthlyContribution: 100,
      },
    ]
    const g = buildGeneratorContext(ws, 200)
    const draft = makeInsuranceCandidate(g)
    expect(draft).not.toBeNull()
    expect(draft!.id).toBe('add_to_ins-active')
    expect(draft!.label).toContain('Aufstockung Versicherung')
  })

  it('prefers offered over active when both exist', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.insurance = [
      {
        ...defaultAssumptions.insurance,
        instanceId: 'ins-active',
        label: 'pAV',
        status: 'active',
        contractStartYear: 2020,
        evidenceMap: {},
        monthlyContribution: 100,
      },
      {
        ...defaultAssumptions.insurance,
        instanceId: 'ins-offer',
        label: 'pAV-Angebot',
        status: 'offered',
        contractStartYear: de2026Rules.year,
        evidenceMap: {},
        monthlyContribution: 0,
      },
    ]
    const g = buildGeneratorContext(ws, 200)
    const draft = makeInsuranceCandidate(g)!
    expect(draft.targetInstanceId).toBe('ins-offer')
  })
})

describe('makeInsuranceCandidate — reasons', () => {
  it('afterTaxLumpSum is null when payoutMode is leibrente (Ertragsanteil at payout time)', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.insurance = [
      {
        ...defaultAssumptions.insurance,
        instanceId: 'ins-active',
        label: 'pAV',
        status: 'active',
        contractStartYear: 2020,
        evidenceMap: {},
        monthlyContribution: 100,
        payoutMode: 'leibrente',
      },
    ]
    const g = buildGeneratorContext(ws, 200)
    const draft = makeInsuranceCandidate(g)!
    expect(draft.candidateResult.afterTaxLumpSum).toBeNull()
  })

  it('afterTaxLumpSum is non-null when payoutMode allows a lump sum (kapitalverzehr)', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.insurance = [
      {
        ...defaultAssumptions.insurance,
        instanceId: 'ins-active',
        label: 'pAV',
        status: 'active',
        contractStartYear: 2020,
        evidenceMap: {},
        monthlyContribution: 100,
        payoutMode: 'kapitalverzehr',
      },
    ]
    const g = buildGeneratorContext(ws, 200)
    const draft = makeInsuranceCandidate(g)!
    expect(draft.candidateResult.afterTaxLumpSum).not.toBeNull()
    expect(draft.candidateResult.afterTaxLumpSum!).toBeGreaterThan(0)
  })

  it('cappedToRemaining is always false (insurance has no statutory contribution cap)', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.insurance = [
      {
        ...defaultAssumptions.insurance,
        instanceId: 'ins-active',
        label: 'pAV',
        status: 'active',
        contractStartYear: 2020,
        evidenceMap: {},
        monthlyContribution: 100,
      },
    ]
    const g = buildGeneratorContext(ws, 5000)
    const draft = makeInsuranceCandidate(g)!
    expect(draft.cappedToRemaining).toBe(false)
  })
})

describe('makeInsuranceCandidate — ranking inputs', () => {
  it('gross == netCash == marginalMonthlyEUR (insurance contributions are after-tax)', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.insurance = [
      {
        ...defaultAssumptions.insurance,
        instanceId: 'ins-active',
        label: 'pAV',
        status: 'active',
        contractStartYear: 2020,
        evidenceMap: {},
        monthlyContribution: 100,
      },
    ]
    const g = buildGeneratorContext(ws, 200)
    const draft = makeInsuranceCandidate(g)!
    expect(draft.grossMonthlyEUR).toBe(200)
    expect(draft.netCashOutEUR).toBe(200)
  })

  it('mcInputs.totalFeeDecimal = wrapperAssetFee + fundAssetFee', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.insurance = [
      {
        ...defaultAssumptions.insurance,
        instanceId: 'ins-active',
        label: 'pAV',
        status: 'active',
        contractStartYear: 2020,
        evidenceMap: {},
        monthlyContribution: 100,
        fees: {
          ...defaultAssumptions.insurance.fees,
          wrapperAssetFee: 0.012,
          fundAssetFee: 0.003,
        },
      },
    ]
    const g = buildGeneratorContext(ws, 200)
    const draft = makeInsuranceCandidate(g)!
    expect(draft.mcInputs.totalFeeDecimal).toBeCloseTo(0.015, 6)
    expect(draft.mcInputs.monthlyContribution).toBe(200)
  })
})

describe('makeInsuranceCandidate — materialized what-if effects', () => {
  function buildInput(ws: ReturnType<typeof buildBerndWorkspace>, eur: number): RecommendNextEuroInput {
    const bundle = runCombineSimulation(ws, de2026Rules)
    const basisId =
      ws.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')?.id ??
      ws.baseline.assumptions.returnScenarios[0].id
    return {
      workspace: ws,
      rules: de2026Rules,
      marginalMonthlyEUR: eur,
      baselinePerInstance: bundle.perInstance,
      baselineCombined: bundle.combinedByScenarioId[basisId],
      grvGrossMonthlyPension: bundle.statutoryPension.grossMonthlyPension,
    }
  }

  it('save-as-plan activates an offered insurance and bumps monthlyContribution', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.insurance = [
      {
        ...defaultAssumptions.insurance,
        instanceId: 'ins-offer',
        label: 'pAV-Angebot',
        status: 'offered',
        contractStartYear: de2026Rules.year,
        evidenceMap: {},
        monthlyContribution: 0,
      },
    ]
    const candidates = recommendNextEuro(buildInput(ws, 200))
    const insurance = candidates.find((c) => c.productId === 'versicherung')
    expect(insurance).toBeDefined()
    const whatIf = buildWhatIfFromCandidate(ws.baseline, insurance!)
    const activated = whatIf.assumptions.insurance.find((i) => i.instanceId === 'ins-offer')
    expect(activated?.status).toBe('active')
    expect(activated?.monthlyContribution).toBeCloseTo(insurance!.grossMonthlyEUR, 1)
  })

  it('what-if carries origin=recommender', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.insurance = [
      {
        ...defaultAssumptions.insurance,
        instanceId: 'ins-offer',
        label: 'pAV',
        status: 'offered',
        contractStartYear: de2026Rules.year,
        evidenceMap: {},
        monthlyContribution: 0,
      },
    ]
    const candidates = recommendNextEuro(buildInput(ws, 200))
    const insurance = candidates.find((c) => c.productId === 'versicherung')!
    const whatIf = buildWhatIfFromCandidate(ws.baseline, insurance)
    expect(whatIf.origin).toBe('recommender')
  })
})
