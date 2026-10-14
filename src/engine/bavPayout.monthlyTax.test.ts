import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import type { BavDurchfuehrungsweg, PayoutMode } from '../domain'
import { de2026Rules } from '../rules/de2026'
import { classifyBavMonthlyIncome, netBavPayoutFull } from './bavPayout'
import { calculateRetirementTax } from './retirementTax'
import { retirementIncomeBase } from './retirementPayout'

describe('bAV monthly tax classification', () => {
  it('funded Direktversicherung does not receive the §19 allowance', () => {
    const profile = { ...defaultProfile, publicHealthInsurance: false }
    const base = retirementIncomeBase(2027, { grvBaselineMonthly: 2000 })
    const baseline = calculateRetirementTax(base, de2026Rules).totalTaxAnnual
    const expected = calculateRetirementTax({ ...base, otherTaxableAnnual: 12000 }, de2026Rules).totalTaxAnnual
    expect(expected).toBe(4828)
    const actual = netBavPayoutFull(1000, profile, de2026Rules, 0, true, 2027, 2000)
    expect(actual.netMonthly).toBeCloseTo(1000 - (expected - baseline) / 12, 10)
  })
})


const ways: BavDurchfuehrungsweg[] = [
  'direktversicherung_3_63', 'pensionskasse_3_63', 'pensionsfonds_3_63',
  'direktversicherung_40b_alt', 'direktzusage', 'unterstuetzungskasse',
]
const modes: PayoutMode[] = ['leibrente', 'zeitrente', 'kapitalverzehr']

describe.each(ways)('%s monthly payout routing', (durchfuehrungsweg) => {
  it.each(modes)('%s uses the statutory tax base and preserves gross KV/PV', (payoutMode) => {
    const bav = { ...defaultAssumptions.bav, durchfuehrungsweg, payoutMode, pre2005EligibleTaxFree: false }
    const taxContext = { bav, capital: 100000, totalContributions: 60000 }
    const isEmployer = durchfuehrungsweg === 'direktzusage' || durchfuehrungsweg === 'unterstuetzungskasse'
    const isOld = durchfuehrungsweg === 'direktversicherung_40b_alt'
    // Age 67: statutory Ertragsanteil 17%; nonlife proportional gain is 40%.
    const taxable = 12000 * (isOld ? payoutMode === 'leibrente' ? 0.17 : 0.4 : 1)
    const profile = { ...defaultProfile, retirementAge: 67 }
    const base = retirementIncomeBase(2027, { grvBaselineMonthly: 2000 })
    const expectedTax = calculateRetirementTax({
      ...base, bavPensionAnnual: isEmployer ? taxable : 0,
      otherTaxableAnnual: isEmployer ? 0 : taxable,
    }, de2026Rules).totalTaxAnnual - calculateRetirementTax(base, de2026Rules).totalTaxAnnual
    const result = netBavPayoutFull(1000, profile, de2026Rules, 0, true, 2027, 2000, taxContext)
    expect(result.netMonthly + result.kvPvMonthly + expectedTax / 12).toBeCloseTo(1000, 10)
    const fundedKv = netBavPayoutFull(1000, profile, de2026Rules, 0, true, 2027, 2000).kvPvMonthly
    expect(result.kvPvMonthly).toBe(fundedKv)
  })
})

it('§40b eligibility applies only to nonlife payments and losses cannot create taxable gains', () => {
  const input = { grossMonthlyPayout: 1000, retirementAge: 67, capital: 100000, totalContributions: 60000,
    bav: { ...defaultAssumptions.bav, durchfuehrungsweg: 'direktversicherung_40b_alt' as const, pre2005EligibleTaxFree: true } }
  expect(classifyBavMonthlyIncome({ ...input, bav: { ...input.bav, payoutMode: 'leibrente' } }).taxableAnnual).toBeCloseTo(2040, 10)
  expect(classifyBavMonthlyIncome({ ...input, bav: { ...input.bav, payoutMode: 'kapitalverzehr' } }).taxableAnnual).toBe(0)
  expect(classifyBavMonthlyIncome({ ...input, totalContributions: 120000,
    bav: { ...input.bav, payoutMode: 'zeitrente', pre2005EligibleTaxFree: false } }).taxableAnnual).toBe(0)
})
