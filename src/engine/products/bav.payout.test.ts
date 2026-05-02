import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import type { PersonalProfile } from '../../domain'
import {
  calculateBavFunding,
  calculatePkv257Subsidy,
  calculateSalaryResult,
  calculateVorsorgepauschale2026,
} from '../salary'
import { simulateRetirementComparison } from '../simulate'
import { calculateIncomeTax2026, calculateSolidarityTax } from '../tax'
import { afterTaxBavLumpSum, netBavPayout } from '../bavPayout'
import { monthlyPayoutFromCapital } from '../payoutMath'

describe('#35 children-adjusted retirement PV rate in netBavPayout', () => {
  it('childless rate (0 children) equals careRetirementChildlessRate by construction', () => {
    const threshold = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly
    const payout = threshold + 200  // annual = 4773 EUR < basicAllowance → tax = 0
    // defaultProfile has childBirthYears: [] → Kinderlosenzuschlag applies
    const childless = netBavPayout(payout, defaultProfile, de2026Rules)
    const derived =
      de2026Rules.socialSecurity.careEmployeeChildlessRate +
      de2026Rules.socialSecurity.careEmployerRate
    expect(derived).toBeCloseTo(de2026Rules.socialSecurity.careRetirementChildlessRate, 5)
    // KV/PV only (no income tax because annual < basicAllowance)
    const expected =
      payout -
      Math.max(0, payout - threshold) * (de2026Rules.socialSecurity.healthGeneralRate + defaultProfile.healthAdditionalContributionPct / 100) -
      payout * de2026Rules.socialSecurity.careRetirementChildlessRate
    expect(childless).toBeCloseTo(expected, 1)
  })

  it('2-child parent (both qualifying under 25 at retirementYear) pays lower PV than childless', () => {
    const payout = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly + 200
    // childBirthYears: [] → Kinderlosenzuschlag; retirementYear defaults to rules.year (2026)
    const childless = netBavPayout(payout, defaultProfile, de2026Rules)
    // Born 2005, 2008 → ages 21 and 18 in 2026 → both qualifying → 1.55 % rate → lower PV
    const twoChildren = netBavPayout(payout, { ...defaultProfile, childBirthYears: [2005, 2008] }, de2026Rules)
    expect(twoChildren).toBeGreaterThan(childless)
  })
})

describe('bAV funding model', () => {
  it('uses the actual employer social-security saving as cap for the minimum subsidy', () => {
    // 338 EUR/month = §3 Nr. 63 EStG cap — the historical baseline for this
    // assertion. Pinned explicitly so the assertion stays valid regardless of
    // what the global default is set to.
    const funding = calculateBavFunding(defaultProfile, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 338,
    })

    expect(funding.monthlyGrossConversion).toBe(338)
    expect(funding.monthlyStatutoryEmployerSubsidy).toBeGreaterThan(25)
    expect(funding.monthlyStatutoryEmployerSubsidy).toBeLessThan(55)
  })

  it('compares private products against the same net cost as bAV by default', () => {
    const result = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const basis = result.products.filter((product) => product.scenarioId === 'basis')
    const etf = basis.find((product) => product.productId === 'etf')
    const bav = basis.find((product) => product.productId === 'bav')

    expect(etf?.monthlyUserCost).toBeCloseTo(bav?.monthlyUserCost ?? 0, 2)
    expect(bav?.monthlyProductContribution).toBeGreaterThan(bav?.monthlyUserCost ?? 0)
  })

  it('bAV lump-sum after-tax is computed and less than gross capital', () => {
    const result = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const bav = result.products.find(
      (product) => product.productId === 'bav' && product.scenarioId === 'basis',
    )

    expect(bav?.afterTaxLumpSum).not.toBeNull()
    expect(bav?.afterTaxLumpSum).toBeGreaterThan(0)
    expect(bav?.afterTaxLumpSum).toBeLessThan(bav?.capitalAtRetirement ?? 0)
    expect(bav?.valueMultipleOnUserCost).not.toBeNull()
  })

  it('derives insurance tax modes: pre2005 tax-free, halbeinkuenfte half-income tax, abgeltungsteuer full Abgeltungsteuer', () => {
    // pre2005: lump sum == capital (no income tax on lump for §52 Abs. 28 EStG eligible).
    // Monthly: per #59, leibrente always uses Ertragsanteil even on pre-2005 contracts.
    // With GRV in the marginal-tax base, the small Ertragsanteil portion gets taxed
    // at the marginal rate, so net is slightly below gross.
    const pre2005 = simulateRetirementComparison(defaultProfile, {
      ...defaultAssumptions,
      insurance: { ...defaultAssumptions.insurance, contractStartYear: 1990, oldContractTaxFreeEligible: true },
    }, de2026Rules).products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')
    expect(pre2005?.afterTaxLumpSum).toBeCloseTo(pre2005?.capitalAtRetirement ?? 0)
    expect(pre2005?.netMonthlyPayout ?? 0).toBeLessThan(pre2005?.grossMonthlyPayout ?? 0)
    // The deduction is small — only the Ertragsanteil fraction × marginal rate.
    expect(pre2005?.netMonthlyPayout ?? 0).toBeGreaterThan(0.9 * (pre2005?.grossMonthlyPayout ?? 0))

    // halbeinkuenfte: with 3,000 EUR/month other income the half-gain sits in the 42% bracket
    // → marginalTax(other + halfGain) - marginalTax(other) > 0 → net < gross
    const halbein = simulateRetirementComparison(defaultProfile, {
      ...defaultAssumptions,
      insurance: {
        ...defaultAssumptions.insurance,
        contractStartYear: 2024,
        monthlyOtherRetirementIncome: 3_000,
      },
    }, de2026Rules).products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')
    expect(halbein?.afterTaxLumpSum ?? 0).toBeLessThan(halbein?.capitalAtRetirement ?? 0)
    expect(halbein?.netMonthlyPayout ?? 0).toBeLessThan(halbein?.grossMonthlyPayout ?? 0)

    // abgeltungsteuer: retirementAge 60 < 62 → full 25% Abgeltungsteuer on gain (lump sum).
    // For monthly payout: leibrente uses Ertragsanteil (#59) regardless of contract era.
    // kapitalverzehr mode keeps the gain-ratio path and shows net < gross on the monthly side.
    const abgelt = simulateRetirementComparison(
      { ...defaultProfile, retirementAge: 60 },
      {
        ...defaultAssumptions,
        insurance: {
          ...defaultAssumptions.insurance,
          contractStartYear: 2024,
          payoutMode: 'kapitalverzehr', // test gain-ratio path explicitly
          monthlyOtherRetirementIncome: 2_000, // push gain into taxable bracket
        },
      },
      de2026Rules,
    ).products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')
    expect(abgelt?.afterTaxLumpSum ?? 0).toBeLessThan(abgelt?.capitalAtRetirement ?? 0)
    expect(abgelt?.netMonthlyPayout ?? 0).toBeLessThan(abgelt?.grossMonthlyPayout ?? 0)
  })
})

describe('#6/#19 afterTaxBavLumpSum — §229 SGB V 1/120 + §34 EStG Fünftelregelung', () => {
  const threshold = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly // 197.75

  it('returns 0 for a zero lump sum', () => {
    expect(afterTaxBavLumpSum(0, defaultProfile, de2026Rules)).toBe(0)
  })

  it('below KVdR threshold × 120: no KV and no PV (only income tax via Fünftelregelung)', () => {
    // threshold × 120 = 197.75 × 120 = 23,730 EUR; monthlyBase = 23,730/120 = 197.75 = threshold (not strictly above)
    // With 0 other income and small lump sum below threshold×120: no KV, no PV
    const lumpSum = threshold * 120 // exactly at threshold
    // income tax: Fünftelregelung on 23,730 — with basicAllowance 12,348, annual lumpSum/5 = 4,746 < basicAllowance
    // → 5×(tax(4746)-tax(0)) = 5×0 = 0 income tax too
    const result = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, true)
    expect(result).toBeCloseTo(lumpSum, 0) // no deductions
  })

  it('above threshold × 120 (KVdR): KV on excess, PV on full amount, Fünftelregelung on income tax', () => {
    // lumpSum = 120,000 EUR; threshold×120 = 23,730 → KV excess = 96,270 EUR
    const lumpSum = 120_000
    const healthRate = de2026Rules.socialSecurity.healthGeneralRate + defaultProfile.healthAdditionalContributionPct / 100
    const expectedKv = Math.max(0, lumpSum - threshold * 120) * healthRate
    const pvRate = de2026Rules.socialSecurity.careRetirementChildlessRate
    const monthlyBase = lumpSum / 120 // 1000 EUR > 197.75
    const expectedPv = monthlyBase > threshold ? lumpSum * pvRate : 0
    // Income tax via Fünftelregelung with 0 other income; lumpSum/5 = 24,000 > basicAllowance 12,348
    const result = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, true)
    expect(result).toBeLessThan(lumpSum - expectedKv - expectedPv)
    expect(result).toBeGreaterThan(0)
  })

  it('freiwillig versichert: KV on full lump sum (no Freibetrag), higher deduction than KVdR', () => {
    const lumpSum = 100_000
    const kvdrResult = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, true)
    const freiwilligResult = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, false)
    expect(freiwilligResult).toBeLessThan(kvdrResult)
  })

  it('PKV member: no KV/PV deduction, only income tax', () => {
    const pkvProfile = { ...defaultProfile, publicHealthInsurance: false }
    const lumpSum = 100_000
    const gkvResult = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, true)
    const pkvResult = afterTaxBavLumpSum(lumpSum, pkvProfile, de2026Rules, 0, true)
    // PKV: same income tax but no KV/PV → higher net
    expect(pkvResult).toBeGreaterThan(gkvResult)
  })

  it('Fünftelregelung reduces income tax compared to simple marginal rate', () => {
    // With high other income (3,000/month = 36,000/year) and large lump sum, Fünftelregelung saves tax
    const lumpSum = 200_000
    const otherAnnual = 36_000
    const pkvProfile = { ...defaultProfile, publicHealthInsurance: false }
    const withFuenftel = afterTaxBavLumpSum(lumpSum, pkvProfile, de2026Rules, otherAnnual, true)
    // Without Fünftelregelung (simple marginal via tax function):
    const totalTax = (income: number) => {
      const it = calculateIncomeTax2026(income, de2026Rules)
      return it + calculateSolidarityTax(it, de2026Rules)
    }
    const simpleTax = totalTax(otherAnnual + lumpSum) - totalTax(otherAnnual)
    const simpleNet = lumpSum - simpleTax
    // Fünftelregelung net > simple marginal net (lower effective tax rate on the spike)
    expect(withFuenftel).toBeGreaterThan(simpleNet)
  })
})

describe('#56 pension payout fee — bAV Leibrente', () => {
  it('grossMonthlyPayout is reduced by pensionPayoutFeePct for bAV Leibrente', () => {
    const noFee = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const withFee = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, fees: { ...defaultAssumptions.bav.fees, pensionPayoutFeePct: 0.0175 } },
      },
      de2026Rules,
    )
    const bavNoFee = noFee.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    const bavFee = withFee.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    // Capital at retirement is unaffected by pension payout fee (accumulation only)
    expect(bavFee.capitalAtRetirement).toBeCloseTo(bavNoFee.capitalAtRetirement, 0)
    // grossMonthlyPayout with 1.75% fee ≈ no-fee × (1 - 0.0175)
    expect(bavFee.grossMonthlyPayout).toBeCloseTo(bavNoFee.grossMonthlyPayout * (1 - 0.0175), 2)
    // Net payout is lower after fee
    expect(bavFee.netMonthlyPayout).toBeLessThan(bavNoFee.netMonthlyPayout)
  })
})

describe('#57 accumulationRiy — bAV', () => {
  it('accumulationRiy is positive when fees > 0', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const bav = sim.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    // Default bAV has contribution fee 3%, asset fee 0.5%, acquisition cost 2.5% → RIY > 0
    expect(bav.accumulationRiy).toBeGreaterThan(0)
  })

  it('accumulationRiy is lower for zero-fee product vs. high-fee product', () => {
    const zeroFeeAssumptions = {
      ...defaultAssumptions,
      bav: {
        ...defaultAssumptions.bav,
        fees: {
          wrapperAssetFee: 0,
          fundAssetFee: 0,
          contributionFee: 0,
          fixedMonthlyFee: 0,
          acquisitionCostPct: 0,
          acquisitionCostSpreadYears: 5,
          pensionPayoutFeePct: 0,
        },
      },
    }
    const highFeeAssumptions = {
      ...defaultAssumptions,
      bav: {
        ...defaultAssumptions.bav,
        fees: {
          wrapperAssetFee: 0.007,
          fundAssetFee: 0.002,
          contributionFee: 0.0975,
          fixedMonthlyFee: 0,
          acquisitionCostPct: 0.025,
          acquisitionCostSpreadYears: 5,
          pensionPayoutFeePct: 0.0175,
        },
      },
    }
    const simZero = simulateRetirementComparison(defaultProfile, zeroFeeAssumptions, de2026Rules)
    const simHigh = simulateRetirementComparison(defaultProfile, highFeeAssumptions, de2026Rules)
    const bavZero = simZero.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    const bavHigh = simHigh.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    // RIY with zero fees: the closed-form FV and the accumulation loop may differ by floating-point epsilon
    expect(bavZero.accumulationRiy).toBeCloseTo(0, 10)
    expect(bavHigh.accumulationRiy).toBeGreaterThan(bavZero.accumulationRiy)
    // Hochkosten RIY should be well above 1.5 pp
    expect(bavHigh.accumulationRiy).toBeGreaterThan(0.015)
  })
})

describe('#50 PKV premium modeling', () => {
  const pkvBase: PersonalProfile = {
    ...defaultProfile,
    publicHealthInsurance: false,
    pkvMonthlyPremium: 0,
    pPVMonthlyPremium: 0,
  }
  const pkv500: PersonalProfile = {
    ...pkvBase,
    pkvMonthlyPremium: 500,
    pPVMonthlyPremium: 50,
  }

  it('calculatePkv257Subsidy: half the premium, capped at GKV employer equivalent', () => {
    // monthlyGross = 75000/12 = 6250; healthAndCareCapMonth = 5812.50
    // maxSubsidy = (0.146/2 + 0.018) * 5812.50 = (0.073 + 0.018) * 5812.50 = 0.091 * 5812.50 = 528.9375
    // halfPremium = (500 + 50) / 2 = 275 → subsidy = min(275, 528.94) = 275
    const subsidy = calculatePkv257Subsidy(75_000 / 12, 500, 50, de2026Rules)
    expect(subsidy).toBeCloseTo(275, 1)
  })

  it('calculatePkv257Subsidy: capped when premium exceeds GKV employer equivalent', () => {
    // Very high PKV premium: halfPremium = (2000 + 200) / 2 = 1100 > maxSubsidy (528.94)
    // Expected: subsidy = maxSubsidy ≈ 528.94
    const subsidy = calculatePkv257Subsidy(75_000 / 12, 2_000, 200, de2026Rules)
    const monthlyBase = de2026Rules.socialSecurity.healthAndCareCapMonth // 5812.50
    const maxSubsidy = (de2026Rules.socialSecurity.healthGeneralRate / 2 + de2026Rules.socialSecurity.careEmployerRate) * monthlyBase
    expect(subsidy).toBeCloseTo(maxSubsidy, 2)
  })

  it('PKV with zero premiums: salary result identical to GKV=false baseline (no KV/PV social, no premium deduction)', () => {
    const gkvFalseNoPrems = calculateSalaryResult(pkvBase, de2026Rules)
    // Social contributions: no health, no care (as before)
    expect(gkvFalseNoPrems.social.health).toBe(0)
    expect(gkvFalseNoPrems.social.care).toBe(0)
    // PKV cost fields are zero
    expect(gkvFalseNoPrems.pkv257SubsidyMonthly).toBe(0)
    expect(gkvFalseNoPrems.pkvNetMonthlyCost).toBe(0)
  })

  it('PKV with 500 + 50 EUR/month: annualNet decreases by net PKV cost (premium minus §257 subsidy)', () => {
    const noPrems = calculateSalaryResult(pkvBase, de2026Rules)
    const withPrems = calculateSalaryResult(pkv500, de2026Rules)
    // §257 subsidy = 275 EUR/month → net PKV cost = 550 - 275 = 275 EUR/month = 3300/year
    // Income tax LOWER for withPrems (higher Vorsorgepauschale via PKV KV/PV Teilbetrag)
    expect(withPrems.incomeTax).toBeLessThan(noPrems.incomeTax)
    // annualNet is lower by net PKV cost minus tax saving
    expect(withPrems.annualNet).toBeLessThan(noPrems.annualNet)
    const expectedNetCost = (500 + 50 - 275) * 12 // 3300
    expect(noPrems.annualNet - withPrems.annualNet).toBeGreaterThan(0)
    // The difference should be close to expectedNetCost minus the income-tax saving
    const taxSaving = noPrems.incomeTax - withPrems.incomeTax
    expect(noPrems.annualNet - withPrems.annualNet).toBeCloseTo(expectedNetCost - taxSaving, 0)
  })

  it('Vorsorgepauschale for PKV includes employee-paid PKV + pPV premiums after §257 subsidy', () => {
    const vpNoPrems = calculateVorsorgepauschale2026(75_000, pkvBase, de2026Rules)
    const vpWithPrems = calculateVorsorgepauschale2026(75_000, pkv500, de2026Rules)
    // With 500+50 = 550/month and §257 subsidy = 275/month, the employee-paid
    // amount is 3,300/year. AV Teilbetrag (975) drops to 0 since KV/PV exceeds
    // the 1,900 EUR cap. Net change = +3,300 - 975 = +2,325.
    expect(vpWithPrems).toBeGreaterThan(vpNoPrems)
    expect(vpWithPrems - vpNoPrems).toBeCloseTo(2_325, 0)
  })

  it('PKV salary result exposes correct pkv257SubsidyMonthly and pkvNetMonthlyCost', () => {
    const r = calculateSalaryResult(pkv500, de2026Rules)
    expect(r.pkv257SubsidyMonthly).toBeCloseTo(275, 1)
    expect(r.pkvNetMonthlyCost).toBeCloseTo(275, 1) // 550 - 275 = 275
  })

  it('GKV salary result always has zero PKV fields regardless of premium fields', () => {
    const gkvProfile = { ...defaultProfile }
    const r = calculateSalaryResult(gkvProfile, de2026Rules)
    expect(r.pkv257SubsidyMonthly).toBe(0)
    expect(r.pkvNetMonthlyCost).toBe(0)
  })

  it('bAV funding net cost differs slightly with PKV premiums (AV Teilbetrag no longer varies with bAV)', () => {
    // Pin to 338 EUR/month brutto (the §3 Nr. 63 cap) — the calibrated baseline
    // for the absolute-value assertions below. Independent of the global default.
    const bav338 = { ...defaultAssumptions.bav, monthlyGrossConversion: 338 }
    const bavFundingNoPkv = calculateBavFunding(pkvBase, de2026Rules, bav338)
    const bavFundingPkv = calculateBavFunding(pkv500, de2026Rules, bav338)
    // PKV: no KV/PV social savings from bAV conversion → higher net cost than GKV (~165/month).
    // With high PKV premiums the AV Teilbetrag in Vorsorgepauschale is already capped at 0,
    // so it no longer varies with bAV conversion → pkv500 has slightly higher net cost than pkvBase.
    expect(bavFundingNoPkv.monthlyNetCost).toBeCloseTo(185, 0)
    expect(bavFundingPkv.monthlyNetCost).toBeGreaterThan(bavFundingNoPkv.monthlyNetCost)
    expect(Math.abs(bavFundingPkv.monthlyNetCost - bavFundingNoPkv.monthlyNetCost)).toBeLessThan(10)
  })
})

describe('payoutMode (#54) — bAV', () => {
  it('simulate: bAV in leibrente mode → gross = capital × rentenfaktor / 10 000 (insensitive to retirementEndAge)', () => {
    const a = simulateRetirementComparison(defaultProfile, { ...defaultAssumptions, retirementEndAge: 80 }, de2026Rules)
    const b = simulateRetirementComparison(defaultProfile, { ...defaultAssumptions, retirementEndAge: 100 }, de2026Rules)
    const aBavBasis = a.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    const bBavBasis = b.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    // Same capital (accumulation phase identical) and same rentenfaktor → identical gross monthly payout.
    expect(aBavBasis.grossMonthlyPayout).toBeCloseTo(bBavBasis.grossMonthlyPayout, 6)
    // Sanity: matches the formula directly.
    expect(aBavBasis.grossMonthlyPayout).toBeCloseTo(
      (aBavBasis.capitalAtRetirement / 10_000) * defaultAssumptions.bav.rentenfaktor,
      6,
    )
  })

  it('simulate: bAV in kapitalverzehr mode → gross matches monthlyPayoutFromCapital over end-age horizon', () => {
    const sim = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, payoutMode: 'kapitalverzehr' },
      },
      de2026Rules,
    )
    const bavBasis = sim.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    const payoutYears = defaultAssumptions.retirementEndAge - defaultProfile.retirementAge
    const payoutReturn = bavBasis.annualReturn - (defaultAssumptions.bav.fees.wrapperAssetFee + defaultAssumptions.bav.fees.fundAssetFee)
    const expected = monthlyPayoutFromCapital(bavBasis.capitalAtRetirement, payoutReturn, payoutYears)
    expect(bavBasis.grossMonthlyPayout).toBeCloseTo(expected, 6)
  })
})
