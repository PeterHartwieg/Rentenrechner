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
import { recommendNextEuro } from '../../app/recommender'
import { realDeflator } from '../../app/planSummary'
import { getProductMeta } from '../../engine/productRegistry'
import { formatCurrency, formatPercent } from '../../utils/format'
import type { InsuranceInstance } from '../../domain/instances'
import { afterEach } from 'vitest'
import { eachViewport, mockViewport } from '../../test/viewport'

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

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

// ---------------------------------------------------------------------------
// UI audit 2026-09-11 — F02 (money basis + scope), F16 (risk / ranking labels),
// F20 (unique help-control names).
// ---------------------------------------------------------------------------

function rowValue(scope: Element, dtText: string): string {
  const row = Array.from(scope.querySelectorAll('.recommender-figures__row')).find((r) =>
    r.querySelector('dt')?.textContent?.includes(dtText),
  )
  expect(row, `row "${dtText}"`).toBeTruthy()
  return row!.querySelector('dd')?.textContent ?? ''
}

describe('RecommenderCard — audit F02: today\'s euros, scope labels, same figures as the engine', () => {
  it('labels the money basis and the selected return scenario once per card', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )
    const note = container.querySelector('.recommender-basis-note')
    expect(note?.textContent).toContain('heutigen Euro')
    expect(note?.textContent).toContain('Basis')
    expect(note?.textContent).toContain(`${formatPercent(0.05, 1)} p.a.`)
  })

  it('follows the selected scenario id in the basis note', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} selectedScenarioId="optimistisch" onSaveAsPlan={() => {}} />,
    )
    const label = ctx.workspace.baseline.assumptions.returnScenarios.find((s) => s.id === 'optimistisch')?.label
    expect(label).toBeTruthy()
    expect(container.querySelector('.recommender-basis-note')?.textContent).toContain(label!)
  })

  it('shows whole-plan income and the additional income in today\'s euros, matching the engine', () => {
    const base = setup()
    // Non-zero inflation so the deflated and the nominal figure differ; the
    // default fixture would otherwise make the leak check vacuous.
    const workspace = structuredClone(base.workspace)
    workspace.baseline.assumptions.inflationRate = 0.02
    const ctx = { ...base, workspace }
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )
    const candidates = recommendNextEuro({
      workspace: ctx.workspace,
      rules: de2026Rules,
      marginalMonthlyEUR: 400,
      baselinePerInstance: ctx.baselinePerInstance,
      baselineCombined: ctx.baselineCombined,
      grvGrossMonthlyPension: ctx.grvGrossMonthlyPension,
    })
    const profile = ctx.workspace.baseline.profile
    const deflator = realDeflator(
      ctx.workspace.baseline.assumptions.inflationRate,
      profile.retirementAge - profile.age,
    )
    expect(deflator).toBeLessThan(0.99)
    const first = container.querySelector('.recommender-candidate')!
    const top = candidates[0]
    expect(first.textContent).toContain(top.label)
    // Whole-plan figure: exact full simulation, deflated with the plan's deflator.
    expect(rowValue(first, 'Netto-Rente gesamt (ganzer Plan)')).toBe(
      `${formatCurrency(top.medianNettoRente * deflator)} / Mon.`,
    )
    // Additional income: whole plan with the candidate minus the baseline.
    const additional = (top.medianNettoRente - ctx.baselineCombined.monthlyNetIncome) * deflator
    expect(rowValue(first, 'Zusätzliche Netto-Rente durch diese Änderung')).toBe(
      `+${formatCurrency(additional)} / Mon.`,
    )
    expect(rowValue(first, 'Zusätzliches Nettobudget')).toContain(formatCurrency(top.netCashOutEUR))
    // Capital is the extra capital from the change, also in today's euros.
    expect(rowValue(first, 'Zusätzliches Kapital bei Renteneintritt')).toContain(
      formatCurrency(top.netCapitalAtRetirement * deflator),
    )
    // The nominal whole-plan number must not leak into the card.
    expect(container.textContent).not.toContain(`${formatCurrency(top.medianNettoRente)} / Mon.`)
  })

  it('shows the current Wunschrente and the remaining gap per candidate', () => {
    const ctx = setup()
    const profile = ctx.workspace.baseline.profile
    const deflator = realDeflator(ctx.workspace.baseline.assumptions.inflationRate, profile.retirementAge - profile.age)
    // A target far above the plan so every candidate leaves a gap.
    const target = Math.round(ctx.baselineCombined.monthlyNetIncome * deflator) + 5_000
    const workspace = structuredClone(ctx.workspace)
    workspace.baseline.profile.desiredNetMonthlyPension = target
    const { container } = render(
      <RecommenderCard {...ctx} workspace={workspace} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )
    const first = container.querySelector('.recommender-candidate')!
    const whole = rowValue(first, 'Netto-Rente gesamt (ganzer Plan)')
    const gapRow = rowValue(first, `Wunschrente ${formatCurrency(target)}`)
    expect(gapRow).toMatch(/^Verbleibende Lücke .* \/ Mon\.$/)
    expect(whole).not.toBe('')
  })

  it('keeps the real payout duration visible per candidate (ETF drawdown vs. lifelong annuity)', () => {
    const ctx = setup()
    const workspace = structuredClone(ctx.workspace)
    workspace.baseline.assumptions.insurance = [makeInsuranceInstance({ payoutMode: 'leibrente' })]
    const { container } = render(
      <RecommenderCard {...ctx} workspace={workspace} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )
    const cards = Array.from(container.querySelectorAll('.recommender-candidate'))
    const etf = cards.find((c) => c.textContent?.includes('ETF-Depot'))
    const insurance = cards.find((c) => c.textContent?.includes('Versicherung'))
    expect(etf && insurance).toBeTruthy()
    expect(rowValue(etf!, 'Auszahlung')).toContain(
      `Entnahme geplant bis Alter ${workspace.baseline.assumptions.retirementEndAge}`,
    )
    expect(rowValue(insurance!, 'Auszahlung')).toBe('Lebenslang')
  })

  it('names the AVD start year from the current rules, not a hardcoded string', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )
    const avd = Array.from(container.querySelectorAll('.recommender-candidate')).find((c) =>
      c.textContent?.includes('Neues Altersvorsorgedepot'),
    )
    expect(avd, 'fixture yields an AVD candidate').toBeTruthy()
    const year = de2026Rules.altersvorsorgedepot.productStartYear
    expect(avd!.textContent).toContain(`Abschluss erst ab ${year} möglich`)
    expect(avd!.textContent).toContain(getProductMeta('altersvorsorgedepot')!.label)
  })
})

describe('RecommenderCard — audit F16 / F20: risk label, ranking explanation, unique help names', () => {
  it('labels the stochastic floor as a simplified risk scenario, not as "Sicherheit"', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )
    const first = container.querySelector('.recommender-candidate')!
    expect(rowValue(first, 'Vereinfachtes Risikoszenario')).toMatch(/€ \/ Mon\.$/)
    // The bare "Sicherheit" metric label is gone from the candidate rows (the
    // sort button keeps its criterion name).
    const dts = Array.from(first.querySelectorAll('dt')).map((d) => d.textContent?.trim())
    expect(dts).not.toContain('Sicherheit')
    // The explanation names the limits: candidate-only paths, other income
    // held constant, no guarantee.
    const trigger = first.querySelector<HTMLButtonElement>(
      `[aria-label="Vereinfachtes Risikoszenario für ${candidateLabel(first)} erklären"]`,
    )
    expect(trigger).toBeTruthy()
    fireEvent.click(trigger!)
    const tip = first.querySelector('[role="tooltip"]')?.textContent ?? ''
    expect(tip).toContain('200 vereinfachten Zufallspfaden')
    expect(tip).toContain('übrige Einkommen bleibt unverändert')
    expect(tip).toContain('keine Garantie')
    expect(tip).not.toMatch(/Monte-Carlo-Ergebnis für den ganzen Plan(?! und)/)
  })

  it('measures the ranking meter on the additional income, so differences are visible', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )
    const cards = Array.from(container.querySelectorAll('.recommender-candidate'))
    expect(cards.length).toBeGreaterThan(1)
    const additional = (card: Element) =>
      Number(rowValue(card, 'Zusätzliche Netto-Rente').replace(/[^\d]/g, ''))
    const pct = (card: Element) =>
      Number(card.querySelector('[role="meter"]')?.getAttribute('aria-valuenow'))
    expect(pct(cards[0])).toBe(100)
    expect(pct(cards[1])).toBe(Math.round((additional(cards[1]) / additional(cards[0])) * 100))
    // Every meter has an explanation control named for its candidate.
    expect(container.querySelector(`[aria-label="Vergleichswert für ${candidateLabel(cards[0])} erklären"]`)).toBeTruthy()
  })

  it('gives every help control a unique accessible name that includes the candidate', () => {
    const ctx = setup()
    const { container } = render(
      <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
    )
    expect(container.querySelectorAll('[aria-label="Erklärung anzeigen"]').length).toBe(0)
    const labels = Array.from(container.querySelectorAll('.info-tip-trigger')).map((b) =>
      b.getAttribute('aria-label') ?? '',
    )
    expect(labels.length).toBeGreaterThan(0)
    expect(new Set(labels).size).toBe(labels.length)
    for (const label of labels) expect(label).toMatch(/ für .+ erklären$/)
  })
})

function candidateLabel(card: Element): string {
  return card.querySelector('.recommender-candidate-title strong')?.textContent ?? ''
}

describe('RecommenderCard — viewport sweep (PR 11)', () => {
  it('renders the candidate list at phone / tablet / desktop without throwing', () => {
    const ctx = setup()
    eachViewport(() => {
      const { container, unmount } = render(
        <RecommenderCard {...ctx} marginalMonthlyEUR={400} onSaveAsPlan={() => {}} />,
      )
      expect(container.querySelector('.recommender-card')).not.toBeNull()
      expect(container.querySelectorAll('.recommender-candidate').length).toBeGreaterThan(0)
      unmount()
    })
  })
})
