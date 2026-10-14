import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { migrateV1ToV2 } from '../storage'
import { de2026Rules } from '../rules/de2026'
import { zeroFeeModel } from './buildResult'
import { runCombineSimulation } from '../app/useCombineSimulation'
import { selectResultReadiness } from '../app/resultReadiness'
import { draftFromInstance, draftToInstancePatch } from '../features/inventory/contractDraft'
import { buildWorkspaceJson, parseWorkspaceJson } from '../storage'
import { computeSurrenderTax } from './portfolioTransfer'
import { calculateEtfAllowanceDemand } from './portfolioAllowance'
import { simulatePortfolio } from './portfolioAdapter'

function existing(basis: number, vorab = 0) {
  const workspace = migrateV1ToV2(
    { ...defaultProfile, age: 66, retirementAge: 67 },
    defaultAssumptions as unknown as Record<string, unknown>,
  )
  workspace.baseline.assumptions.returnScenarios = [{ id: defaultAssumptions.returnScenarios[0].id, label: 'Null', annualReturn: 0 }]
  workspace.baseline.assumptions.etf = [{
    ...workspace.baseline.assumptions.etf[0], currentValueEUR: 100000,
    historicalCostBasisEUR: basis, historicalVorabpauschaleEUR: vorab,
    monthlyContribution: 0, annualAssetFee: 0,
  }]
  return workspace
}

describe('existing ETF tax basis through portfolio simulation', () => {
  it('does not tax historical principal or count it as new saving', () => {
    const workspace = existing(100000)
    const result = simulatePortfolio(workspace, de2026Rules).perInstance[workspace.baseline.assumptions.etf[0].instanceId][0]
    expect(result.capitalAtRetirement).toBe(100000)
    expect(result.afterTaxLumpSum).toBe(100000)
    expect(result.totalUserCost).toBe(0)
    expect(result.totalProductContributions).toBe(0)
  })
  it('taxes only actual gains and credits historical Vorabpauschalen', () => {
    const workspace = existing(80000, 5000)
    const result = simulatePortfolio(workspace, de2026Rules).perInstance[workspace.baseline.assumptions.etf[0].instanceId][0]
    expect(result.afterTaxLumpSum).toBeCloseTo(100000 - (15000 * 0.7 - 1000) * 0.26375, 8)
  })
})

describe('historical tax inputs', () => {
  it('preserves missing legacy basis as unknown when editing and blocks the plan', () => {
    const workspace = existing(100000)
    const instance = workspace.baseline.assumptions.etf[0]
    delete instance.historicalCostBasisEUR
    const draft = draftFromInstance('etf', instance)
    expect(draft.fields.historicalCostBasisEUR.status).toBe('unknown')
    expect(draftToInstancePatch(draft).patch.historicalCostBasisEUR).toBeUndefined()
    expect(selectResultReadiness(workspace, runCombineSimulation(workspace, de2026Rules)).blocking)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'instance-tax-basis-unknown' })]))
  })
  it('round-trips explicit zero and loss-making historical basis through storage', () => {
    for (const basis of [0, 120000]) {
      const workspace = existing(basis)
      const loaded = parseWorkspaceJson(buildWorkspaceJson(workspace))!
      expect(loaded.baseline.assumptions.etf[0].historicalCostBasisEUR).toBe(basis)
      expect(selectResultReadiness(loaded, runCombineSimulation(loaded, de2026Rules)).blocking
        .some((reason) => reason.code === 'instance-tax-basis-unknown')).toBe(false)
    }
  })
  it.each(['active', 'paid_up'] as const)('uses paid-in premiums for %s insurance without reporting them as new contributions', (status) => {
    const workspace = existing(100000)
    const instance = workspace.baseline.assumptions.insurance[0]
    Object.assign(instance, { status, currentValueEUR: 100000, historicalCostBasisEUR: 100000,
      monthlyContribution: 0, fees: zeroFeeModel, payoutMode: 'kapitalverzehr', contractStartYear: 2020,
      capitalGuarantee: { enabled: false, floorPctOfContributions: 0 } })
    const result = simulatePortfolio(workspace, de2026Rules).perInstance[instance.instanceId][0]
    expect(result.totalContributionsBeforeFees).toBe(100000)
    expect(result.afterTaxLumpSum).toBe(100000)
    expect(result.totalUserCost).toBe(0)
  })
  it('does not require premium basis for Ertragsanteil or tax-free capital payouts', () => {
    const workspace = existing(100000)
    workspace.baseline.assumptions.etf = []
    const instance = workspace.baseline.assumptions.insurance[0]
    Object.assign(instance, { currentValueEUR: 100000, payoutMode: 'leibrente' })
    for (const mode of ['leibrente', 'kapitalverzehr']) {
      Object.assign(instance, { payoutMode: mode, contractStartYear: 2000, oldContractTaxFreeEligible: true })
      expect(selectResultReadiness(workspace, runCombineSimulation(workspace, de2026Rules)).blocking
        .some((reason) => reason.code === 'instance-tax-basis-unknown')).toBe(false)
    }
  })
})

it('credits known historical premiums before surrender proceeds become new target basis', () => {
  const workspace = existing(100000)
  const instance = workspace.baseline.assumptions.insurance[0]
  Object.assign(instance, { currentValueEUR: 100000, historicalCostBasisEUR: 100000,
    contractStartYear: 2020, payoutMode: 'kapitalverzehr' })
  expect(computeSurrenderTax(instance, 100000, workspace, de2026Rules, de2026Rules.year)).toBe(0)
  instance.historicalCostBasisEUR = 80000
  expect(computeSurrenderTax(instance, 100000, workspace, de2026Rules, de2026Rules.year)).toBeGreaterThan(0)
})

it('does not allocate a new-year allowance to historical Vorabpauschalen in a two-ETF portfolio', () => {
  const workspace = existing(80000, 5000)
  const first = workspace.baseline.assumptions.etf[0]
  workspace.baseline.assumptions.etf.push({ ...first, instanceId: 'etf-second', historicalVorabpauschaleEUR: 0 })
  const results = simulatePortfolio(workspace, de2026Rules).perInstance[first.instanceId]
  const result = results[0]
  expect(result.productId).toBe('etf')
  if (result.productId !== 'etf') throw new Error('Expected ETF')
  expect(result.initialVorabpauschale).toBe(5000)
  expect(calculateEtfAllowanceDemand(result, first.equityPartialExemption, 1, 20)[0]).toBe(0)
})
