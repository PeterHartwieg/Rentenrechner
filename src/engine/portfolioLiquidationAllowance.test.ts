import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { migrateV1ToV2 } from '../storage'
import { de2026Rules } from '../rules/de2026'
import { simulatePortfolio } from './portfolioAdapter'
import { calculateCapitalGainsTax } from './tax'
import { applyCrossInstanceSparerpauschbetrag } from './portfolioAllowance'
import type { EtfProductResult } from '../domain'

function run(contributions: number[], married = false, age = 66, rates = contributions.map(() => 0.05)) {
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    defaultAssumptions as unknown as Record<string, unknown>,
  )
  ws.baseline.profile = { ...ws.baseline.profile, age, retirementAge: 67 }
  if (married) ws.baseline.partner = { ...ws.baseline.profile }
  const base = ws.baseline.assumptions.etf[0]
  ws.baseline.assumptions.etf = contributions.map((monthlyContribution, i) => ({
    ...base, instanceId: `etf-${i}`, monthlyContribution, annualAssetFee: 0,
    currentValueEUR: 0, expectedReturn: rates[i],
  }))
  const { perInstance } = simulatePortfolio(ws, de2026Rules)
  const scenarioId = ws.baseline.assumptions.returnScenarios[0].id
  return contributions.map((_, i) => perInstance[`etf-${i}`].find(r => r.scenarioId === scenarioId)! as EtfProductResult)
}

function assertHouseholdLiquidation(results: EtfProductResult[], married: boolean) {
  const demands = results.map(r => Math.max(0, r.capitalAtRetirement - r.totalContributionsBeforeFees
    - (r.rows.at(-1)?.cumulativeVorabpauschale ?? 0)) * (1 - defaultAssumptions.etf.equityPartialExemption))
  const totalDemand = demands.reduce((a, b) => a + b, 0)
  const allowance = de2026Rules.capitalGains.saverAllowance * (married ? 2 : 1)
  results.forEach((r, i) => {
    const allocated = totalDemand <= allowance ? demands[i] : allowance * demands[i] / totalDemand
    const tax = calculateCapitalGainsTax(demands[i], de2026Rules, 0, allocated)
    expect(r.afterTaxLumpSum).toBeCloseTo(r.capitalAtRetirement - tax, 8)
    expect(r.valueMultipleOnUserCost).toBeCloseTo(r.afterTaxLumpSum / r.totalUserCost, 10)
    const years = r.rows.length
    expect(r.capitalMultipleAnnualized).toBeCloseTo(Math.pow(r.afterTaxLumpSum / r.totalUserCost, 1 / years) - 1, 10)
  })
}

describe('alternative household ETF liquidation allowance', () => {
  it('adding an empty account does not tax an otherwise tax-free liquidation', () => {
    const [single] = run([1000])
    const [withEmpty] = run([1000, 0])
    expect(withEmpty.capitalAtRetirement).toBeCloseTo(single.capitalAtRetirement, 8)
    expect(withEmpty.afterTaxLumpSum).toBeCloseTo(single.afterTaxLumpSum, 8)
    expect(withEmpty.afterTaxLumpSum).toBe(withEmpty.capitalAtRetirement)
  })

  it.each([1000, 10000])('partitioning a €%i contribution preserves total liquidation', contribution => {
    const [single] = run([contribution])
    const split = run([contribution / 4, contribution * 3 / 4])
    expect(split.reduce((sum, r) => sum + r.afterTaxLumpSum, 0)).toBeCloseTo(single.afterTaxLumpSum, 8)
  })

  it.each([false, true])('shares full household allowance for unequal gains (married=%s)', married => {
    const results = run([3000, 7000], married, 66, [0.02, 0.08])
    assertHouseholdLiquidation(results, married)
  })

  it('preserves opening VP credit when retirement starts without forecast rows', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    const base = ws.baseline.assumptions.etf[0]
    ws.baseline.assumptions.etf = [
      { ...base, instanceId: 'a' }, { ...base, instanceId: 'b' },
    ]
    const [template] = run([1000])
    const result: EtfProductResult = {
      ...template, rows: [], etfPayoutRows: [], capitalAtRetirement: 10000,
      totalContributionsBeforeFees: 5000, initialVorabpauschale: 5000,
    }
    const perInstance = { a: [result], b: [{ ...result }] }
    applyCrossInstanceSparerpauschbetrag({
      wsa: ws.baseline.assumptions, perInstance, rules: de2026Rules,
      profile: { ...ws.baseline.profile, age: 67, retirementAge: 67 },
      fullAllowance: de2026Rules.capitalGains.saverAllowance,
      resimulateEtfInstance: (_, scenario) => ({ ...result, scenarioId: scenario.id }),
    })
    expect(perInstance.a[0].afterTaxLumpSum).toBe(10000)
    expect(perInstance.b[0].afterTaxLumpSum).toBe(10000)
    expect(perInstance.a[0].capitalMultipleAnnualized).toBe(0)
  })

  it('computes exit demand from the final accumulation after sharing VP allowances', () => {
    assertHouseholdLiquidation(run([1000, 3000], false, 30), false)
  })
})
