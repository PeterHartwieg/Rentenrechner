import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import type { EtfProductResult } from '../../domain'
import { de2026Rules } from '../../rules/de2026'
import { calculateCapitalGainsTax, calculateIncomeTax2026, calculateSolidarityTax } from '../tax'
import { projectAccumulation } from '../accumulation'
import { etfPayoutSchedule } from '../etfPayout'
import { computeGrossMonthlyPayout, monthlyPayoutFromCapital } from '../payoutMath'
import { simulateRetirementComparison } from '../simulate'

describe('German 2026 tax helper', () => {
  it('keeps income below the basic allowance tax-free', () => {
    expect(calculateIncomeTax2026(12_348, de2026Rules)).toBe(0)
  })

  it('calculates the 42 percent zone from the BMF 2026 formula', () => {
    expect(calculateIncomeTax2026(75_000, de2026Rules)).toBe(20_364)
  })

  it('uses the 2026 top tax zone from 277,826 EUR onward', () => {
    expect(calculateIncomeTax2026(277_825, de2026Rules)).toBe(105_550)
    expect(calculateIncomeTax2026(277_826, de2026Rules)).toBe(105_551)
    expect(calculateIncomeTax2026(277_827, de2026Rules)).toBe(105_551)
  })
})

describe('calculateSolidarityTax — Milderungszone', () => {
  const freeTax = de2026Rules.incomeTax.solidarityFreeTax // 20,350

  it('returns 0 at and below the solidarity-free threshold', () => {
    expect(calculateSolidarityTax(freeTax, de2026Rules)).toBe(0)
    expect(calculateSolidarityTax(10_000, de2026Rules)).toBe(0)
  })

  it('applies Milderungszone rate just above the threshold (much less than full 5.5%)', () => {
    // At incomeTax = freeTax + 1: transition = 1 × 0.119 = 0.119 << regular 20351 × 0.055 = 1119
    expect(calculateSolidarityTax(freeTax + 1, de2026Rules)).toBeCloseTo(0.119, 3)
  })

  it('Milderungszone rate is lower than 5.5% in the transition range', () => {
    // At it = 25,000: transition = 4650 × 0.119 = 553.35 < regular 1375
    const soli = calculateSolidarityTax(25_000, de2026Rules)
    expect(soli).toBeCloseTo(553.35, 0)
    expect(soli).toBeLessThan(25_000 * 0.055)
  })

  it('exits Milderungszone and applies full 5.5% above the crossover (~37,838)', () => {
    // Crossover: (it - freeTax) × 0.119 = it × 0.055 → it ≈ 37,838
    expect(calculateSolidarityTax(38_000, de2026Rules)).toBeCloseTo(38_000 * 0.055, 0)
    expect(calculateSolidarityTax(40_000, de2026Rules)).toBeCloseTo(40_000 * 0.055, 0)
  })
})

describe('calculateCapitalGainsTax — InvStG §20 partial exemptions', () => {
  const gain = 10_000
  const rules = de2026Rules
  // effective rate = 25% × (1 + 5.5% Soli) = 26.375%
  const effectiveRate = rules.capitalGains.taxRate * (1 + rules.capitalGains.solidarityRate)

  it('0% exemption (Anleihe-ETF / Sonstige): full gain taxed', () => {
    expect(calculateCapitalGainsTax(gain, rules, 0, 0)).toBeCloseTo(gain * effectiveRate, 0)
  })

  it('15% exemption (Mischfonds): 85% of gain taxed', () => {
    expect(calculateCapitalGainsTax(gain, rules, 0.15, 0)).toBeCloseTo(gain * 0.85 * effectiveRate, 0)
  })

  it('30% exemption (Aktienfonds): 70% of gain taxed', () => {
    expect(calculateCapitalGainsTax(gain, rules, 0.3, 0)).toBeCloseTo(gain * 0.7 * effectiveRate, 0)
  })

  it('60% exemption (inl. Immobilienfonds): 40% of gain taxed', () => {
    expect(calculateCapitalGainsTax(gain, rules, 0.6, 0)).toBeCloseTo(gain * 0.4 * effectiveRate, 0)
  })

  it('80% exemption (ausl. Immobilienfonds): 20% of gain taxed', () => {
    expect(calculateCapitalGainsTax(gain, rules, 0.8, 0)).toBeCloseTo(gain * 0.2 * effectiveRate, 0)
  })

  it('Sparerpauschbetrag fully covers tax when exempted gain < allowance', () => {
    // gain=1000, 30% exemption: taxable = 1000×0.7 = 700 < saverAllowance 1000 → no tax
    expect(calculateCapitalGainsTax(1_000, rules, 0.3, 1_000)).toBe(0)
  })

  it('Sparerpauschbetrag partially reduces tax', () => {
    // gain=5000, 30% exemption, allowance=1000: taxable = 5000×0.7 - 1000 = 2500
    expect(calculateCapitalGainsTax(5_000, rules, 0.3, 1_000)).toBeCloseTo(2_500 * effectiveRate, 0)
  })
})

describe('ETF rules — #31 Basiszins and #7/#36 Vorabpauschale', () => {
  it('de2026 basiszins is the official 2026 value of 3.20% (BMF-Schreiben 2026-01-13)', () => {
    expect(de2026Rules.capitalGains.basiszins).toBe(0.032)
  })

  it('ETF Vorabpauschale is non-zero in acquisition year due to prorated contributions (#36)', () => {
    // 24 months, 10k/month, 7% return, 30% partial exemption, 0 fees
    const result = projectAccumulation({
      productId: 'etf',
      currentAge: 30,
      months: 24,
      monthlyUserCost: 10_000,
      monthlyProductContribution: 10_000,
      monthlyEmployerContribution: 0,
      annualReturn: 0.07,
      inflationRate: 0.02,
      scenario: { id: 'basis', label: 'Basis', annualReturn: 0.07 },
      fees: { wrapperAssetFee: 0, fundAssetFee: 0, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, acquisitionCostSpreadYears: 1, pensionPayoutFeePct: 0 },
      policy: { vorabpauschale: { rules: de2026Rules, partialExemption: 0.3 } },
    })
    // Year 1: prorated contributions → VP > 0 (unlike old opening-balance-only formula)
    expect(result.rows[0].cumulativeVorabpauschale).toBeGreaterThan(0)
    // Year 2: opening balance adds to VP → cumulative is higher
    expect(result.rows[1].cumulativeVorabpauschale).toBeGreaterThan(result.rows[0].cumulativeVorabpauschale)
    expect(result.cumulativeVorabpauschale).toBe(result.rows[1].cumulativeVorabpauschale)
  })

  it('year-1 VP matches the proration formula: sum(contribution × (13-month)/12) × basiszins × 0.7', () => {
    // 12 equal monthly contributions of 1000, 0% return (so growth ≥ basisertrag is guaranteed
    // to be large enough only with positive return; use 10% to ensure cap is not binding)
    const c = 1_000
    const result = projectAccumulation({
      productId: 'etf',
      currentAge: 30,
      months: 12,
      monthlyUserCost: c,
      monthlyProductContribution: c,
      monthlyEmployerContribution: 0,
      annualReturn: 0.1,
      inflationRate: 0,
      scenario: { id: 'basis', label: 'Basis', annualReturn: 0.1 },
      fees: { wrapperAssetFee: 0, fundAssetFee: 0, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, acquisitionCostSpreadYears: 1, pensionPayoutFeePct: 0 },
      policy: { vorabpauschale: { rules: de2026Rules, partialExemption: 0 } },
    })
    // Expected prorated acquisition base: c × sum(12+11+...+1)/12 = c × 78/12 = c × 6.5
    const expectedBase = c * 78 / 12 // = 6500
    const expectedBasisertrag = expectedBase * de2026Rules.capitalGains.basiszins * 0.7
    // VP is capped at annualGrowth; with 10% return it should be well above basisertrag
    expect(result.rows[0].cumulativeVorabpauschale).toBeCloseTo(expectedBasisertrag, 1)
  })
})

describe('etfPayoutSchedule — negative, zero, and positive rates', () => {
  // Shared setup: 200k capital, 100k contributions, no Vorabpauschale, 20-year payout,
  // no partial exemption, no saver allowance to keep tax effects out of the depletion check.
  const pv = 200_000
  const contributions = 0 // all gain, but we just check depletion here
  const cumulativeVP = 0
  const n = 20
  const retirementAge = 67
  const noExemption = 0
  // use rules but set saverAllowance to 0 via a custom rules object to isolate PMT math
  const taxRules = { ...de2026Rules, capitalGains: { ...de2026Rules.capitalGains, saverAllowance: 0 } }

  it('r = 0: PMT equals PV/n per month and balance decays linearly to zero', () => {
    const r = 0
    const grossMonthly = monthlyPayoutFromCapital(pv, r, n)
    expect(grossMonthly).toBeCloseTo(pv / (n * 12), 4)

    const rows = etfPayoutSchedule(pv, contributions, cumulativeVP, grossMonthly, n, r, retirementAge, taxRules, noExemption)
    expect(rows).toHaveLength(n)

    // Linear decay: after k years, capitalAtEnd ≈ PV * (1 - k/n)
    for (let k = 1; k <= n; k++) {
      const expected = pv * (1 - k / n)
      expect(rows[k - 1].capitalAtEnd).toBeCloseTo(expected, 0)
    }

    // End balance is ~0
    expect(rows[n - 1].capitalAtEnd).toBeCloseTo(0, 1)
  })

  it('r = -0.01: PMT slightly below PV/n; balance reaches ~0 at end-age', () => {
    const r = -0.01
    const grossMonthly = monthlyPayoutFromCapital(pv, r, n)
    // With negative return, sustainable PMT is smaller than PV/(n*12)
    expect(grossMonthly).toBeLessThan(pv / (n * 12))

    const rows = etfPayoutSchedule(pv, contributions, cumulativeVP, grossMonthly, n, r, retirementAge, taxRules, noExemption)
    expect(rows).toHaveLength(n)

    // Balance must be ~0 at end
    expect(rows[n - 1].capitalAtEnd).toBeCloseTo(0, 0)
  })

  it('r = +0.04: PMT above PV/n; balance reaches ~0 at end-age (regression)', () => {
    const r = 0.04
    const grossMonthly = monthlyPayoutFromCapital(pv, r, n)
    // With positive return, sustainable PMT exceeds simple PV/(n*12)
    expect(grossMonthly).toBeGreaterThan(pv / (n * 12))

    const rows = etfPayoutSchedule(pv, contributions, cumulativeVP, grossMonthly, n, r, retirementAge, taxRules, noExemption)
    expect(rows).toHaveLength(n)

    // End balance ~0 (annuity formula guarantees depletion)
    expect(rows[n - 1].capitalAtEnd).toBeCloseTo(0, 0)
  })

  it('all three rates deplete to ~0 at the configured end-age', () => {
    for (const r of [0, -0.01, 0.04]) {
      const grossMonthly = monthlyPayoutFromCapital(pv, r, n)
      const rows = etfPayoutSchedule(pv, contributions, cumulativeVP, grossMonthly, n, r, retirementAge, taxRules, noExemption)
      expect(rows[n - 1].capitalAtEnd).toBeCloseTo(0, 0)
    }
  })
})

describe('#37 ETF payout schedule (etfPayoutSchedule)', () => {
  const capital = 400_000
  const contributions = 200_000
  const cumulativeVP = 5_000
  const payoutYears = 20
  const payoutReturn = 0.05
  const retirementAge = 67
  const partialExemption = 0.3 // Aktienfonds
  // Compute the correct PMT so capital depletes to ~0 in payoutYears
  const grossMonthly = monthlyPayoutFromCapital(capital, payoutReturn, payoutYears)

  it('year-1 net monthly payout matches constant-ratio approximation', () => {
    const rows = etfPayoutSchedule(
      capital, contributions, cumulativeVP, grossMonthly,
      payoutYears, payoutReturn, retirementAge, de2026Rules, partialExemption,
    )
    expect(rows).toHaveLength(payoutYears)
    // Year-1 gain ratio: (capital - contributions - VP) / capital = 195000/400000
    const gainRatio = (capital - contributions - cumulativeVP) / capital
    const taxableGain = grossMonthly * 12 * gainRatio
    const effectiveTaxRate = de2026Rules.capitalGains.taxRate * (1 + de2026Rules.capitalGains.solidarityRate)
    const expectedTax = Math.max(0, taxableGain * (1 - partialExemption) - de2026Rules.capitalGains.saverAllowance) * effectiveTaxRate
    const expectedNet = (grossMonthly * 12 - expectedTax) / 12
    expect(rows[0].netMonthlyPayout).toBeCloseTo(expectedNet, 2)
  })

  it('capital depletes to approximately zero over the payout period', () => {
    const rows = etfPayoutSchedule(
      capital, contributions, cumulativeVP, grossMonthly,
      payoutYears, payoutReturn, retirementAge, de2026Rules, partialExemption,
    )
    const finalCapital = rows[rows.length - 1].capitalAtEnd
    // Annuity formula guarantees depletion; allow small rounding residual (within 1 EUR)
    expect(Math.abs(finalCapital)).toBeLessThan(1)
  })

  it('Sparerpauschbetrag fully covers tax when gain is small', () => {
    // Very large cost basis means almost no gain → saverAllowance covers all of it
    const highBasisCapital = 100_000
    const highContributions = 99_500  // only 500 EUR gain → after 30% exemption: 350 EUR < 1000 EUR
    const rows = etfPayoutSchedule(
      highBasisCapital, highContributions, 0, 1_000,
      5, 0.04, 67, de2026Rules, 0.3,
    )
    expect(rows[0].taxDue).toBe(0)
    expect(rows[0].netMonthlyPayout).toBeCloseTo(1_000, 0)
  })

  it('simulate produces etfPayoutRows for ETF product', () => {
    const result = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const etfBasis = result.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis') as EtfProductResult | undefined
    expect(etfBasis?.etfPayoutRows).toBeDefined()
    expect(etfBasis?.etfPayoutRows?.length).toBeGreaterThan(0)
    // netMonthlyPayout is derived from year-1 of the schedule
    expect(etfBasis?.netMonthlyPayout).toBeCloseTo(etfBasis?.etfPayoutRows?.[0]?.netMonthlyPayout ?? 0, 2)
  })
})

describe('payoutMode (#54) — ETF drawdown', () => {
  it('simulate: ETF payout is unaffected by bAV/pAV payoutMode (always self-managed drawdown)', () => {
    const a = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const b = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, payoutMode: 'kapitalverzehr' },
        insurance: { ...defaultAssumptions.insurance, payoutMode: 'zeitrente', zeitrenteYears: 10 },
      },
      de2026Rules,
    )
    const aEtfBasis = a.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')!
    const bEtfBasis = b.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')!
    expect(aEtfBasis.grossMonthlyPayout).toBeCloseTo(bEtfBasis.grossMonthlyPayout, 6)
    expect(aEtfBasis.netMonthlyPayout).toBeCloseTo(bEtfBasis.netMonthlyPayout, 6)
  })
})

describe('#56 pension payout fee — ETF non-effect', () => {
  it('pensionPayoutFeePct does not affect ETF payout', () => {
    // ETF uses zeroFeeModel (pensionPayoutFeePct=0); adding a non-zero fee to bAV must not bleed into ETF
    const withBavFee = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, bav: { ...defaultAssumptions.bav, fees: { ...defaultAssumptions.bav.fees, pensionPayoutFeePct: 0.05 } } },
      de2026Rules,
    )
    const base = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const etfBase = base.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')!
    const etfWithFee = withBavFee.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')!
    // ETF gross payout is unchanged even when bAV pension fee is set
    expect(etfWithFee.grossMonthlyPayout).toBeCloseTo(etfBase.grossMonthlyPayout, 6)
  })
})

describe('#57 accumulationRiy — ETF', () => {
  it('accumulationRiy is near zero for ETF with only a small TER', () => {
    // Default ETF has annualAssetFee = 0.2% and no other fees → very small RIY
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const etf = sim.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')!
    // 0.2% TER → RIY should be close to 0.2%
    expect(etf.accumulationRiy).toBeCloseTo(0.002, 2)
  })
})

describe('payoutMode (#54) — computeGrossMonthlyPayout unit tests', () => {
  it('leibrente: gross monthly payout = capital / 10 000 × rentenfaktor (independent of payout horizon)', () => {
    const gross = computeGrossMonthlyPayout(300_000, {
      mode: 'leibrente',
      rentenfaktor: 30,
      zeitrenteYears: 20,
      kapitalverzehrYears: 23,
      payoutReturn: 0.04,
    })
    expect(gross).toBeCloseTo(900, 6) // 300_000 / 10_000 × 30
  })

  it('leibrente: changing kapitalverzehrYears does not change the payout (rentenfaktor only)', () => {
    const a = computeGrossMonthlyPayout(300_000, {
      mode: 'leibrente', rentenfaktor: 30, zeitrenteYears: 20, kapitalverzehrYears: 5, payoutReturn: 0.04,
    })
    const b = computeGrossMonthlyPayout(300_000, {
      mode: 'leibrente', rentenfaktor: 30, zeitrenteYears: 20, kapitalverzehrYears: 50, payoutReturn: 0.04,
    })
    expect(a).toBe(b)
  })

  it('zeitrente: uses zeitrenteYears, ignoring kapitalverzehrYears', () => {
    const gross = computeGrossMonthlyPayout(300_000, {
      mode: 'zeitrente', rentenfaktor: 30, zeitrenteYears: 15, kapitalverzehrYears: 23, payoutReturn: 0.04,
    })
    const expected = monthlyPayoutFromCapital(300_000, 0.04, 15)
    expect(gross).toBeCloseTo(expected, 6)
  })

  it('kapitalverzehr: matches the legacy depletion annuity over kapitalverzehrYears', () => {
    const gross = computeGrossMonthlyPayout(300_000, {
      mode: 'kapitalverzehr', rentenfaktor: 30, zeitrenteYears: 15, kapitalverzehrYears: 23, payoutReturn: 0.04,
    })
    const expected = monthlyPayoutFromCapital(300_000, 0.04, 23)
    expect(gross).toBeCloseTo(expected, 6)
  })

  it('zero/negative capital returns zero payout in any mode', () => {
    const cfg = { rentenfaktor: 30, zeitrenteYears: 15, kapitalverzehrYears: 23, payoutReturn: 0.04 }
    expect(computeGrossMonthlyPayout(0, { ...cfg, mode: 'leibrente' })).toBe(0)
    expect(computeGrossMonthlyPayout(-100, { ...cfg, mode: 'zeitrente' })).toBe(0)
    expect(computeGrossMonthlyPayout(0, { ...cfg, mode: 'kapitalverzehr' })).toBe(0)
  })
})
