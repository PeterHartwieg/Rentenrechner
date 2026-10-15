import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { migrateV1ToV2 } from '../storage'
import { de2026Rules as rules } from '../rules/de2026'
import { zeroFeeModel } from '../engine/buildResult'
import { afterTaxInvestmentCapital } from '../engine/etfPayout'
import { runCombineSimulation } from '../app/useCombineSimulation'
import { deriveCombinePerInstanceTaxModes } from '../app/combineCsvWiring'
import { selectResultReadiness, householdTotalBlockedLabels } from '../app/resultReadiness'
import { runRules } from '../app/recommendations'
import { buildCombinePortfolioCsv } from './csvExport'
import type { TransferEvent } from '../domain/instances'

function fixture() {
  const w = migrateV1ToV2({ ...defaultProfile, age: 66, retirementAge: 68 }, defaultAssumptions as unknown as Record<string, unknown>)
  const a = w.baseline.assumptions
  a.bav = []; a.basisrente = []; a.altersvorsorgedepot = []; a.riester = []
  a.inflationRate = 0
  a.returnScenarios = [{ id: 'basis', label: 'Null', annualReturn: 0 }]
  Object.assign(a.etf[0], { currentValueEUR: 100000, historicalCostBasisEUR: 100000, historicalVorabpauschaleEUR: 0,
    monthlyContribution: 0, annualAssetFee: 0, status: 'paid_up' })
  Object.assign(a.insurance[0], { currentValueEUR: 100000, historicalCostBasisEUR: 100000, monthlyContribution: 0,
    fees: zeroFeeModel, status: 'paid_up', contractStartYear: 2020, payoutMode: 'kapitalverzehr',
    capitalGuarantee: { enabled: false, floorPctOfContributions: 0 } })
  return w
}
function exportRows(w: ReturnType<typeof fixture>) {
  const bundle = runCombineSimulation(w, rules)
  const a = w.baseline.assumptions
  const readiness = selectResultReadiness(w, bundle)
  const csv = buildCombinePortfolioCsv({ assumptions: a, ...bundle, scenarioLabels: { basis: 'Null' }, rules,
    profile: w.baseline.profile, jointFiling: w.baseline.partner !== undefined,
    householdTotalBlocked: readiness.canShowHouseholdTotal ? undefined : { reasonLabels: householdTotalBlockedLabels(readiness) },
    perInstanceTaxModes: deriveCombinePerInstanceTaxModes(a, w.baseline.profile) })
  const section = csv.split('Jahres-Cashflows je Instanz\n')[1].split('\n\n')[0].split('\n').slice(1)
  return { csv, bundle, rows: section.filter(Boolean).map((line) => line.split(',')) }
}
function numeric(value: string) { return Number(value.replace(',', '.')) }

describe('historical basis in public outputs', () => {
  it('CSV does not tax paid-up historical ETF or insurance principal', () => {
    const w = fixture()
    const { rows, bundle } = exportRows(w)
    expect(rows).toHaveLength(4)
    for (const id of [w.baseline.assumptions.etf[0].instanceId, w.baseline.assumptions.insurance[0].instanceId]) {
      expect(bundle.perInstance[id][0].afterTaxLumpSum).toBe(100000)
      for (const row of rows.filter((r) => r[0] === id)) expect(numeric(row[10])).toBe(100000)
    }
  })
  it('CSV uses each year’s depleted source basis and reinvested target basis, not final basis', () => {
    const w = fixture(); const a = w.baseline.assumptions
    const source = a.insurance[0]; const target = a.etf[0]
    source.historicalCostBasisEUR = 80000
    Object.assign(target, { currentValueEUR: 0, historicalCostBasisEUR: 0, monthlyContribution: 100,
      expectedReturn: 0.1, status: 'active' })
    const event: TransferEvent = { type: 'surrender_reinvest', year: rules.year, sourceInstanceId: source.instanceId,
      targetInstanceId: target.instanceId, amountEUR: 50000, surrenderHaircutPct: 0 }
    source.transferEvents = [event]; target.transferEvents = [event]
    const { rows, bundle } = exportRows(w)
    const targetRows = rows.filter((r) => r[0] === target.instanceId)
    const credit = 47362.5
    bundle.perInstance[target.instanceId][0].rows.forEach((row, index) => {
      const yearBasis = credit + (index + 1) * 1200
      const expected = afterTaxInvestmentCapital(row.balance, yearBasis, rules, target.equityPartialExemption, row.cumulativeVorabpauschale)
      expect(numeric(targetRows[index][10])).toBeCloseTo(expected, 1)
    })
    for (const row of rows.filter((r) => r[0] === source.instanceId)) expect(numeric(row[10])).toBe(47362.5)
  })
  it.each([0, 0.05])('recommendation uses current taxable VP at return %s with historical credit and future payout rows', (annualReturn) => {
    const w = fixture(); w.baseline.profile.age = 40; w.baseline.profile.retirementAge = 67
    const a = w.baseline.assumptions; a.insurance = []
    Object.assign(a.etf[0], { currentValueEUR: 10000, historicalCostBasisEUR: 10000, historicalVorabpauschaleEUR: 5000 })
    a.returnScenarios[0].annualReturn = annualReturn
    const bundle = runCombineSimulation(w, rules)
    const result = bundle.perInstance[a.etf[0].instanceId][0]
    expect(result.productId).toBe('etf')
    if (result.productId !== 'etf') throw new Error('Expected ETF')
    expect(result.etfPayoutRows.length).toBeGreaterThan(0)
    const atom = runRules({ workspace: w, simulationResult: { products: [result] },
      combinedResult: bundle.combinedByScenarioId.basis }).find((entry) => entry.id === 'sparerpauschbetrag_remaining')!
    const currentDemand = (result.rows[0].cumulativeVorabpauschale - 5000) * (1 - a.etf[0].equityPartialExemption)
    expect(atom.context.usedAnnual).toBeCloseTo(currentDemand, 8)
    expect(atom.context.remainingAnnual).toBeCloseTo(rules.capitalGains.saverAllowance - currentDemand, 8)
  })
})

it.each([false, true])('real CSV liquidation allowance is invariant to identical ETF splitting (joint=%s)', (joint) => {
  const whole = fixture(); whole.baseline.assumptions.insurance = []
  whole.baseline.assumptions.etf[0].historicalCostBasisEUR = 50000
  if (joint) whole.baseline.partner = { ...defaultProfile }
  const split = structuredClone(whole)
  const first = split.baseline.assumptions.etf[0]
  first.currentValueEUR = 50000; first.historicalCostBasisEUR = 25000
  split.baseline.assumptions.etf.push({ ...first, instanceId: 'etf-second' })
  const wholeRows = exportRows(whole).rows
  const splitRows = exportRows(split).rows
  expect(wholeRows).toHaveLength(2); expect(splitRows).toHaveLength(4)
  const allowance = rules.capitalGains.saverAllowance * (joint ? 2 : 1)
  const expected = afterTaxInvestmentCapital(100000, 50000, rules,
    whole.baseline.assumptions.etf[0].equityPartialExemption, 0, allowance)
  for (const age of [67, 68]) {
    const wholeNet = wholeRows.filter((row) => numeric(row[3]) === age).reduce((sum, row) => sum + numeric(row[10]), 0)
    const splitNet = splitRows.filter((row) => numeric(row[3]) === age).reduce((sum, row) => sum + numeric(row[10]), 0)
    expect(wholeNet).toBeCloseTo(expected, 1)
    expect(splitNet).toBeCloseTo(wholeNet, 1)
  }
})

it('recommendation sums current taxable VP across a joint household with distinct ETF exemptions', () => {
  const w = fixture(); w.baseline.profile.age = 40; w.baseline.profile.retirementAge = 67
  w.baseline.partner = { ...defaultProfile }
  const a = w.baseline.assumptions; a.insurance = []
  Object.assign(a.etf[0], { currentValueEUR: 10000, historicalCostBasisEUR: 10000, historicalVorabpauschaleEUR: 5000 })
  a.etf.push({ ...a.etf[0], instanceId: 'etf-second', currentValueEUR: 20000, historicalCostBasisEUR: 20000, equityPartialExemption: 0.2 })
  a.returnScenarios[0].annualReturn = 0.05
  const bundle = runCombineSimulation(w, rules)
  const products = Object.values(bundle.perInstance).flat()
  const expected = a.etf.reduce((sum, instance) => {
    const result = bundle.perInstance[instance.instanceId][0]
    return sum + (result.rows[0].cumulativeVorabpauschale - 5000) * (1 - instance.equityPartialExemption)
  }, 0)
  const atom = runRules({ workspace: w, simulationResult: { products }, combinedResult: bundle.combinedByScenarioId.basis })
    .find((entry) => entry.id === 'sparerpauschbetrag_remaining')!
  expect(atom.context.usedAnnual).toBeCloseTo(expected, 8)
  expect(atom.context.remainingAnnual).toBeCloseTo(rules.capitalGains.saverAllowance * 2 - expected, 8)
})

it('real CSV keeps unknown-basis yearly net capital and payout tax/net values blank', () => {
  const w = fixture(); const a = w.baseline.assumptions
  a.insurance = []; delete a.etf[0].historicalCostBasisEUR
  const { csv, rows } = exportRows(w)
  expect(rows).toHaveLength(2)
  for (const row of rows) {
    expect(numeric(row[9])).toBe(100000)
    expect(row[10]).toBe('')
    expect(row[12]).toBe('')
  }
  const payout = csv.split('Rentenphase (ETF-Entnahme) je ETF-Instanz\n')[1].split('\n').slice(1).filter(Boolean)
  expect(payout.length).toBeGreaterThan(0)
  for (const line of payout) {
    const cells = line.split(',')
    for (const index of [6, 7, 8, 9]) expect(cells[index]).toBe('')
  }
})

it.each(['absent', 'explicit-unknown'])('annuity monthly income remains available but CSV capital tax is unavailable for %s premiums', (state) => {
  const w = fixture(); const a = w.baseline.assumptions
  a.etf = []
  const instance = a.insurance[0]
  instance.payoutMode = 'leibrente'
  if (state === 'absent') delete instance.historicalCostBasisEUR
  else instance.inputStatus = { historicalCostBasisEUR: 'unknown' }
  const bundle = runCombineSimulation(w, rules)
  expect(selectResultReadiness(w, bundle).canShowHouseholdTotal).toBe(true)
  const csv = buildCombinePortfolioCsv({ assumptions: a, ...bundle, scenarioLabels: { basis: 'Null' }, rules,
    profile: w.baseline.profile, perInstanceTaxModes: deriveCombinePerInstanceTaxModes(a, w.baseline.profile) })
  const rows = csv.split('Jahres-Cashflows je Instanz\n')[1].split('\n\n')[0].split('\n').slice(1).filter(Boolean)
  expect(rows).toHaveLength(2)
  for (const line of rows) expect(line.split(',')[10]).toBe('')
})

it.each(['explicit-zero', 'new-zero', 'tax-free-old', 'restored'])('capital tax remains available for %s without inventing basis', (state) => {
  const w = fixture(); const a = w.baseline.assumptions
  a.etf = []
  const instance = a.insurance[0]
  instance.payoutMode = 'leibrente'
  if (state === 'explicit-zero') {
    instance.historicalCostBasisEUR = 0
    instance.inputStatus = { historicalCostBasisEUR: 'entered' }
  } else if (state === 'new-zero') {
    instance.currentValueEUR = 0; delete instance.historicalCostBasisEUR
  } else if (state === 'tax-free-old') {
    instance.contractStartYear = 2000; instance.oldContractTaxFreeEligible = true
    delete instance.historicalCostBasisEUR
  } else instance.inputStatus = { historicalCostBasisEUR: 'entered' }
  const { rows } = exportRows(w)
  expect(rows).toHaveLength(2)
  for (const row of rows) expect(row[10]).not.toBe('')
  if (state === 'tax-free-old' || state === 'restored') for (const row of rows) expect(numeric(row[10])).toBe(100000)
})

it('CSV capital readiness still applies without the optional profile when tax mode is supplied', () => {
  const w = fixture(); const a = w.baseline.assumptions
  a.etf = []; a.insurance[0].payoutMode = 'leibrente'; delete a.insurance[0].historicalCostBasisEUR
  const bundle = runCombineSimulation(w, rules)
  const csv = buildCombinePortfolioCsv({ assumptions: a, ...bundle, scenarioLabels: { basis: 'Null' }, rules,
    perInstanceTaxModes: deriveCombinePerInstanceTaxModes(a, w.baseline.profile) })
  const rows = csv.split('Jahres-Cashflows je Instanz\n')[1].split('\n\n')[0].split('\n').slice(1).filter(Boolean)
  expect(rows).toHaveLength(2)
  for (const row of rows) expect(row.split(',')[10]).toBe('')
})
