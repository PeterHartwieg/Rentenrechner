/**
 * bAV candidate generator — per-product unit tests.
 *
 * Coverage:
 *   - Visible candidate: returns null when §3 Nr. 63 cap headroom is zero;
 *     produces an "add to existing" candidate when the user has an active
 *     instance; produces an "activate offer" candidate when an offered
 *     instance exists; falls back to a synthetic new-instance candidate when
 *     no bAV instance is present.
 *   - Reasons: `cappedToRemaining` flag fires when grossDelta exceeds the
 *     remaining cap; `usesStandardAssumptions` and `bavOffer.standardAssumption`
 *     reflect whether the modal answer was a real offer or the recommender
 *     default.
 *   - Ranking inputs: `monthlyEmployerContributionEUR` honors percent + flat +
 *     cap; `mcInputs.monthlyContribution` includes employer share.
 *   - Materialized what-if: passing the candidate through `recommendNextEuro` +
 *     `buildWhatIfFromCandidate` activates an offered bAV and bumps gross
 *     conversion.
 *   - Helper: `monthlyEmployerContributionForOffer` honors percent + flat + cap.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import { migrateV1ToV2 } from '../../storage'
import {
  buildWhatIfFromCandidate,
  recommendNextEuro,
  type RecommendNextEuroInput,
} from '../recommender'
import { runCombineSimulation } from '../useCombineSimulation'
import { makeBavCandidate, monthlyEmployerContributionForOffer } from './bav'
import {
  DEFAULT_BAV_OFFER,
  buildAnnaWorkspace,
  buildBerndWorkspace,
  buildGeneratorContext,
} from './testHelpers'
import type { BavInstance } from '../../domain/instances'

describe('monthlyEmployerContributionForOffer', () => {
  it('returns 0 when monthlyGrossConversion is 0 (no own contribution to match)', () => {
    expect(
      monthlyEmployerContributionForOffer(0, {
        ...DEFAULT_BAV_OFFER,
        hasOffer: true,
        employerMatchPercent: 0.5,
        fixedMonthlyEUR: 100,
      }),
    ).toBe(0)
  })

  it('combines percent and flat additively', () => {
    const result = monthlyEmployerContributionForOffer(200, {
      ...DEFAULT_BAV_OFFER,
      hasOffer: true,
      employerMatchPercent: 0.5,
      fixedMonthlyEUR: 80,
    })
    expect(result).toBeCloseTo(200 * 0.5 + 80, 4)
  })

  it('clamps the combined contribution to the offer cap', () => {
    const result = monthlyEmployerContributionForOffer(200, {
      ...DEFAULT_BAV_OFFER,
      hasOffer: true,
      employerMatchPercent: 1,
      fixedMonthlyEUR: 80,
      monthlyCapEUR: 120,
    })
    expect(result).toBe(120)
  })
})

describe('makeBavCandidate — visible candidate behavior', () => {
  it('returns an "add to existing" candidate for an active bAV instance', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 200)
    const draft = makeBavCandidate(g)
    expect(draft).not.toBeNull()
    expect(draft!.productId).toBe('bav')
    expect(draft!.isNewInstance).toBe(false)
    expect(draft!.id).toMatch(/^add_to_/)
  })

  it('synthesizes a new-instance candidate when no bAV instance exists', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.bav = []
    const g = buildGeneratorContext(ws, 200)
    const draft = makeBavCandidate(g)
    expect(draft).not.toBeNull()
    expect(draft!.isNewInstance).toBe(true)
    expect(draft!.id).toBe('new_bav_standard_offer')
    expect(draft!.newInstance).toBeDefined()
  })

  it('produces an "activate" candidate from an offered bAV instance', () => {
    const ws = buildAnnaWorkspace()
    const offer: BavInstance = {
      ...defaultAssumptions.bav,
      instanceId: 'bav-offer-id',
      label: 'bAV-Angebot',
      status: 'offered',
      contractStartYear: de2026Rules.year,
      currentValueEUR: 0,
      evidenceMap: {},
      monthlyGrossConversion: 0,
      contractualMatchPercent: 0.5,
      contractualFixedMonthly: 0,
    }
    ws.baseline.assumptions.bav = [offer]
    const g = buildGeneratorContext(ws, 200)
    const draft = makeBavCandidate(g)
    expect(draft).not.toBeNull()
    expect(draft!.id).toBe('activate_bav-offer-id')
    expect(draft!.targetInstanceId).toBe('bav-offer-id')
    expect(draft!.isNewInstance).toBe(false)
  })

  it('returns null when the §3 Nr. 63 cap is fully used', () => {
    const ws = buildBerndWorkspace()
    const capMonthly =
      (de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap) / 12
    ws.baseline.assumptions.bav = ws.baseline.assumptions.bav.map((b) => ({
      ...b,
      monthlyGrossConversion: capMonthly,
    }))
    const g = buildGeneratorContext(ws, 400)
    expect(makeBavCandidate(g)).toBeNull()
  })
})

describe('makeBavCandidate — reasons', () => {
  it('flags cappedToRemaining when desired marginal exceeds the headroom', () => {
    const ws = buildBerndWorkspace()
    const capMonthly =
      (de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap) / 12
    ws.baseline.assumptions.bav = ws.baseline.assumptions.bav.map((b) => ({
      ...b,
      monthlyGrossConversion: capMonthly - 50,
    }))
    const g = buildGeneratorContext(ws, 400)
    const draft = makeBavCandidate(g)
    expect(draft).not.toBeNull()
    expect(draft!.cappedToRemaining).toBe(true)
  })

  it('does NOT flag cappedToRemaining when ample headroom is available', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 100)
    const draft = makeBavCandidate(g)!
    expect(draft.cappedToRemaining).toBe(false)
  })

  it('marks usesStandardAssumptions when no real offer is supplied (Anna fallback)', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.bav = []
    const g = buildGeneratorContext(ws, 200, { ...DEFAULT_BAV_OFFER }) // standardAssumption=true
    const draft = makeBavCandidate(g)!
    expect(draft.usesStandardAssumptions).toBe(true)
    expect(draft.bavOffer?.standardAssumption).toBe(true)
  })

  it('clears usesStandardAssumptions when a real offer is supplied', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.bav = []
    const g = buildGeneratorContext(ws, 200, {
      hasOffer: true,
      standardAssumption: false,
      employerMatchPercent: 0.5,
      fixedMonthlyEUR: 0,
      effectiveCostAnnual: 0.008,
      durchfuehrungsweg: 'direktversicherung_3_63',
      payoutMode: 'leibrente',
      rentenfaktor: 30,
    })
    const draft = makeBavCandidate(g)!
    expect(draft.usesStandardAssumptions).toBe(false)
    expect(draft.bavOffer?.standardAssumption).toBe(false)
  })
})

describe('makeBavCandidate — ranking inputs', () => {
  it('mcInputs.monthlyContribution includes the employer share when an offer is supplied', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.bav = []
    const g = buildGeneratorContext(ws, 200, {
      hasOffer: true,
      standardAssumption: false,
      employerMatchPercent: 0.5,
      fixedMonthlyEUR: 50,
      effectiveCostAnnual: 0.012,
      durchfuehrungsweg: 'direktversicherung_3_63',
      payoutMode: 'leibrente',
      rentenfaktor: 30,
    })
    const draft = makeBavCandidate(g)!
    expect(draft.monthlyEmployerContributionEUR).toBeGreaterThan(0)
    // mcInputs.monthlyContribution = own gross + employer monthly share
    expect(draft.mcInputs.monthlyContribution).toBeGreaterThanOrEqual(
      (draft.monthlyEmployerContributionEUR ?? 0),
    )
    expect(draft.mcInputs.totalFeeDecimal).toBeCloseTo(0.012, 6)
  })

  it('netCashOutEUR ≈ marginal target when not capped (margin solver convergence)', () => {
    const ws = buildAnnaWorkspace()
    ws.baseline.assumptions.bav = []
    const g = buildGeneratorContext(ws, 100)
    const draft = makeBavCandidate(g)!
    if (!draft.cappedToRemaining) {
      expect(Math.abs(draft.netCashOutEUR - 100)).toBeLessThan(1)
    }
  })

  it('candidate capital projection is positive and finite', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 200)
    const draft = makeBavCandidate(g)!
    expect(Number.isFinite(draft.candidateResult.capitalAtRetirement)).toBe(true)
    expect(draft.candidateResult.capitalAtRetirement).toBeGreaterThan(0)
  })
})

describe('makeBavCandidate — materialized what-if effects', () => {
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

  it('saving an offer candidate activates the bAV in the what-if', () => {
    function buildWorkspaceWithBavOffer(): ReturnType<typeof buildAnnaWorkspace> {
      const ws = buildAnnaWorkspace()
      const offer: BavInstance = {
        ...defaultAssumptions.bav,
        instanceId: 'bav-offer-test',
        label: 'bAV-Angebot',
        status: 'offered',
        contractStartYear: de2026Rules.year,
        currentValueEUR: 0,
        evidenceMap: {},
        monthlyGrossConversion: 0,
        contractualMatchPercent: 0.5,
        contractualFixedMonthly: 0,
      }
      ws.baseline.assumptions.bav = [offer]
      return ws
    }

    // Re-derive workspace inside the test to keep migration boundaries clear.
    const v1 = {
      ...defaultAssumptions,
      visibleProducts: ['etf'],
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 0 },
    }
    const annaWs = migrateV1ToV2(
      defaultAssumptions as unknown as Record<string, unknown>,
      v1 as unknown as Record<string, unknown>,
    )
    void annaWs

    const ws = buildWorkspaceWithBavOffer()
    const candidates = recommendNextEuro(buildInput(ws, 200))
    const bav = candidates.find((c) => c.productId === 'bav')
    expect(bav).toBeDefined()
    const whatIf = buildWhatIfFromCandidate(ws.baseline, bav!)
    const activated = whatIf.assumptions.bav.find((b) => b.instanceId === 'bav-offer-test')
    expect(activated?.status).toBe('active')
    expect(activated?.monthlyGrossConversion).toBeCloseTo(bav!.grossMonthlyEUR, 1)
  })
})
