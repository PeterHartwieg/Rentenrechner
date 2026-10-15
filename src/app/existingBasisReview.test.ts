import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { migrateV1ToV2 } from '../storage'
import { de2026Rules as rules } from '../rules/de2026'
import { zeroFeeModel } from '../engine/buildResult'
import { simulatePortfolio } from '../engine/portfolioAdapter'
import { runCombineSimulation } from './useCombineSimulation'
import { selectResultReadiness } from './resultReadiness'
import { generateContractDecisions } from './contractDecisions'
import { simulateContractDecision, createDecisionSimulationCache } from './optimiereVorsorge'
import type { TransferEvent } from '../domain/instances'

function fixture() {
  const w = migrateV1ToV2({ ...defaultProfile, age: 40, retirementAge: 41 }, defaultAssumptions as unknown as Record<string, unknown>)
  const a = w.baseline.assumptions
  a.bav = []; a.basisrente = []; a.altersvorsorgedepot = []; a.riester = []
  a.returnScenarios = [{ id: 'basis', label: 'Null', annualReturn: 0 }]
  Object.assign(a.insurance[0], { currentValueEUR: 100000, historicalCostBasisEUR: 80000,
    contractStartYear: 2020, monthlyContribution: 0, fees: zeroFeeModel, payoutMode: 'kapitalverzehr',
    capitalGuarantee: { enabled: false, floorPctOfContributions: 0 } })
  Object.assign(a.etf[0], { currentValueEUR: 0, monthlyContribution: 0, annualAssetFee: 0 })
  return w
}

describe('review: partial surrender basis conservation', () => {
  it.each([[50000], [25000, 25000], [12500, 37500]])('allocates basis once across withdrawals %j', (...amounts: number[]) => {
    const w = fixture(); const a = w.baseline.assumptions
    const source = a.insurance[0]; const target = a.etf[0]
    const events: TransferEvent[] = amounts.map((amountEUR) => ({ type: 'surrender_reinvest', year: rules.year,
      sourceInstanceId: source.instanceId, targetInstanceId: target.instanceId, amountEUR, surrenderHaircutPct: 0 }))
    source.transferEvents = events; target.transferEvents = events
    const p = simulatePortfolio(w, rules)
    expect(p.perInstance[source.instanceId][0].capitalAtRetirement).toBeCloseTo(50000, 8)
    expect(p.perInstance[source.instanceId][0].totalContributionsBeforeFees).toBeCloseTo(40000, 8)
    expect(p.perInstance[target.instanceId][0].capitalAtRetirement).toBeCloseTo(47362.5, 8)
    expect(p.perInstance[target.instanceId][0].totalContributionsBeforeFees).toBeCloseTo(47362.5, 8)
  })
})

it('keeps the annuity baseline available but blocks the applied surrender decision and cache', () => {
  const w = fixture(); w.baseline.profile.retirementAge = 67
  const a = w.baseline.assumptions; const source = a.insurance[0]
  source.payoutMode = 'leibrente'; delete source.historicalCostBasisEUR
  const bundle = runCombineSimulation(w, rules)
  expect(selectResultReadiness(w, bundle).canShowHouseholdTotal).toBe(true)
  const decision = generateContractDecisions(w, source.instanceId).find((d) => d.kind === 'uebertragen' && d.targetInstanceId === a.etf[0].instanceId)!
  const baseline = bundle.combinedByScenarioId.basis
  expect(simulateContractDecision(w, decision, rules, baseline, 'basis').deltaMonthlyNetEUR).toBeNull()
  const cache = createDecisionSimulationCache()
  expect(cache.get(w, decision, rules, baseline, 'basis').deltaMonthlyNetEUR).toBeNull()
  source.historicalCostBasisEUR = 80000
  expect(cache.get(w, decision, rules, baseline, 'basis').deltaMonthlyNetEUR).not.toBeNull()
})

it('blocks decision deltas for unrelated unknown inputs rather than substituting zero', () => {
  const w = fixture()
  w.baseline.assumptions.inputStatus = { 'profile.grossSalaryYear': 'unknown' }
  const bundle = runCombineSimulation(w, rules)
  const decision = generateContractDecisions(w, w.baseline.assumptions.insurance[0].instanceId)[0]
  const result = simulateContractDecision(w, decision, rules, bundle.combinedByScenarioId.basis, 'basis')
  expect(result.deltaMonthlyNetEUR).toBeNull()
  expect(result.unavailableReason).toMatch(/Bruttoeinkommen/)
})

it.each([50000, 100000])('disposes gross capital and basis once for %i while charging the haircut only to proceeds', (disposed) => {
  const w = fixture(); const a = w.baseline.assumptions
  const source = a.insurance[0]; const target = a.etf[0]
  const event: TransferEvent = { type: 'surrender_reinvest', year: rules.year,
    sourceInstanceId: source.instanceId, targetInstanceId: target.instanceId, amountEUR: disposed, surrenderHaircutPct: 0.1 }
  source.transferEvents = [event]; target.transferEvents = [event]
  const p = simulatePortfolio(w, rules)
  const remaining = p.perInstance[source.instanceId][0]
  const reinvested = p.perInstance[target.instanceId][0]
  expect(remaining.capitalAtRetirement).toBe(100000 - disposed)
  expect(remaining.totalContributionsBeforeFees).toBe(80000 * (1 - disposed / 100000))
  const haircut = disposed * 0.1
  const tax = (disposed * 0.9 - disposed * 0.8) * 0.26375
  expect(reinvested.capitalAtRetirement).toBe(disposed - haircut - tax)
  expect(remaining.capitalAtRetirement + reinvested.capitalAtRetirement + haircut + tax).toBe(100000)
  expect(reinvested.totalContributionsBeforeFees).toBe(reinvested.capitalAtRetirement)
  // Historical basis partitions into retained + disposed basis; gains step up
  // the reinvested target's basis only after tax, and the haircut leaves both.
  expect(remaining.totalContributionsBeforeFees + disposed * 0.8).toBe(80000)
})

it('marks future-dated insurance surrender unavailable instead of choosing a forecast for its tax basis', () => {
  const w = fixture(); const a = w.baseline.assumptions
  const event: TransferEvent = { type: 'surrender_reinvest', year: rules.year + 1,
    sourceInstanceId: a.insurance[0].instanceId, targetInstanceId: a.etf[0].instanceId, amountEUR: 50000, surrenderHaircutPct: 0 }
  a.insurance[0].transferEvents = [event]; a.etf[0].transferEvents = [event]
  const readiness = selectResultReadiness(w, runCombineSimulation(w, rules))
  expect(readiness.canShowHouseholdTotal).toBe(false)
  expect(readiness.blocking.some((reason) => reason.code === 'future-insurance-surrender-unsupported')).toBe(true)
})

it('preserves proportionate historical loss basis on a paid-up partial surrender', () => {
  const w = fixture(); const a = w.baseline.assumptions
  const source = a.insurance[0]; const target = a.etf[0]
  source.status = 'paid_up'; source.historicalCostBasisEUR = 120000
  const event: TransferEvent = { type: 'surrender_reinvest', year: rules.year,
    sourceInstanceId: source.instanceId, targetInstanceId: target.instanceId, amountEUR: 50000, surrenderHaircutPct: 0 }
  source.transferEvents = [event]; target.transferEvents = [event]
  const p = simulatePortfolio(w, rules)
  expect(p.perInstance[source.instanceId][0].totalContributionsBeforeFees).toBe(60000)
  expect(p.perInstance[target.instanceId][0].capitalAtRetirement).toBe(50000)
})

it.each(['source-only', 'target-only', 'mirrored'])('canonical transfer collection conserves current-year partial basis with %s events', (storage) => {
  const w = fixture(); const a = w.baseline.assumptions
  const source = a.insurance[0]; const target = a.etf[0]
  const event: TransferEvent = { type: 'surrender_reinvest', year: rules.year,
    sourceInstanceId: source.instanceId, targetInstanceId: target.instanceId, amountEUR: 50000, surrenderHaircutPct: 0 }
  source.transferEvents = storage === 'target-only' ? [] : [event]
  target.transferEvents = storage === 'source-only' ? [] : [structuredClone(event)]
  const p = simulatePortfolio(w, rules)
  expect(p.perInstance[source.instanceId][0].capitalAtRetirement).toBe(50000)
  expect(p.perInstance[source.instanceId][0].totalContributionsBeforeFees).toBe(40000)
  expect(p.perInstance[target.instanceId][0].capitalAtRetirement).toBe(47362.5)
})
