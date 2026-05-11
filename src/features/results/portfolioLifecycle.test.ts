import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { migrateV1ToV2 } from '../../storage'
import { de2026Rules } from '../../rules/de2026'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { buildPortfolioLifecycleViews, PORTFOLIO_LIFECYCLE_ID } from './portfolioLifecycle'

function setupWorkspace() {
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    {
      ...defaultAssumptions,
      visibleProducts: ['bav', 'etf'],
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 100 },
    } as unknown as Record<string, unknown>,
  )
  ws.baseline.assumptions.bav = [
    {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-a',
      label: 'bAV A',
      status: 'active',
      monthlyGrossConversion: 100,
    },
    {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-b',
      label: 'bAV B',
      status: 'paid_up',
      monthlyGrossConversion: 0,
      currentValueEUR: 20_000,
    },
    {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-surrendered',
      label: 'bAV Rückkauf',
      status: 'surrendered',
      monthlyGrossConversion: 100,
    },
  ]
  ws.baseline.assumptions.etf = [
    {
      ...ws.baseline.assumptions.etf[0],
      instanceId: 'etf-a',
      label: 'ETF A',
      status: 'active',
      monthlyContribution: 100,
    },
  ]
  return ws
}

function buildViews() {
  const ws = setupWorkspace()
  const bundle = runCombineSimulation(ws, de2026Rules)
  const basisId = ws.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')?.id
    ?? ws.baseline.assumptions.returnScenarios[0].id
  return {
    ws,
    views: buildPortfolioLifecycleViews({
      workspace: ws,
      perInstance: bundle.perInstance,
      scenarioId: basisId,
      startAge: ws.baseline.profile.age,
      retirementAge: ws.baseline.profile.retirementAge,
      horizonAge: ws.baseline.assumptions.retirementEndAge,
    }),
  }
}

function buildViewsWithEmptyVisibleProducts() {
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    {
      ...defaultAssumptions,
      visibleProducts: [],
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 100 },
    } as unknown as Record<string, unknown>,
  )
  ws.baseline.assumptions.bav = [
    {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-a',
      label: 'bAV A',
      status: 'active',
      monthlyGrossConversion: 100,
    },
  ]
  ws.baseline.assumptions.etf = [
    {
      ...ws.baseline.assumptions.etf[0],
      instanceId: 'etf-a',
      label: 'ETF A',
      status: 'active',
      monthlyContribution: 100,
    },
  ]
  const bundle = runCombineSimulation(ws, de2026Rules)
  const basisId = ws.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')?.id
    ?? ws.baseline.assumptions.returnScenarios[0].id
  return buildPortfolioLifecycleViews({
    workspace: ws,
    perInstance: bundle.perInstance,
    scenarioId: basisId,
    startAge: ws.baseline.profile.age,
    retirementAge: ws.baseline.profile.retirementAge,
    horizonAge: ws.baseline.assumptions.retirementEndAge,
  })
}

describe('buildPortfolioLifecycleViews', () => {
  it('shows all products when visibleProducts is empty (wizard-created combine workspace)', () => {
    const views = buildViewsWithEmptyVisibleProducts()
    expect(views.length).toBeGreaterThan(0)
    expect(views[0].id).toBe(PORTFOLIO_LIFECYCLE_ID)
    expect(views.some((v) => v.id === 'bav')).toBe(true)
    expect(views.some((v) => v.id === 'etf')).toBe(true)
  })

  it('defaults to a Gesamtportfolio aggregate and excludes GRV', () => {
    const { views } = buildViews()
    expect(views[0].id).toBe(PORTFOLIO_LIFECYCLE_ID)
    expect(views[0].label).toBe('Gesamtportfolio')
    expect(views.some((view) => view.id === 'grv')).toBe(false)
  })

  it('filters surrendered instances but includes active and paid-up contracts', () => {
    const { views } = buildViews()
    const bav = views.find((view) => view.id === 'bav')
    expect(bav).toBeDefined()
    expect(bav!.count).toBe(2)
    expect(bav!.label).toContain('2 Verträge')
  })

  it('aggregates product-type lines into the Gesamtportfolio line', () => {
    const { views } = buildViews()
    const portfolio = views.find((view) => view.id === PORTFOLIO_LIFECYCLE_ID)!
    const productSum = views
      .filter((view) => view.id !== PORTFOLIO_LIFECYCLE_ID)
      .reduce((sum, view) => sum + view.result.capitalAtRetirement, 0)
    expect(portfolio.result.capitalAtRetirement).toBeCloseTo(productSum, 2)
  })

  it('exposes product-colored savings-phase stack rows for Gesamtportfolio only', () => {
    const { views, ws } = buildViews()
    const portfolio = views.find((view) => view.id === PORTFOLIO_LIFECYCLE_ID)!
    const productView = views.find((view) => view.id === 'bav')!

    const stackRows = (
      portfolio as unknown as {
        savingsStackRows?: Array<{
          age: number
          totalBalance: number
          layers: Array<{ productId: string; balance: number }>
        }>
      }
    ).savingsStackRows

    expect(stackRows).toBeDefined()
    expect(productView).not.toHaveProperty('savingsStackRows')

    for (const row of stackRows ?? []) {
      expect(row.age).toBeGreaterThan(ws.baseline.profile.age)
      expect(row.age).toBeLessThanOrEqual(ws.baseline.profile.retirementAge)
      expect(row.layers.some((layer) => layer.productId === 'grv')).toBe(false)
      expect(row.layers.map((layer) => layer.productId).sort()).toEqual(['bav', 'etf'])
      expect(row.layers.reduce((sum, layer) => sum + layer.balance, 0)).toBeCloseTo(row.totalBalance, 2)

      const aggregateRow = portfolio.result.rows.find((point) => point.age === row.age)!
      expect(row.totalBalance).toBeCloseTo(aggregateRow.balance, 2)
    }
  })
})
