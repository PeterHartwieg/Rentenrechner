import { describe, expect, it } from 'vitest'
import { de2026Rules } from '../rules/de2026'
import { etfPayoutSchedule } from './etfPayout'
import { monthlyPayoutFromCapital, monthlyRate } from './payoutMath'

const schedule = (capital: number, basis: number, rate: number, years: number, vp = 0) =>
  etfPayoutSchedule(capital, basis, vp, monthlyPayoutFromCapital(capital, rate, years), years, rate, 67, de2026Rules, 0, () => 0)

describe('ETF monthly average-cost withdrawal accounting', () => {
  it('realizes gains earned during the final payout year even with no opening gain', () => {
    const [row] = schedule(100_000, 100_000, 0.05, 1)
    expect(row.grossAnnualPayout).toBeCloseTo(102_667.91934793719, 6)
    expect(row.taxableGain).toBeCloseTo(row.grossAnnualPayout - 100_000, 6)
    expect(row.remainingCostBasis).toBeCloseTo(0, 6)
    expect(row.capitalAtEnd).toBeCloseTo(0, 6)
  })

  it.each([-0.05, 0, 0.05])('conserves cash, basis and realized gains over multiple years at %s return', (rate) => {
    const capital = 100_000
    const initialBasis = 50_000 + 2_000
    const rows = schedule(capital, 50_000, rate, 5, 2_000)
    const pmt = monthlyPayoutFromCapital(capital, rate, 5)
    const rm = monthlyRate(rate)
    let balance = capital
    let growth = 0
    let totalWithdrawal = 0
    let totalGain = 0
    let previousBasis = initialBasis
    for (const row of rows) {
      for (let month = 0; month < 12; month++) {
        growth += balance * rm
        balance = balance * (1 + rm) - pmt
      }
      expect(row.capitalAtEnd).toBeCloseTo(Math.max(0, balance), 6)
      const disposedBasis = previousBasis - row.remainingCostBasis
      // This fixture stays above basis even with negative returns, so all realized gains are positive.
      expect(row.taxableGain + disposedBasis).toBeCloseTo(row.grossAnnualPayout, 6)
      expect(row.netAnnualPayout + row.taxDue).toBeCloseTo(row.grossAnnualPayout, 8)
      previousBasis = row.remainingCostBasis
      totalWithdrawal += row.grossAnnualPayout
      totalGain += row.taxableGain
    }
    expect(totalWithdrawal + rows.at(-1)!.capitalAtEnd).toBeCloseTo(capital + growth, 6)
    expect(totalGain).toBeCloseTo(totalWithdrawal - initialBasis, 6)
    expect(rows.at(-1)!.remainingCostBasis).toBeCloseTo(0, 6)
  })

  it('preserves unrealized losses until price recovery, rather than clamping basis to capital', () => {
    const rows = etfPayoutSchedule(100_000, 120_000, 0, 1_000, 5, 0.05, 67, de2026Rules, 0, () => 0)
    expect(rows[0].taxableGain).toBe(0)
    expect(rows[0].remainingCostBasis).toBeGreaterThan(rows[0].capitalAtEnd)
    expect(rows[2].taxableGain).toBe(0)
    expect(rows[4].taxableGain).toBeGreaterThan(0)
    const equivalent = etfPayoutSchedule(100_000, 100_000, 20_000, 1_000, 5, 0.05, 67, de2026Rules, 0, () => 0)
    expect(equivalent).toEqual(rows)
  })

  it('nets monthly losses against later gains when the portfolio recovers within a payout year', () => {
    const capital = 100_000
    const rate = 0.12
    const basis = capital * Math.pow(1 + rate, 0.5)
    const [row] = etfPayoutSchedule(capital, basis, 0, 1_000, 1, rate, 67, de2026Rules, 0, () => 0)
    const sharesSold = Array.from({ length: 12 }, (_, month) =>
      1_000 / Math.pow(1 + rate, (month + 1) / 12),
    ).reduce((sum, shares) => sum + shares, 0)
    const realizedGain = 12_000 - sharesSold * basis / capital
    expect(row.taxableGain).toBeCloseTo(Math.max(0, realizedGain), 8)
    expect(row.remainingCostBasis).toBeCloseTo(basis - sharesSold * basis / capital, 8)
  })

  it('uses the annual allowance once after aggregating monthly gains and partial exemption', () => {
    const calls: number[] = []
    const rows = etfPayoutSchedule(100_000, 0, 0, 1_000, 2, 0.05, 67, de2026Rules, 0.3, (year) => {
      calls.push(year)
      return 500
    })
    expect(calls).toEqual([0, 1])
    for (const row of rows) {
      expect(row.saverAllowanceUsed).toBe(500)
      expect(row.taxDue).toBeCloseTo((row.taxableGain * 0.7 - 500) * de2026Rules.capitalGains.taxRate * (1 + de2026Rules.capitalGains.solidarityRate), 8)
    }
    expect(etfPayoutSchedule(100_000, 0, 0, 1_000, 1, 0, 67, de2026Rules, 0)[0].saverAllowanceUsed).toBe(de2026Rules.capitalGains.saverAllowance)
  })

  it('never pays more cash than remains when the requested payout exhausts capital early', () => {
    const rows = etfPayoutSchedule(100, 50, 0, 80, 2, 0, 67, de2026Rules, 0)
    expect(rows[0].grossAnnualPayout).toBe(100)
    expect(rows[0].taxableGain).toBe(50)
    expect(rows[0].remainingCostBasis).toBe(0)
    expect(rows[1].grossAnnualPayout).toBe(0)
  })
})
