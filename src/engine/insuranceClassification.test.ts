/**
 * Shared private-insurance MONTHLY income classification (#379).
 *
 * `classifyInsuranceMonthlyIncome` (insurancePayout.ts) is the single owner of
 * the effective tax mode + annual taxable amount of a monthly pAV payout. It is
 * consumed by BOTH calculation modes:
 *
 *   - compare mode: `netInsurancePayout` / `netInsurancePayoutFull`
 *   - combine mode: `portfolioCombine` per-instance private-insurance lines
 *
 * Coverage map:
 *   1. Helper classification — Ertragsanteil override across eras, gain-ratio
 *      method with loss floor, pre-2005 tax-free capital payout.
 *   2. Legacy equivalence — `netInsurancePayout` / `netInsurancePayoutFull`
 *      outputs are bit-identical to the pre-consolidation inline math
 *      (replicated verbatim below as an independent oracle) across a grid of
 *      tax modes × payout modes × capital/basis relations × retiree profiles.
 *   3. Compare vs combine parity — single-instance byte-identity through the
 *      real simulators for capital-payout vintages; mixed-portfolio aggregation
 *      matches independently-built expected components; transferred principal
 *      and loss-floor invariants.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { ertragsanteilByAge } from '../rules/legalConstants'
import { migrateV1ToV2 } from '../storage'
import {
  classifyInsuranceMonthlyIncome,
  netInsurancePayout,
  netInsurancePayoutFull,
} from './insurancePayout'
import {
  calculateMarginalRetirementTax,
  calculateMonthlyRetirementPayout,
  retirementIncomeBase,
} from './retirementPayout'
import { calculateRetirementTax } from './retirementTax'
import { combinePortfolio, type CombineContext } from './portfolioCombine'
import { simulateRetirementComparison } from './simulate'
import { simulatePortfolio } from './portfolioAdapter'
import { calculateBavFunding } from './salary'
import type { InsuranceInstance } from '../domain/instances'
import type {
  GermanRules,
  InsuranceTaxMode,
  PayoutMode,
  PersonalProfile,
  ProductResult,
  RetirementTaxBreakdown,
} from '../domain'
import type { Workspace } from '../domain/workspace'

const RULES: GermanRules = de2026Rules
const RETIREMENT_YEAR = RULES.year + (defaultProfile.retirementAge - defaultProfile.age)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Profile variants for the retiree KV/PV branches. */
const PROFILES: { key: string; profile: PersonalProfile | undefined; kvdrMember: boolean }[] = [
  { key: 'no-profile', profile: undefined, kvdrMember: true },
  { key: 'kvdr-gkv', profile: { ...defaultProfile, publicHealthInsurance: true }, kvdrMember: true },
  { key: 'freiwillig-gkv', profile: { ...defaultProfile, publicHealthInsurance: true }, kvdrMember: false },
  { key: 'pkv', profile: { ...defaultProfile, publicHealthInsurance: false }, kvdrMember: true },
]

/**
 * Pre-consolidation inline classification, replicated verbatim from the
 * `netInsurancePayout` / `netInsurancePayoutFull` bodies before #379 (and from
 * the combine-mode helpers modulo the pre-2005 zeroing). Kept as an
 * independently written oracle: the shared classifier and every consumer must
 * reproduce its effects exactly.
 */
function legacyClassify(
  grossMonthlyPayout: number,
  capital: number,
  totalContributions: number,
  taxMode: InsuranceTaxMode,
  payoutMode?: PayoutMode,
  retirementAge?: number,
): { effectiveTaxMode: InsuranceTaxMode; annualGain: number } {
  let effectiveTaxMode: InsuranceTaxMode = taxMode
  let annualGain: number
  if (payoutMode === 'leibrente' && retirementAge !== undefined) {
    annualGain = grossMonthlyPayout * 12 * ertragsanteilByAge(retirementAge)
    effectiveTaxMode = 'ertragsanteil'
  } else {
    const gainRatio = capital > 0 ? Math.max(0, capital - totalContributions) / capital : 0
    annualGain = grossMonthlyPayout * 12 * gainRatio
  }
  return { effectiveTaxMode, annualGain }
}

/** Pre-consolidation `netInsurancePayoutFull` body, verbatim. */
function legacyNetInsurancePayoutFull(
  grossMonthlyPayout: number,
  capital: number,
  totalContributions: number,
  taxMode: InsuranceTaxMode,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  retirementYear = rules.year,
  profile?: PersonalProfile,
  kvdrMember = true,
  payoutMode?: PayoutMode,
  retirementAge?: number,
  grvBaselineMonthly = 0,
): { netMonthly: number; kvPvMonthly: number } {
  const { effectiveTaxMode, annualGain } = legacyClassify(
    grossMonthlyPayout,
    capital,
    totalContributions,
    taxMode,
    payoutMode,
    retirementAge,
  )

  if (effectiveTaxMode === 'pre2005' && (!profile?.publicHealthInsurance || kvdrMember || !profile)) {
    return { netMonthly: grossMonthlyPayout, kvPvMonthly: 0 }
  }

  if (!profile) {
    const marginalTax = calculateMarginalRetirementTax(
      rules,
      retirementIncomeBase(retirementYear, {
        grvBaselineMonthly,
        otherTaxableAnnual: otherMonthlyIncome * 12,
        privateInsuranceTaxMode: effectiveTaxMode,
      }),
      { privateInsuranceTaxableAnnual: annualGain },
    )
    return { netMonthly: Math.max(0, grossMonthlyPayout - marginalTax / 12), kvPvMonthly: 0 }
  }

  const kvPvChannel = profile.publicHealthInsurance && !kvdrMember ? 'freiwillig_other' : 'none'
  const r = calculateMonthlyRetirementPayout({
    rules,
    retirementYear,
    grvBaselineMonthly,
    otherMonthlyIncome,
    grossMonthlyPayout,
    taxableAnnualOverride: annualGain,
    taxChannel: 'private_insurance',
    privateInsuranceTaxMode: effectiveTaxMode,
    kvPvChannel,
    profile,
    healthStatus: kvdrMember ? 'kvdr' : 'freiwillig_gkv',
  })
  return { netMonthly: r.netMonthly, kvPvMonthly: r.kvPvMonthly }
}

interface PayoutCase {
  contractTaxMode: InsuranceTaxMode
  payoutMode: PayoutMode | undefined
  retirementAge: number | undefined
  grossMonthlyPayout: number
  capital: number
  totalContributions: number
}

function payoutCaseGrid(): PayoutCase[] {
  const cases: PayoutCase[] = []
  for (const contractTaxMode of ['pre2005', 'halbeinkuenfte', 'abgeltungsteuer'] as const) {
    for (const payoutMode of ['leibrente', 'kapitalverzehr', 'zeitrente', undefined] as const) {
      for (const retirementAge of [62, 67, undefined]) {
        // Gain, zero gain, loss (floor), and zero-capital shapes.
        for (const [capital, totalContributions] of [
          [200_000, 120_000],
          [100_000, 100_000],
          [80_000, 130_000],
          [0, 0],
        ] as const) {
          cases.push({
            contractTaxMode,
            payoutMode,
            retirementAge,
            grossMonthlyPayout: 1_500,
            capital,
            totalContributions,
          })
        }
      }
    }
  }
  return cases
}

function makeInsuranceWorkspace(insuranceInstances: InsuranceInstance[], bavMonthly = 0): Workspace {
  const v1 = {
    ...defaultAssumptions,
    bav: { ...defaultAssumptions.bav, monthlyGrossConversion: bavMonthly },
  }
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  ws.baseline.assumptions.etf = []
  ws.baseline.assumptions.insurance = insuranceInstances
  ws.baseline.assumptions.visibleProducts = ['versicherung']
  return ws
}

function makeCombineContext(
  grvGrossMonthlyPension: number,
  overrides: Partial<CombineContext> = {},
): CombineContext {
  return {
    profile: defaultProfile,
    rules: RULES,
    retirementYear: RETIREMENT_YEAR,
    grvGrossMonthlyPension,
    statutoryPensionTaxChannel: grvGrossMonthlyPension > 0 ? 'statutory_pension' : 'none',
    statutoryPensionKvChannel: grvGrossMonthlyPension > 0 ? 'kvdr_half_rate' : 'none',
    retirementHealthStatus: 'kvdr',
    filingStatus: 'single',
    ...overrides,
  }
}

/** Minimal synthetic per-instance pAV ProductResult (accumulation irrelevant here). */
function makeInsuranceResult(input: {
  instanceId: string
  grossMonthlyPayout: number
  capitalAtRetirement: number
  totalProductContributions: number
  totalContributionsBeforeFees: number
}): ProductResult {
  return {
    productId: 'versicherung',
    label: 'Private Rentenversicherung',
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    instanceId: input.instanceId,
    annualReturn: 0.05,
    monthlyUserCost: 200,
    monthlyProductContribution: 200,
    monthlyEmployerContribution: 0,
    totalUserCost: input.totalProductContributions,
    totalProductContributions: input.totalProductContributions,
    totalContributionsBeforeFees: input.totalContributionsBeforeFees,
    totalEmployerContributions: 0,
    totalFees: 0,
    capitalAtRetirement: input.capitalAtRetirement,
    realCapitalAtRetirement: input.capitalAtRetirement,
    afterTaxLumpSum: input.capitalAtRetirement,
    grossMonthlyPayout: input.grossMonthlyPayout,
    netMonthlyPayout: input.grossMonthlyPayout * 0.8,
    taxAndSvSavings: 0,
    valueMultipleOnUserCost: null,
    capitalMultipleAnnualized: 0,
    accumulationRiy: 0,
    rows: [],
  } as unknown as ProductResult
}

function makeInsuranceInstance(input: {
  instanceId: string
  contractStartYear: number
  oldContractTaxFreeEligible: boolean
  payoutMode: PayoutMode
}): InsuranceInstance {
  return {
    ...defaultAssumptions.insurance,
    instanceId: input.instanceId,
    contractStartYear: input.contractStartYear,
    oldContractTaxFreeEligible: input.oldContractTaxFreeEligible,
    payoutMode: input.payoutMode,
  } as InsuranceInstance
}

function expectTaxBreakdownsEqual(
  actual: RetirementTaxBreakdown,
  expected: RetirementTaxBreakdown,
): void {
  expect(actual.statutoryPensionTaxable).toBe(expected.statutoryPensionTaxable)
  expect(actual.bavPensionTaxable).toBe(expected.bavPensionTaxable)
  expect(actual.privateInsuranceTaxable).toBe(expected.privateInsuranceTaxable)
  expect(actual.otherTaxable).toBe(expected.otherTaxable)
  expect(actual.werbungskostenVersorgung).toBe(expected.werbungskostenVersorgung)
  expect(actual.werbungskostenRenten).toBe(expected.werbungskostenRenten)
  expect(actual.sonderausgaben).toBe(expected.sonderausgaben)
  expect(actual.zuVersteuerndesEinkommen).toBe(expected.zuVersteuerndesEinkommen)
  expect(actual.einkommensteuer).toBe(expected.einkommensteuer)
  expect(actual.solidaritaetszuschlag).toBe(expected.solidaritaetszuschlag)
  expect(actual.abgeltungsteuerOnPrivateInsurance).toBe(expected.abgeltungsteuerOnPrivateInsurance)
  expect(actual.totalTaxAnnual).toBe(expected.totalTaxAnnual)
  expect(actual.netRetirementIncomeAnnual).toBe(expected.netRetirementIncomeAnnual)
}

// ---------------------------------------------------------------------------
// 1. Helper classification
// ---------------------------------------------------------------------------

describe('classifyInsuranceMonthlyIncome — §22 Ertragsanteil override (#59)', () => {
  it('leibrente overrides every contract era with the age-based Ertragsanteil', () => {
    for (const contractTaxMode of ['pre2005', 'halbeinkuenfte', 'abgeltungsteuer'] as const) {
      const c = classifyInsuranceMonthlyIncome({
        grossMonthlyPayout: 1_000,
        capital: 400_000,
        totalContributions: 100_000,
        contractTaxMode,
        payoutMode: 'leibrente',
        retirementAge: 67,
      })
      expect(c.effectiveTaxMode).toBe('ertragsanteil')
      // 17 % Ertragsanteil at 67 — regardless of the capital-payout vintage.
      expect(c.taxableAnnual).toBe(1_000 * 12 * ertragsanteilByAge(67))
    }
  })

  it('leibrente without a retirement age falls back to the contract-mode gain ratio', () => {
    const c = classifyInsuranceMonthlyIncome({
      grossMonthlyPayout: 1_000,
      capital: 400_000,
      totalContributions: 100_000,
      contractTaxMode: 'halbeinkuenfte',
      payoutMode: 'leibrente',
      retirementAge: undefined,
    })
    expect(c.effectiveTaxMode).toBe('halbeinkuenfte')
    expect(c.taxableAnnual).toBe(1_000 * 12 * 0.75)
  })
})

describe('classifyInsuranceMonthlyIncome — capital-payout gain ratio', () => {
  it('gain, zero gain, loss floor, and zero capital', () => {
    const base = {
      contractTaxMode: 'halbeinkuenfte' as const,
      payoutMode: 'kapitalverzehr' as const,
      retirementAge: 67,
    }
    // Real gain: gross × 12 × gain ratio.
    expect(
      classifyInsuranceMonthlyIncome({
        ...base,
        grossMonthlyPayout: 2_000,
        capital: 400_000,
        totalContributions: 250_000,
      }).taxableAnnual,
    ).toBe(2_000 * 12 * 0.375)
    // Zero real gain.
    expect(
      classifyInsuranceMonthlyIncome({
        ...base,
        grossMonthlyPayout: 2_000,
        capital: 300_000,
        totalContributions: 300_000,
      }).taxableAnnual,
    ).toBe(0)
    // Loss (capital < cost basis) floors at zero gain — never negative.
    expect(
      classifyInsuranceMonthlyIncome({
        ...base,
        grossMonthlyPayout: 2_000,
        capital: 100_000,
        totalContributions: 300_000,
      }).taxableAnnual,
    ).toBe(0)
    // Zero capital → gain ratio 0.
    expect(
      classifyInsuranceMonthlyIncome({
        ...base,
        grossMonthlyPayout: 2_000,
        capital: 0,
        totalContributions: 0,
      }).taxableAnnual,
    ).toBe(0)
  })

  it('transferred principal raises the cost basis and shrinks the taxable gain', () => {
    // 250k regular contributions + 100k injected transfer principal.
    const withTransfer = classifyInsuranceMonthlyIncome({
      ...{
        contractTaxMode: 'halbeinkuenfte' as const,
        payoutMode: 'kapitalverzehr' as const,
        retirementAge: 67,
      },
      grossMonthlyPayout: 1_200,
      capital: 400_000,
      totalContributions: 350_000,
    })
    expect(withTransfer.taxableAnnual).toBe(1_200 * 12 * (50_000 / 400_000))
  })

  it('pre-2005 capital payout is classified tax-free (nothing enters either base)', () => {
    const c = classifyInsuranceMonthlyIncome({
      grossMonthlyPayout: 1_000,
      capital: 400_000,
      totalContributions: 100_000,
      contractTaxMode: 'pre2005',
      payoutMode: 'kapitalverzehr',
      retirementAge: 67,
    })
    expect(c.effectiveTaxMode).toBe('pre2005')
    expect(c.taxableAnnual).toBe(0)
  })

  it('matches the legacy classification exactly for every non-pre-2005 case in the grid', () => {
    for (const tc of payoutCaseGrid()) {
      const legacy = legacyClassify(
        tc.grossMonthlyPayout,
        tc.capital,
        tc.totalContributions,
        tc.contractTaxMode,
        tc.payoutMode,
        tc.retirementAge,
      )
      const c = classifyInsuranceMonthlyIncome({
        grossMonthlyPayout: tc.grossMonthlyPayout,
        capital: tc.capital,
        totalContributions: tc.totalContributions,
        contractTaxMode: tc.contractTaxMode,
        payoutMode: tc.payoutMode,
        retirementAge: tc.retirementAge,
      })
      if (legacy.effectiveTaxMode === 'pre2005') {
        // Documented zeroing: the legacy inline amount was gain-ratio-based but
        // never read (pre-2005 short-circuits before the amount is used). The
        // classifier states the truthful taxable amount: 0. (Leibrente on a
        // pre-2005 contract overrides to 'ertragsanteil' — handled below.)
        expect(c.effectiveTaxMode, JSON.stringify(tc)).toBe('pre2005')
        expect(c.taxableAnnual, JSON.stringify(tc)).toBe(0)
      } else {
        expect(c.effectiveTaxMode, JSON.stringify(tc)).toBe(legacy.effectiveTaxMode)
        expect(c.taxableAnnual, JSON.stringify(tc)).toBe(legacy.annualGain)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Legacy equivalence — netInsurancePayout / netInsurancePayoutFull
// ---------------------------------------------------------------------------

describe('netInsurancePayout / netInsurancePayoutFull — legacy-equivalence grid (#379)', () => {
  it('monthly nets and KV/PV are bit-identical to the pre-consolidation math', () => {
    let cases = 0
    for (const tc of payoutCaseGrid()) {
      for (const { key, profile, kvdrMember } of PROFILES) {
        for (const grvBaselineMonthly of [0, 1_200]) {
          for (const otherMonthlyIncome of [0, 400]) {
            const args = [
              tc.grossMonthlyPayout,
              tc.capital,
              tc.totalContributions,
              tc.contractTaxMode,
              RULES,
              otherMonthlyIncome,
              RETIREMENT_YEAR,
              profile,
              kvdrMember,
              tc.payoutMode,
              tc.retirementAge,
              grvBaselineMonthly,
            ] as const

            const expected = legacyNetInsurancePayoutFull(...args)
            expect(netInsurancePayoutFull(...args), `${key} ${JSON.stringify(tc)}`).toEqual(expected)
            expect(netInsurancePayout(...args), `${key} ${JSON.stringify(tc)}`).toBe(expected.netMonthly)
            cases++
          }
        }
      }
    }
    // Grid ran meaningfully: 144 classification shapes × 4 profiles × 2 × 2.
    expect(cases).toBe(2304)
  })

  it('pre-2005 + KVdR/PKV payouts stay fully pass-through (gross = net)', () => {
    expect(
      netInsurancePayout(
        1_000, 400_000, 100_000, 'pre2005', RULES, 0, RETIREMENT_YEAR,
        { ...defaultProfile, publicHealthInsurance: true }, true, 'kapitalverzehr', 67,
      ),
    ).toBe(1_000)
    expect(
      netInsurancePayout(
        1_000, 400_000, 100_000, 'pre2005', RULES, 0, RETIREMENT_YEAR,
        { ...defaultProfile, publicHealthInsurance: false }, true, 'kapitalverzehr', 67,
      ),
    ).toBe(1_000)
  })

  it('pre-2005 + freiwillig versichert keeps the §240 SGB V KV/PV burden with zero income tax', () => {
    const full = netInsurancePayoutFull(
      1_000, 400_000, 100_000, 'pre2005', RULES, 0, RETIREMENT_YEAR,
      { ...defaultProfile, publicHealthInsurance: true }, false, 'kapitalverzehr', 67,
    )
    // Tax-free payout, but freiwillig GKV still owes KV/PV.
    expect(full.netMonthly).toBeLessThan(1_000)
    expect(full.kvPvMonthly).toBeGreaterThan(0)
    // And it matches the legacy math exactly.
    expect(full).toEqual(
      legacyNetInsurancePayoutFull(
        1_000, 400_000, 100_000, 'pre2005', RULES, 0, RETIREMENT_YEAR,
        { ...defaultProfile, publicHealthInsurance: true }, false, 'kapitalverzehr', 67,
      ),
    )
  })

  it('leibrente on a pre-2005 contract pays Ertragsanteil, not the tax-free capital route', () => {
    const gross = 3_000
    const otherMonthly = 1_500 // pushes the Ertragsanteil base above the Grundfreibetrag
    const leibrente = netInsurancePayout(
      gross, 400_000, 100_000, 'pre2005', RULES, otherMonthly, RETIREMENT_YEAR,
      { ...defaultProfile, publicHealthInsurance: true }, true, 'leibrente', 67,
    )
    const capitalRoute = netInsurancePayout(
      gross, 400_000, 100_000, 'pre2005', RULES, otherMonthly, RETIREMENT_YEAR,
      { ...defaultProfile, publicHealthInsurance: true }, true, 'kapitalverzehr', 67,
    )
    // Ertragsanteil produces a taxable base; the capital route is fully tax-free.
    expect(leibrente).toBeLessThan(capitalRoute)
    expect(capitalRoute).toBe(gross)
  })
})

// ---------------------------------------------------------------------------
// 3. Compare vs combine — same classification in both modes
// ---------------------------------------------------------------------------

describe('compare vs combine — single-instance byte-identity per contract vintage', () => {
  /**
   * Compare mode ties the pAV budget to `bavFunding.monthlyNetCost`
   * (fair-comparison invariant); combine mode honours the per-instance
   * `monthlyContribution`. Pinning the instance contribution to the compare
   * anchor makes both modes invest the identical amount, so any net difference
   * below is a classification difference, not a funding difference.
   */
  function compareBudgetAnchor(): number {
    return calculateBavFunding(defaultProfile, RULES, defaultAssumptions.bav).monthlyNetCost
  }

  function runBothModes(instanceInput: {
    instanceId: string
    contractStartYear: number
    oldContractTaxFreeEligible: boolean
    payoutMode: PayoutMode
  }) {
    const anchor = compareBudgetAnchor()
    const instance: InsuranceInstance = {
      ...makeInsuranceInstance(instanceInput),
      monthlyContribution: anchor,
    }
    const ws = makeInsuranceWorkspace([instance], defaultAssumptions.bav.monthlyGrossConversion)
    const { perInstance } = simulatePortfolio(ws, RULES)
    const insBasis = perInstance[instance.instanceId]!.find((r) => r.scenarioId === 'basis')!

    const singleton = {
      ...defaultAssumptions,
      insurance: {
        ...defaultAssumptions.insurance,
        contractStartYear: instanceInput.contractStartYear,
        oldContractTaxFreeEligible: instanceInput.oldContractTaxFreeEligible,
        payoutMode: instanceInput.payoutMode,
      },
      visibleProducts: ['versicherung' as const],
    }
    const legacy = simulateRetirementComparison(defaultProfile, singleton, RULES)
    const legacyPav = legacy.products.find(
      (p) => p.productId === 'versicherung' && p.scenarioId === 'basis',
    )!

    // Identical funding in both modes → identical accumulation.
    expect(insBasis.capitalAtRetirement).toBe(legacyPav.capitalAtRetirement)
    expect(insBasis.grossMonthlyPayout).toBe(legacyPav.grossMonthlyPayout)

    const grvGross = legacy.statutoryPension.grossMonthlyPension
    const combined = combinePortfolio(ws, [insBasis], makeCombineContext(grvGross))
    return { combined, legacyPav, instance, grvGross }
  }

  it('halbeinkuenfte vintage (kapitalverzehr): combine net equals the compare-mode net', () => {
    const { combined, legacyPav, instance } = runBothModes({
      instanceId: 'versicherung-halbeink',
      contractStartYear: 2010,
      oldContractTaxFreeEligible: false,
      payoutMode: 'kapitalverzehr',
    })
    expect(legacyPav.netMonthlyPayout).toBeLessThan(legacyPav.grossMonthlyPayout) // non-degenerate
    expect(combined.byInstance[instance.instanceId].monthlyNet).toBeCloseTo(
      legacyPav.netMonthlyPayout,
      6,
    )
  })

  it('pre-2005 vintage (kapitalverzehr): payout stays fully pass-through in both modes', () => {
    const { combined, legacyPav, instance } = runBothModes({
      instanceId: 'versicherung-pre2005',
      contractStartYear: 1990,
      oldContractTaxFreeEligible: true,
      payoutMode: 'kapitalverzehr',
    })
    // §52 Abs. 28 EStG a.F.: gross = net in compare mode …
    expect(legacyPav.netMonthlyPayout).toBe(legacyPav.grossMonthlyPayout)
    expect(combined.byInstance[instance.instanceId].monthlyNet).toBe(legacyPav.grossMonthlyPayout)

    // … and the combine aggregate owes zero tax on this instance.
    expect(combined.byInstance[instance.instanceId].taxShareAnnual).toBe(0)
    expect(combined.aggregateTax.privateInsuranceTaxable).toBe(0)
  })
})

describe('combinePortfolio — mixed vintages, transferred principal, loss floor (#379)', () => {
  // Portfolio of four pAV contracts in one household (KVdR, GRV 1.200 €/month):
  //   A pre-2005 kapitalverzehr  → tax-free capital route
  //   B halbeinkuenfte kapitalverzehr with 100k transferred principal
  //   C leibrente (post-2011 vintage, Ertragsanteil at 67)
  //   D halbeinkuenfte kapitalverzehr in loss position (capital < basis)
  const instances: InsuranceInstance[] = [
    makeInsuranceInstance({
      instanceId: 'pav-pre2005',
      contractStartYear: 1990,
      oldContractTaxFreeEligible: true,
      payoutMode: 'kapitalverzehr',
    }),
    makeInsuranceInstance({
      instanceId: 'pav-halbeink-transfer',
      contractStartYear: 2010,
      oldContractTaxFreeEligible: false,
      payoutMode: 'kapitalverzehr',
    }),
    makeInsuranceInstance({
      instanceId: 'pav-leibrente',
      contractStartYear: 2020,
      oldContractTaxFreeEligible: false,
      payoutMode: 'leibrente',
    }),
    makeInsuranceInstance({
      instanceId: 'pav-halbeink-loss',
      contractStartYear: 2015,
      oldContractTaxFreeEligible: false,
      payoutMode: 'kapitalverzehr',
    }),
  ]

  const results: ProductResult[] = [
    makeInsuranceResult({
      instanceId: 'pav-pre2005',
      grossMonthlyPayout: 1_000,
      capitalAtRetirement: 600_000,
      totalProductContributions: 400_000,
      totalContributionsBeforeFees: 400_000,
    }),
    // 250k regular contributions + 100k injected surrender_reinvest principal.
    makeInsuranceResult({
      instanceId: 'pav-halbeink-transfer',
      grossMonthlyPayout: 1_200,
      capitalAtRetirement: 400_000,
      totalProductContributions: 250_000,
      totalContributionsBeforeFees: 350_000,
    }),
    makeInsuranceResult({
      instanceId: 'pav-leibrente',
      grossMonthlyPayout: 900,
      capitalAtRetirement: 500_000,
      totalProductContributions: 500_000,
      totalContributionsBeforeFees: 500_000,
    }),
    makeInsuranceResult({
      instanceId: 'pav-halbeink-loss',
      grossMonthlyPayout: 800,
      capitalAtRetirement: 100_000,
      totalProductContributions: 300_000,
      totalContributionsBeforeFees: 300_000,
    }),
  ]

  const GRV_GROSS_MONTHLY = 1_200
  const ws = makeInsuranceWorkspace(instances)
  const ctx = makeCombineContext(GRV_GROSS_MONTHLY)
  const combined = combinePortfolio(ws, results, ctx)

  it('aggregates the progressive base exactly as the shared classifier classifies each contract', () => {
    // Expected components built ONLY from the shared classifier + the same
    // statutory routing combine uses — proving both modes classify alike.
    const contributions = results.map((r) => {
      const inst = instances.find((i) => i.instanceId === r.instanceId)!
      // Hand-resolved capital-payout vintage for these fixtures (pre-2005
      // eligible → 'pre2005'; 2010/2015 at age 67 → 'halbeinkuenfte'). The
      // classifier's Leibrente override replaces it with 'ertragsanteil'.
      const contractTaxMode: InsuranceTaxMode =
        inst.payoutMode !== 'leibrente' &&
        inst.contractStartYear < 2005 &&
        inst.oldContractTaxFreeEligible
          ? 'pre2005'
          : 'halbeinkuenfte'
      const c = classifyInsuranceMonthlyIncome({
        grossMonthlyPayout: r.grossMonthlyPayout,
        capital: r.capitalAtRetirement,
        totalContributions: r.totalContributionsBeforeFees,
        contractTaxMode,
        payoutMode: inst.payoutMode,
        retirementAge: defaultProfile.retirementAge,
      })
      return { amount: c.taxableAnnual, mode: c.effectiveTaxMode }
    })

    const expectedTax = calculateRetirementTax(
      {
        statutoryPensionAnnual: GRV_GROSS_MONTHLY * 12,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        privateInsuranceContributions: contributions,
        otherTaxableAnnual: 0,
        retirementYear: RETIREMENT_YEAR,
      },
      RULES,
      'single',
    )
    expectTaxBreakdownsEqual(combined.aggregateTax, expectedTax)

    // And the concrete classification behind it:
    //   pre-2005 → 0, transferred principal shrinks the halbeinkuenfte gain,
    //   leibrente → Ertragsanteil at 67, loss → 0.
    expect(contributions).toEqual([
      { amount: 0, mode: 'pre2005' },
      { amount: 1_200 * 12 * (50_000 / 400_000), mode: 'halbeinkuenfte' },
      { amount: 900 * 12 * ertragsanteilByAge(67), mode: 'ertragsanteil' },
      { amount: 0, mode: 'halbeinkuenfte' },
    ])
    // Halbeinkünfte halves the transfer-shrunk gain inside the pipeline.
    expect(combined.aggregateTax.privateInsuranceTaxable).toBe(
      1_200 * 12 * (50_000 / 400_000) * 0.5 + 900 * 12 * ertragsanteilByAge(67),
    )
  })

  it('allocates zero tax to the tax-free and loss-making contracts', () => {
    // pre-2005 and loss-floor contracts contribute nothing to the progressive
    // base — their marginal delta is 0, so their back-allocated share is 0.
    for (const id of ['pav-pre2005', 'pav-halbeink-loss']) {
      expect(combined.byInstance[id].taxShareAnnual).toBe(0)
      expect(combined.byInstance[id].kvPvShare).toBe(0)
      expect(combined.byInstance[id].monthlyNet).toBe(
        combined.byInstance[id].monthlyGross,
      )
    }
  })

  it('charges the transferred-principal and Leibrente contracts their marginal share', () => {
    expect(combined.byInstance['pav-halbeink-transfer'].taxShareAnnual).toBeGreaterThan(0)
    expect(combined.byInstance['pav-leibrente'].taxShareAnnual).toBeGreaterThan(0)
    // The transfer-shrunk halbeinkuenfte gain is smaller than the Leibrente
    // base — characterization pins from the pre-refactor aggregation
    // (#379 refactor must leave these byte-identical):
    expect(combined.byInstance['pav-halbeink-transfer'].taxShareAnnual).toBe(184.86135181975735)
    expect(combined.byInstance['pav-leibrente'].taxShareAnnual).toBe(362.1386481802426)
    expect(combined.byInstance['pav-halbeink-transfer'].monthlyNet).toBe(1184.5948873483535)
    expect(combined.byInstance['pav-leibrente'].monthlyNet).toBe(869.8217793183131)
  })

  it('keeps the household identity: statutory net + per-instance nets = aggregate net', () => {
    const sumNets = Object.values(combined.byInstance).reduce((s, share) => s + share.monthlyNet, 0)
    expect(combined.statutoryPensionMonthlyNet + sumNets).toBeCloseTo(combined.monthlyNetIncome, 9)
    for (const share of Object.values(combined.byInstance)) {
      expect(share.monthlyNet).toBe(
        Math.max(0, share.monthlyGross - share.taxShareAnnual / 12 - share.kvPvShare),
      )
    }
  })

  it('no gain-ratio regression: transferred principal is not ignored (#65)', () => {
    // If the basis fell back to totalProductContributions (250k instead of
    // 350k), the halbeinkuenfte instance's taxable share would triple and its
    // tax share would rise sharply.
    expect(combined.byInstance['pav-halbeink-transfer'].taxShareAnnual).toBeLessThan(
      combined.aggregateTax.privateInsuranceTaxable,
    )
    expect(combined.byInstance['pav-halbeink-transfer'].monthlyNet).toBeGreaterThan(
      combined.byInstance['pav-leibrente'].monthlyNet,
    )
  })
})
