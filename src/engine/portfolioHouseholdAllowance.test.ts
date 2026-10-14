import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { migrateV1ToV2 } from '../storage'
import { de2026Rules } from '../rules/de2026'
import { simulatePortfolio } from './portfolioAdapter'
import type { EtfInstance } from '../domain/instances'
import type { EtfProductResult } from '../domain/results'
import { afterTaxInvestmentCapital } from './etfPayout'

function run(joint: boolean, extras: EtfInstance['status'][] = [], paidUp = false) {
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    defaultAssumptions as unknown as Record<string, unknown>,
  )
  ws.baseline.partner = joint ? { ...defaultProfile } : undefined
  const etf = { ...ws.baseline.assumptions.etf[0], instanceId: 'funded', monthlyContribution: 800,
    status: paidUp ? 'paid_up' as const : 'active' as const,
    currentValueEUR: paidUp ? 150000 : undefined }
  ws.baseline.assumptions.etf = [etf, ...extras.map((status, i) => ({
    ...etf, instanceId: `extra-${i}`, monthlyContribution: 0, currentValueEUR: 0, status,
  }))]
  const result = simulatePortfolio(ws, de2026Rules).perInstance.funded[0] as EtfProductResult
  return { result, etf, ws }
}

describe('ETF household allowance independent of account count', () => {
  it.each([false, true])('empty active accounts preserve accumulation and payouts (joint=%s)', joint => {
    const solo = run(joint).result
    const withEmpty = run(joint, ['active']).result
    expect(solo.capitalAtRetirement).toBeCloseTo(withEmpty.capitalAtRetirement, 8)
    expect(solo.netMonthlyPayout).toBeCloseTo(withEmpty.netMonthlyPayout, 8)
    expect(solo.etfPayoutRows).toEqual(withEmpty.etfPayoutRows)
  })

  it.each([false, true])('single account liquidation gets the full household allowance (joint=%s)', joint => {
    const { result, etf } = run(joint)
    const expected = afterTaxInvestmentCapital(result.capitalAtRetirement,
      result.totalProductContributions, de2026Rules, etf.equityPartialExemption,
      result.rows.at(-1)!.cumulativeVorabpauschale,
      de2026Rules.capitalGains.saverAllowance * (joint ? 2 : 1))
    expect(result.afterTaxLumpSum).toBeCloseTo(expected, 8)
  })

  it('joint filing improves single-account accumulation and recurring payouts', () => {
    const single = run(false).result
    const joint = run(true).result
    expect(joint.capitalAtRetirement).toBeGreaterThan(single.capitalAtRetirement)
    expect(joint.netMonthlyPayout).toBeGreaterThan(single.netMonthlyPayout)
  })

  it.each([false, true])('excluded accounts preserve the household result (joint=%s)', joint => {
    expect(run(joint, ['surrendered', 'offered']).result).toEqual(run(joint).result)
  })

  it('paid-up funded account retains the joint allowance without contributions', () => {
    const solo = run(true, [], true).result
    const withEmpty = run(true, ['paid_up'], true).result
    expect(solo.monthlyUserCost).toBe(0)
    expect(solo.capitalAtRetirement).toBeCloseTo(withEmpty.capitalAtRetirement, 8)
    expect(solo.netMonthlyPayout).toBeCloseTo(withEmpty.netMonthlyPayout, 8)
  })
})
