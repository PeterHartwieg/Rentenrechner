/**
 * What-if preview tests (Phase 3).
 *
 * The rule the flow rests on: building or viewing a preview never changes the
 * plan. Only an explicit apply does.
 */

import { describe, expect, it } from 'vitest'
import type { BavInstance, EtfInstance } from '../domain/instances'
import type { Workspace } from '../domain/workspace'
import { defaultWorkspace } from '../storage'
import { INVENTORY_PRODUCT_REGISTRY } from '../features/inventory/inventoryProductRegistry'
import { deepCloneScenario, forkBaselineScenario } from './portfolioState'
import {
  buildContributionWhatIf,
  buildOfferActivationWhatIf,
  describeWhatIf,
  whatIfLabel,
  whatIfStatus,
} from './whatIfPreview'

function etf(instanceId: string, monthlyContribution: number): EtfInstance {
  return {
    ...INVENTORY_PRODUCT_REGISTRY.etf.createDefault(2026, 1, () => instanceId),
    instanceId,
    label: `Depot ${instanceId.slice(-4)}`,
    monthlyContribution,
  }
}

function bav(instanceId: string, monthlyGrossConversion: number): BavInstance {
  return {
    ...INVENTORY_PRODUCT_REGISTRY.bav.createDefault(2026, 1, () => instanceId),
    instanceId,
    label: 'Betriebsrente',
    monthlyGrossConversion,
    currentValueEUR: 8000,
  }
}

function workspace(): Workspace {
  const ws = deepCloneScenario(defaultWorkspace)
  ws.mode = 'combine'
  ws.baseline.assumptions.etf = [etf('etf-aaaa1111', 200), etf('etf-bbbb2222', 150)]
  ws.baseline.assumptions.bav = [bav('bav-cccc3333', 100)]
  ws.baseline.lastEditedAt = 1000
  return ws
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

describe('buildContributionWhatIf', () => {
  it('changes one contribution and leaves the baseline untouched', () => {
    const ws = workspace()
    const before = deepCloneScenario(ws)
    const whatIf = buildContributionWhatIf(ws, 'etf-bbbb2222', {
      kind: 'contribution',
      monthly: 400,
    })

    expect(whatIf).not.toBeNull()
    expect(whatIf!.assumptions.etf[1].monthlyContribution).toBe(400)
    expect(whatIf!.assumptions.etf[0].monthlyContribution).toBe(200)
    expect(ws).toEqual(before)
  })

  it('uses each product\'s own contribution field', () => {
    const whatIf = buildContributionWhatIf(workspace(), 'bav-cccc3333', {
      kind: 'contribution',
      monthly: 275,
    })
    expect(whatIf!.assumptions.bav[0].monthlyGrossConversion).toBe(275)
  })

  it('applies the shipped beitragsfrei decision, without touching the baseline', () => {
    const ws = workspace()
    const before = deepCloneScenario(ws)
    const whatIf = buildContributionWhatIf(ws, 'bav-cccc3333', { kind: 'paid_up' })

    expect(whatIf!.assumptions.bav[0].status).toBe('paid_up')
    expect(ws).toEqual(before)
    expect(ws.baseline.assumptions.bav[0].status).toBe('active')
  })

  it('a contribution of 0 is allowed and is not the same as beitragsfrei', () => {
    const zero = buildContributionWhatIf(workspace(), 'bav-cccc3333', {
      kind: 'contribution',
      monthly: 0,
    })
    expect(zero!.assumptions.bav[0].monthlyGrossConversion).toBe(0)
    expect(zero!.assumptions.bav[0].status).toBe('active')
  })

  it('refuses an unknown contract and a non-finite amount', () => {
    expect(
      buildContributionWhatIf(workspace(), 'etf-missing0', { kind: 'contribution', monthly: 1 }),
    ).toBeNull()
    expect(
      buildContributionWhatIf(workspace(), 'etf-aaaa1111', {
        kind: 'contribution',
        monthly: Number.NaN,
      }),
    ).toBeNull()
    expect(
      buildContributionWhatIf(workspace(), 'etf-aaaa1111', { kind: 'contribution', monthly: -5 }),
    ).toBeNull()
  })

  it('labels the alternative per the §4 copy table', () => {
    const contribution = buildContributionWhatIf(workspace(), 'etf-bbbb2222', {
      kind: 'contribution',
      monthly: 400,
    })
    expect(contribution!.label).toContain('Beitrag / Monat')
    expect(contribution!.label.startsWith('Depot 2222')).toBe(true)

    const paidUp = buildContributionWhatIf(workspace(), 'bav-cccc3333', { kind: 'paid_up' })
    expect(paidUp!.label).toBe('Betriebsrente: keine weiteren Beiträge')
    expect(whatIfLabel('X', { kind: 'paid_up' })).toBe('X: keine weiteren Beiträge')
  })
})

// ---------------------------------------------------------------------------
// Describing
// ---------------------------------------------------------------------------

describe('describeWhatIf', () => {
  it('recovers the contract, the decision and both contribution sides', () => {
    const ws = workspace()
    const whatIf = buildContributionWhatIf(ws, 'etf-bbbb2222', {
      kind: 'contribution',
      monthly: 400,
    })!
    const described = describeWhatIf(whatIf)

    expect(described.instanceId).toBe('etf-bbbb2222')
    expect(described.productId).toBe('etf')
    expect(described.decision).toBe('contribution')
    expect(described.changed).toBe(true)
    expect(described.beforeContributionMonthly).toBe(150)
    expect(described.afterContributionMonthly).toBe(400)
    expect(described.sourceRevision.createdAt).toBe(whatIf.createdAt)
  })

  it('recognises a paid-up alternative', () => {
    const whatIf = buildContributionWhatIf(workspace(), 'bav-cccc3333', { kind: 'paid_up' })!
    const described = describeWhatIf(whatIf)
    expect(described.decision).toBe('paid_up')
    expect(described.instanceId).toBe('bav-cccc3333')
    expect(described.changed).toBe(true)
  })

  it('keeps contract, decision and both amounts when the contribution is unchanged', () => {
    // 150 -> 150 leaves no diff to read; the before/after still have to show
    // the real amount instead of degrading to "unbekannt".
    const whatIf = buildContributionWhatIf(workspace(), 'etf-bbbb2222', {
      kind: 'contribution',
      monthly: 150,
    })!
    const described = describeWhatIf(whatIf)

    expect(described.instanceId).toBe('etf-bbbb2222')
    expect(described.productId).toBe('etf')
    expect(described.decision).toBe('contribution')
    expect(described.changed).toBe(false)
    expect(described.beforeContributionMonthly).toBe(150)
    expect(described.afterContributionMonthly).toBe(150)
  })

  it('marks an unchanged contribution alternative in its label', () => {
    const unchanged = buildContributionWhatIf(workspace(), 'etf-bbbb2222', {
      kind: 'contribution',
      monthly: 150,
    })!
    expect(unchanged.label).toBe(
      `${whatIfLabel('Depot 2222', { kind: 'contribution', monthly: 150 })} (unverändert)`,
    )

    const changed = buildContributionWhatIf(workspace(), 'etf-bbbb2222', {
      kind: 'contribution',
      monthly: 400,
    })!
    expect(changed.label).not.toContain('unverändert')
  })

  it('reports "other" for a fork that changes nothing per-contract', () => {
    const ws = workspace()
    const whatIf = forkBaselineScenario(ws.baseline, 'Nur Annahmen')
    whatIf.assumptions.inflationRate = 0.03
    const described = describeWhatIf(whatIf)
    expect(described.decision).toBe('other')
    expect(described.instanceId).toBeNull()
    expect(described.changed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

describe('whatIfStatus', () => {
  it('is current for a fresh alternative', () => {
    const ws = workspace()
    const whatIf = buildContributionWhatIf(ws, 'etf-bbbb2222', {
      kind: 'contribution',
      monthly: 400,
    })!
    whatIf.derivedFromBaselineSnapshot.lastEditedAt = 5000
    ws.whatIfs = [whatIf]
    ws.baseline.lastEditedAt = 4000
    expect(whatIfStatus(whatIf, ws)).toBe('current')
  })

  it('is stale once the plan moves on', () => {
    const ws = workspace()
    const whatIf = buildContributionWhatIf(ws, 'etf-bbbb2222', {
      kind: 'contribution',
      monthly: 400,
    })!
    whatIf.derivedFromBaselineSnapshot.lastEditedAt = 5000
    ws.baseline.lastEditedAt = 9000
    expect(whatIfStatus(whatIf, ws)).toBe('stale')
  })

  it('is missing-source when the contract left the plan', () => {
    const ws = workspace()
    const whatIf = buildContributionWhatIf(ws, 'etf-bbbb2222', {
      kind: 'contribution',
      monthly: 400,
    })!
    ws.baseline.assumptions.etf = [ws.baseline.assumptions.etf[0]]
    expect(whatIfStatus(whatIf, ws)).toBe('missing-source')
  })

  it('is shape-drift when a different contract was added', () => {
    const ws = workspace()
    const whatIf = buildContributionWhatIf(ws, 'etf-bbbb2222', {
      kind: 'contribution',
      monthly: 400,
    })!
    whatIf.derivedFromBaselineSnapshot.lastEditedAt = 5000
    ws.baseline.assumptions.bav = [...ws.baseline.assumptions.bav, bav('bav-dddd4444', 50)]
    expect(whatIfStatus(whatIf, ws)).toBe('shape-drift')
  })
})

// ---------------------------------------------------------------------------
// Compare-mode singleton path (paired assertion, CLAUDE.md cron guardrail)
// ---------------------------------------------------------------------------

describe('compare-mode singleton path', () => {
  it('returns null on a workspace with no instances, and writes nothing', () => {
    const ws = deepCloneScenario(defaultWorkspace)
    const before = deepCloneScenario(ws)
    expect(
      buildContributionWhatIf(ws, 'etf-aaaa1111', { kind: 'contribution', monthly: 100 }),
    ).toBeNull()
    expect(ws).toEqual(before)
  })
})


describe('audit: offer activation description', () => {
  it('identifies an offered contract even when its quoted contribution stays the same', () => {
    const ws = workspace()
    ws.baseline.assumptions.bav[0].status = 'offered'
    const alternative = forkBaselineScenario(ws.baseline, 'Angebot nutzen', 'recommender')
    alternative.assumptions.bav[0].status = 'active'
    expect(describeWhatIf(alternative)).toMatchObject({
      decision: 'activate_offer', instanceId: 'bav-cccc3333', instanceLabel: 'Betriebsrente',
      beforeContributionMonthly: 0, afterContributionMonthly: 100, changed: true,
    })
  })
})


it('reviews the selected offer at its quoted amount without changing another offer or the baseline', () => {
  const ws = workspace()
  ws.baseline.assumptions.bav = [
    { ...bav('bav-first001', 100), status: 'offered' },
    { ...bav('bav-second01', 350), status: 'offered' },
  ]
  const original = structuredClone(ws)
  const reviewed = buildOfferActivationWhatIf(ws, 'bav-second01')!
  expect(reviewed.assumptions.bav[0].status).toBe('offered')
  expect(reviewed.assumptions.bav[1]).toEqual({ ...original.baseline.assumptions.bav[1], status: 'active' })
  expect(describeWhatIf(reviewed)).toMatchObject({ decision: 'activate_offer', beforeContributionMonthly: 0, afterContributionMonthly: 350 })
  expect(ws).toEqual(original)
  expect(buildOfferActivationWhatIf(ws, 'missing')).toBeNull()
})
