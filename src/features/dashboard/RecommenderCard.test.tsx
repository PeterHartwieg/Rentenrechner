// @vitest-environment jsdom
/**
 * Render-integration tests for RecommenderCard.
 *
 * Uses jsdom + @testing-library/react. The component owns marginal-budget
 * ranking-filter state and consumes the recommender engine; tests assert
 * that:
 *   - The card renders without crashing on a baseline workspace.
 *   - A marginal budget causes candidate cards to render.
 *   - Ranking buttons toggle the highlighted winner label.
 *   - Clicking "Als Plan speichern" invokes the onSaveAsPlan callback.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { RecommenderCard } from './RecommenderCard'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { migrateV1ToV2 } from '../../storage'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { de2026Rules } from '../../rules/de2026'
import { confidenceForResult, confidenceLanguage } from '../../app/evidence'
import type { InsuranceInstance } from '../../domain/instances'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

function setup() {
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['bav', 'etf'],
    bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 100 },
  }
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  const bundle = runCombineSimulation(ws, de2026Rules)
  const basisId = ws.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')?.id
    ?? ws.baseline.assumptions.returnScenarios[0].id
  const baselineCombined = bundle.combinedByScenarioId[basisId]
  return {
    workspace: ws,
    baselineCombined,
    baselinePerInstance: bundle.perInstance,
    grvGrossMonthlyPension: bundle.statutoryPension.grossMonthlyPension,
  }
}

describe('RecommenderCard', () => {
  it('renders the result-only ranking controls', () => {
    // PR 6: heading + winner-badge framing neutralised. Card now reads as a
    // neutral "which contract benefits from extra contribution?" surface
    // rather than crowning a winner.
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )
    expect(container.querySelector('.recommender-card')).toBeTruthy()
    expect(container.querySelectorAll('.recommender-sort-button').length).toBe(5)
    // Heading is the neutral question, not "Beste Optionen für …".
    expect(container.querySelector('h3')?.textContent).toContain(
      'Welcher Vertrag profitiert am stärksten',
    )
    // Sort row indicator reads as a sort-by label, not a winner-claim.
    const indicator = container.querySelector('.recommender-sort-indicator')
    expect(indicator?.textContent).toContain('Sortieren nach')
    // Winner badge is gone.
    expect(container.querySelector('.recommender-candidate-winner')).toBeNull()
    // Brand-regression sweep (P0 guardrail): no "Empfehlung" framing reads
    // as a recommendation that we are not licensed to make.
    expect(container.textContent ?? '').not.toMatch(/Empfehlung/)
    // No "Beste Option für …" winner badge text anywhere in the card.
    expect(container.textContent ?? '').not.toMatch(/Beste Option für/)
  })

  it('shows candidate cards for the supplied marginal budget', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )
    const cands = container.querySelectorAll('.recommender-candidate')
    expect(cands.length).toBeGreaterThan(0)
  })

  it('ranking buttons re-sort the candidate list without crowning a winner', () => {
    // PR 6: clicking a sort button re-orders the list but does NOT label a
    // candidate as the "winner". The sort row keeps a neutral "Sortieren
    // nach" label; the active button is reflected via aria-pressed.
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )
    const sortButtons = container.querySelectorAll('.recommender-sort-button')
    const flexBtn = Array.from(sortButtons).find((b) => b.textContent === 'Flexibilität')
    expect(flexBtn).toBeTruthy()
    fireEvent.click(flexBtn!)
    // The clicked button now reports aria-pressed=true; the indicator label
    // stays neutral.
    expect(flexBtn!.getAttribute('aria-pressed')).toBe('true')
    const indicator = container.querySelector('.recommender-sort-indicator')
    expect(indicator?.textContent).toContain('Sortieren nach')
    // No winner badge anywhere on the card after the sort changes.
    expect(container.querySelector('.recommender-candidate-winner')).toBeNull()
  })

  it('invokes onSaveAsPlan when "Als Plan speichern" is clicked', () => {
    const ctx = setup()
    const onSave = vi.fn()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={onSave} />,
    )
    const saveButtons = container.querySelectorAll('.recommender-candidate-save')
    expect(saveButtons.length).toBeGreaterThan(0)
    fireEvent.click(saveButtons[0])
    expect(onSave).toHaveBeenCalledTimes(1)
    const call = onSave.mock.calls[0][0]
    expect(call.productId).toBeDefined()
    expect(call.grossMonthlyEUR).toBeGreaterThan(0)
  })

  it('renders a visual relative-ranking meter for each candidate', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )

    const candidates = container.querySelectorAll('.recommender-candidate')
    expect(candidates.length).toBeGreaterThan(0)
    const meters = container.querySelectorAll('[role="meter"][aria-label*="Relative"]')
    expect(meters.length).toBe(candidates.length)
  })

  it('keeps dense rule/legal atom text collapsed by default', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )

    expect(container.textContent ?? '').not.toMatch(/§\s*\d/)
    expect(container.querySelectorAll('.recommender-candidate-atom').length).toBe(0)
  })

  it('does not render candidate cards when budget is 0', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={0} onSaveAsPlan={() => {}} />,
    )
    const cands = container.querySelectorAll('.recommender-candidate')
    expect(cands.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Regression: insurance evidence quality must participate in the confidence
// calculation (issue #32).
//
// Before the fix, wsa.insurance was excluded from `allInstances` in
// RecommenderCard's confidence useMemo. An insurance-only workspace with
// model_estimate inputs would still produce the direct (confident) language,
// silently ignoring the quality of the only live contract.
// ---------------------------------------------------------------------------

/** Minimal InsuranceInstance fixture shared by the two regression tests. */
function makeInsuranceInstance(overrides: Partial<InsuranceInstance> = {}): InsuranceInstance {
  return {
    instanceId: 'versicherung-singleton',
    label: 'Private Rentenversicherung',
    status: 'active',
    contractStartYear: 2010,
    evidenceMap: {},
    oldContractTaxFreeEligible: false,
    monthlyOtherRetirementIncome: 1500,
    capitalGuarantee: { enabled: false, floorPctOfContributions: 0 },
    fees: {
      wrapperAssetFee: 0.01,
      fundAssetFee: 0.0015,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0.05,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
    payoutMode: 'leibrente',
    rentenfaktor: 28,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    surrenderHaircutPct: 0,
    annualContributionGrowthRate: 0,
    monthlyContribution: 200,
    ...overrides,
  }
}

describe('RecommenderCard — insurance confidence regression (#32)', () => {
  it('insurance instance with empty evidenceMap yields model_estimate confidence', () => {
    // An insurance instance whose evidenceMap is empty (i.e. all required fields
    // are unconfirmed). confidenceForResult must return 'model_estimate' so that
    // the hedged language ("Auf deinen Schätzungen ergibt sich") is shown.
    const inst = makeInsuranceInstance({ evidenceMap: {} })
    const confidence = confidenceForResult({ productId: 'versicherung' }, inst.evidenceMap)
    expect(confidence).toBe('model_estimate')
    // Verify that this translates to hedged language.
    expect(confidenceLanguage(confidence).prefix).toContain('Schätzungen')
  })

  it('insurance instance with all evidence user_confirmed yields user_confirmed confidence', () => {
    // Symmetric check: a fully-confirmed insurance instance must NOT lower
    // the confidence to model_estimate, i.e. the fix doesn't cause false positives.
    const inst = makeInsuranceInstance({
      evidenceMap: {
        monthlyContribution: 'user_confirmed',
        'fees.wrapperAssetFee': 'user_confirmed',
        'fees.fundAssetFee': 'user_confirmed',
        'fees.acquisitionCostPct': 'user_confirmed',
        'fees.pensionPayoutFeePct': 'user_confirmed',
        rentenfaktor: 'user_confirmed',
        payoutMode: 'user_confirmed',
        contractStartYear: 'user_confirmed',
      },
    })
    const confidence = confidenceForResult({ productId: 'versicherung' }, inst.evidenceMap)
    expect(confidence).toBe('user_confirmed')
    // Verify that this translates to the direct (non-hedged) language.
    expect(confidenceLanguage(confidence).prefix).not.toContain('Schätzungen')
  })
})
