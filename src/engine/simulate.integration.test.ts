/**
 * Integration snapshot baseline for simulateRetirementComparison.
 * These tests capture the current correct numerical output so that Phase 6
 * engine surgery (product-module extraction) cannot silently shift results.
 *
 * Run `npx vitest run --update-snapshots` only when a deliberate financial
 * model change warrants updating the golden values.
 */
import { describe, expect, it } from 'vitest'
import { resultFor, simulateDefault } from '../test/factories'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { simulateRetirementComparison } from './simulate'
import { syncMonthlyContributions } from '../app/syncContributions'

// Run a full-product simulation (all 6 products visible) once and reuse across
// structural / product-invariant / golden tests in this suite. Using all-products
// here lets us assert cross-product correctness even though the default UI comparison
// only shows etf + bAV.
const ALL_PRODUCTS = ['etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester'] as const
const defaultResult = simulateDefault({ assumptions: { visibleProducts: [...ALL_PRODUCTS] } })
const { products } = defaultResult

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe('simulateRetirementComparison — structure', () => {
  it('produces one result per product per scenario (6 products × 3 scenarios)', () => {
    expect(products).toHaveLength(18)
  })

  it('covers all six product ids', () => {
    const ids = new Set(products.map(p => p.productId))
    expect(ids).toEqual(new Set(['etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester']))
  })

  it('covers all three scenario ids', () => {
    const ids = new Set(products.map(p => p.scenarioId))
    expect(ids).toEqual(new Set(['konservativ', 'basis', 'optimistisch']))
  })
})

// ---------------------------------------------------------------------------
// Fair-comparison invariant
// ---------------------------------------------------------------------------

describe('simulateRetirementComparison — fair-comparison invariant', () => {
  it('ETF and insurance invest the same net monthly cost as bAV (all scenarios)', () => {
    for (const scenario of defaultAssumptions.returnScenarios) {
      const bav = resultFor(products, 'bav', scenario.id)
      const etf = resultFor(products, 'etf', scenario.id)
      const ins = resultFor(products, 'versicherung', scenario.id)
      expect(etf.monthlyUserCost).toBe(bav.monthlyUserCost)
      expect(ins.monthlyUserCost).toBe(bav.monthlyUserCost)
    }
  })

  it('after syncMonthlyContributions, all six products invest the same monthly netto', () => {
    // Sync the assumptions through the single-anchor solver (the same path the
    // UI takes whenever the user edits a contribution). Every product's
    // monthlyUserCost should then equal the chosen netto anchor.
    // Use all-products assumptions so resultFor can find all six.
    const allProductsAssumptions = { ...defaultAssumptions, visibleProducts: [...ALL_PRODUCTS] }
    const synced = syncMonthlyContributions(150, allProductsAssumptions, defaultProfile, de2026Rules)
    const syncedResult = simulateRetirementComparison(defaultProfile, synced, de2026Rules)
    for (const scenario of defaultAssumptions.returnScenarios) {
      const bav = resultFor(syncedResult.products, 'bav', scenario.id)
      for (const id of ['etf', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester'] as const) {
        const r = resultFor(syncedResult.products, id, scenario.id)
        expect(r.monthlyUserCost).toBeCloseTo(bav.monthlyUserCost, 1)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Product-level invariants
// ---------------------------------------------------------------------------

describe('simulateRetirementComparison — product invariants', () => {
  it('basisrente afterTaxLumpSum is null (capital payout legally prohibited)', () => {
    for (const scenario of defaultAssumptions.returnScenarios) {
      expect(resultFor(products, 'basisrente', scenario.id).afterTaxLumpSum).toBeNull()
    }
  })

  it('all products: net monthly payout is positive in the basis scenario', () => {
    for (const id of ['etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester'] as const) {
      expect(resultFor(products, id, 'basis').netMonthlyPayout).toBeGreaterThan(0)
    }
  })

  it('all products: capital is monotonically higher at higher return assumptions', () => {
    for (const id of ['etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester'] as const) {
      const low = resultFor(products, id, 'konservativ').capitalAtRetirement
      const mid = resultFor(products, id, 'basis').capitalAtRetirement
      const high = resultFor(products, id, 'optimistisch').capitalAtRetirement
      expect(low).toBeLessThan(mid)
      expect(mid).toBeLessThan(high)
    }
  })

  it('all products: net monthly payout <= gross monthly payout (tax + KV/PV applied)', () => {
    for (const id of ['etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester'] as const) {
      const r = resultFor(products, id, 'basis')
      expect(r.netMonthlyPayout).toBeLessThanOrEqual(r.grossMonthlyPayout)
    }
  })
})

// ---------------------------------------------------------------------------
// Golden snapshots — basis scenario (5 % return)
// These values are auto-populated by Vitest on first run.
// Update only when a deliberate model change warrants it.
// ---------------------------------------------------------------------------

describe('simulateRetirementComparison — golden snapshots (basis, 5 %)', () => {
  it('ETF', () => {
    const r = resultFor(products, 'etf', 'basis')
    expect(r.capitalAtRetirement).toMatchSnapshot('capitalAtRetirement')
    expect(r.afterTaxLumpSum).toMatchSnapshot('afterTaxLumpSum')
    expect(r.netMonthlyPayout).toMatchSnapshot('netMonthlyPayout')
  })

  it('bAV', () => {
    const r = resultFor(products, 'bav', 'basis')
    expect(r.capitalAtRetirement).toMatchSnapshot('capitalAtRetirement')
    expect(r.afterTaxLumpSum).toMatchSnapshot('afterTaxLumpSum')
    expect(r.netMonthlyPayout).toMatchSnapshot('netMonthlyPayout')
  })

  it('private insurance (Schicht 3)', () => {
    const r = resultFor(products, 'versicherung', 'basis')
    expect(r.capitalAtRetirement).toMatchSnapshot('capitalAtRetirement')
    expect(r.afterTaxLumpSum).toMatchSnapshot('afterTaxLumpSum')
    expect(r.netMonthlyPayout).toMatchSnapshot('netMonthlyPayout')
  })

  it('Basisrente', () => {
    const r = resultFor(products, 'basisrente', 'basis')
    expect(r.capitalAtRetirement).toMatchSnapshot('capitalAtRetirement')
    expect(r.afterTaxLumpSum).toBeNull()
    expect(r.netMonthlyPayout).toMatchSnapshot('netMonthlyPayout')
  })

  it('Altersvorsorgedepot', () => {
    const r = resultFor(products, 'altersvorsorgedepot', 'basis')
    expect(r.capitalAtRetirement).toMatchSnapshot('capitalAtRetirement')
    expect(r.afterTaxLumpSum).toMatchSnapshot('afterTaxLumpSum')
    expect(r.netMonthlyPayout).toMatchSnapshot('netMonthlyPayout')
  })

  it('Riester', () => {
    const r = resultFor(products, 'riester', 'basis')
    expect(r.capitalAtRetirement).toMatchSnapshot('capitalAtRetirement')
    expect(r.afterTaxLumpSum).toMatchSnapshot('afterTaxLumpSum')
    expect(r.netMonthlyPayout).toMatchSnapshot('netMonthlyPayout')
  })
})

// ---------------------------------------------------------------------------
// Golden snapshots — konservativ scenario (3 % return)
// One non-default scenario to verify that return-scenario branching is stable.
// ---------------------------------------------------------------------------

describe('simulateRetirementComparison — golden snapshots (konservativ, 3 %)', () => {
  it('ETF', () => {
    const r = resultFor(products, 'etf', 'konservativ')
    expect(r.capitalAtRetirement).toMatchSnapshot('capitalAtRetirement')
    expect(r.afterTaxLumpSum).toMatchSnapshot('afterTaxLumpSum')
    expect(r.netMonthlyPayout).toMatchSnapshot('netMonthlyPayout')
  })

  it('bAV', () => {
    const r = resultFor(products, 'bav', 'konservativ')
    expect(r.capitalAtRetirement).toMatchSnapshot('capitalAtRetirement')
    expect(r.netMonthlyPayout).toMatchSnapshot('netMonthlyPayout')
  })
})

// ---------------------------------------------------------------------------
// Default-profile end-to-end snapshot
// Locks in the three key output metrics for the default profile and assumptions.
// Captures regression when any part of the engine changes.
// Note: uses defaultAssumptions.retirementEndAge = 90 (payoutYears = 23).
// ---------------------------------------------------------------------------

describe('default-profile end-to-end snapshot', () => {
  const sim = simulateRetirementComparison(
    defaultProfile,
    { ...defaultAssumptions, visibleProducts: [...ALL_PRODUCTS] },
    de2026Rules,
  )
  const find = (productId: string, scenarioId: string) =>
    sim.products.find((p) => p.productId === productId && p.scenarioId === scenarioId)!

  it('ETF: capitalAtRetirement, afterTaxLumpSum, netMonthlyPayout per scenario', () => {
    const k = find('etf', 'konservativ')
    expect(Math.round(k.capitalAtRetirement)).toBe(92_024)
    expect(Math.round(k.afterTaxLumpSum!)).toBe(90_868)
    expect(Math.round(k.netMonthlyPayout)).toBe(451)

    const b = find('etf', 'basis')
    expect(Math.round(b.capitalAtRetirement)).toBe(144_628)
    expect(Math.round(b.afterTaxLumpSum!)).toBe(135_904)
    expect(Math.round(b.netMonthlyPayout)).toBe(827)

    const o = find('etf', 'optimistisch')
    expect(Math.round(o.capitalAtRetirement)).toBe(234_090)
    expect(Math.round(o.afterTaxLumpSum!)).toBe(212_056)
    expect(Math.round(o.netMonthlyPayout)).toBe(1_515)
  })

  it('bAV: capitalAtRetirement, afterTaxLumpSum, netMonthlyPayout per scenario', () => {
    const k = find('bav', 'konservativ')
    expect(Math.round(k.capitalAtRetirement)).toBe(151_776)
    expect(Math.round(k.afterTaxLumpSum!)).toBe(58_040)
    expect(Math.round(k.netMonthlyPayout)).toBe(257)

    const b = find('bav', 'basis')
    expect(Math.round(b.capitalAtRetirement)).toBe(235_395)
    expect(Math.round(b.afterTaxLumpSum!)).toBe(86_463)
    expect(Math.round(b.netMonthlyPayout)).toBe(374)

    const o = find('bav', 'optimistisch')
    expect(Math.round(o.capitalAtRetirement)).toBe(376_652)
    expect(Math.round(o.afterTaxLumpSum!)).toBe(130_480)
    expect(Math.round(o.netMonthlyPayout)).toBe(567)
  })

  it('private insurance: capitalAtRetirement, afterTaxLumpSum, netMonthlyPayout per scenario', () => {
    const k = find('versicherung', 'konservativ')
    expect(Math.round(k.capitalAtRetirement)).toBe(80_842)
    expect(Math.round(k.afterTaxLumpSum!)).toBe(76_191)
    expect(Math.round(k.netMonthlyPayout)).toBe(212)

    const b = find('versicherung', 'basis')
    expect(Math.round(b.capitalAtRetirement)).toBe(126_219)
    expect(Math.round(b.afterTaxLumpSum!)).toBe(112_916)
    expect(Math.round(b.netMonthlyPayout)).toBe(331)

    const o = find('versicherung', 'optimistisch')
    expect(Math.round(o.capitalAtRetirement)).toBe(203_158)
    expect(Math.round(o.afterTaxLumpSum!)).toBe(172_021)
    expect(Math.round(o.netMonthlyPayout)).toBe(532)
  })
})

// ---------------------------------------------------------------------------
// #72 projectStatutoryPension (via simulateRetirementComparison)
// ---------------------------------------------------------------------------

describe('#72 projectStatutoryPension (via simulateRetirementComparison)', () => {
  // Default profile: age=28, retirementAge=67, grossSalaryYear=75,000, currentEntgeltpunkte=8
  // pensionCapYear=101,400 (below cap); durchschnittsentgelt=51,944; aktuellerRentenwert=42.52
  // remainingYears=39; epPerYear=75000/51944≈1.4439; projectedEP=8+39*1.4439≈64.31; gross≈2734 EUR/month

  it('EP-based: gross monthly pension equals projectedEntgeltpunkte * aktuellerRentenwert', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const { grossMonthlyPension, projectedEntgeltpunkte } = sim.statutoryPension
    const expectedGross = projectedEntgeltpunkte * de2026Rules.socialSecurity.aktuellerRentenwert
    expect(grossMonthlyPension).toBeCloseTo(expectedGross, 2)
  })

  it('EP-based: projectedEntgeltpunkte = currentEP + remainingYears * (cappedSalary / durchschnittsentgelt)', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const cappedSalary = Math.min(defaultProfile.grossSalaryYear, de2026Rules.socialSecurity.pensionCapYear)
    const epPerYear = cappedSalary / de2026Rules.socialSecurity.durchschnittsentgelt
    const remainingYears = defaultProfile.retirementAge - defaultProfile.age
    const expectedEP = defaultAssumptions.statutoryPension.currentEntgeltpunkte + remainingYears * epPerYear
    expect(sim.statutoryPension.projectedEntgeltpunkte).toBeCloseTo(expectedEP, 4)
    // Snapshot: ~64.3 EP → ~2,734 EUR/month gross for the default 28-year-old at 75k
    expect(sim.statutoryPension.grossMonthlyPension).toBeCloseTo(2_734, 0)
  })

  it('manual override: gross pension equals manualMonthlyGross, EP-based estimation is bypassed', () => {
    const manualGross = 1_800
    const sim = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        statutoryPension: {
          ...defaultAssumptions.statutoryPension,
          manualMonthlyGross: manualGross,
          currentEntgeltpunkte: 100, // ignored in manual mode
        },
      },
      de2026Rules,
    )
    expect(sim.statutoryPension.grossMonthlyPension).toBeCloseTo(manualGross, 0)
  })

  it('net pension < gross pension (income tax + KV/PV both positive)', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    expect(sim.statutoryPension.taxMonthly).toBeGreaterThan(0)
    expect(sim.statutoryPension.kvPvMonthly).toBeGreaterThan(0)
    expect(sim.statutoryPension.netMonthlyPension).toBeLessThan(sim.statutoryPension.grossMonthlyPension)
  })

  it('net + tax + KV/PV ≈ gross (balance identity, floor at 0)', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const { grossMonthlyPension, netMonthlyPension, taxMonthly, kvPvMonthly } = sim.statutoryPension
    expect(netMonthlyPension).toBeCloseTo(
      Math.max(0, grossMonthlyPension - taxMonthly - kvPvMonthly),
      1,
    )
  })

  it('includeGrvReduction: gross drops by estimatedMonthlyGrvReduction from bAV', () => {
    const reduction = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
      .bavFunding.estimatedMonthlyGrvReduction
    // Only meaningful when bAV conversion > 0 (default: 300 EUR/month → reduction > 0)
    expect(reduction).toBeGreaterThan(0)

    const withRed = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: { ...defaultAssumptions.statutoryPension, includeGrvReduction: true } },
      de2026Rules,
    )
    const noRed = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    expect(withRed.statutoryPension.grossMonthlyPension).toBeCloseTo(
      noRed.statutoryPension.grossMonthlyPension - reduction,
      2,
    )
    expect(withRed.statutoryPension.grvReductionApplied).toBeCloseTo(reduction, 2)
    expect(noRed.statutoryPension.grvReductionApplied).toBe(0)
  })

  it('zero EP, zero salary: gross and net are both 0', () => {
    const sim = simulateRetirementComparison(
      { ...defaultProfile, grossSalaryYear: 0 },
      {
        ...defaultAssumptions,
        statutoryPension: { manualMonthlyGross: null, currentEntgeltpunkte: 0, includeGrvReduction: false },
      },
      de2026Rules,
    )
    expect(sim.statutoryPension.grossMonthlyPension).toBe(0)
    expect(sim.statutoryPension.netMonthlyPension).toBe(0)
  })

  it('salary above BBG is capped at pensionCapYear for EP calculation', () => {
    const highSim = simulateRetirementComparison(
      { ...defaultProfile, grossSalaryYear: 200_000 },
      { ...defaultAssumptions, statutoryPension: { manualMonthlyGross: null, currentEntgeltpunkte: 0, includeGrvReduction: false, annualSalaryGrowthRate: 0, rentenwertGrowthRate: 0 } },
      de2026Rules,
    )
    const cappedSim = simulateRetirementComparison(
      { ...defaultProfile, grossSalaryYear: de2026Rules.socialSecurity.pensionCapYear },
      { ...defaultAssumptions, statutoryPension: { manualMonthlyGross: null, currentEntgeltpunkte: 0, includeGrvReduction: false, annualSalaryGrowthRate: 0, rentenwertGrowthRate: 0 } },
      de2026Rules,
    )
    // 200k and BBG cap should produce identical projectedEP (both capped)
    expect(highSim.statutoryPension.projectedEntgeltpunkte).toBeCloseTo(
      cappedSim.statutoryPension.projectedEntgeltpunkte,
      4,
    )
  })

  // --- Group E: salary growth and Rentenwert indexation ---

  it('annualSalaryGrowthRate=0 matches zero-growth baseline (backward compat)', () => {
    const flat = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const explicit = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        statutoryPension: { ...defaultAssumptions.statutoryPension, annualSalaryGrowthRate: 0, rentenwertGrowthRate: 0 },
      },
      de2026Rules,
    )
    expect(explicit.statutoryPension.projectedEntgeltpunkte).toBeCloseTo(flat.statutoryPension.projectedEntgeltpunkte, 6)
    expect(explicit.statutoryPension.grossMonthlyPension).toBeCloseTo(flat.statutoryPension.grossMonthlyPension, 6)
  })

  it('annualSalaryGrowthRate > 0 produces more EP than flat salary (EP mode)', () => {
    const flat = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const growing = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        statutoryPension: { ...defaultAssumptions.statutoryPension, annualSalaryGrowthRate: 0.02, rentenwertGrowthRate: 0 },
      },
      de2026Rules,
    )
    expect(growing.statutoryPension.projectedEntgeltpunkte).toBeGreaterThan(flat.statutoryPension.projectedEntgeltpunkte)
  })

  it('salary growth matches year-by-year manual sum', () => {
    // Simple case: salary=40k (well below BBG), 5 years, g=0.05 → EP = sum(40k*(1.05)^t / DE for t=0..4)
    const profile5yr = { ...defaultProfile, age: 62, retirementAge: 67, grossSalaryYear: 40_000 }
    const sp5yr = { manualMonthlyGross: null as null, currentEntgeltpunkte: 0, includeGrvReduction: false, annualSalaryGrowthRate: 0.05, rentenwertGrowthRate: 0 }
    const sim = simulateRetirementComparison(profile5yr, { ...defaultAssumptions, statutoryPension: sp5yr }, de2026Rules)
    const de = de2026Rules.socialSecurity.durchschnittsentgelt
    const expectedEP = [0, 1, 2, 3, 4].reduce((acc, t) => acc + 40_000 * Math.pow(1.05, t) / de, 0)
    expect(sim.statutoryPension.projectedEntgeltpunkte).toBeCloseTo(expectedEP, 6)
  })

  it('rentenwertGrowthRate scales gross pension (EP mode)', () => {
    const noGrowth = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const growthRate = 0.01
    const withGrowth = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        statutoryPension: { ...defaultAssumptions.statutoryPension, rentenwertGrowthRate: growthRate },
      },
      de2026Rules,
    )
    const remainingYears = defaultProfile.retirementAge - defaultProfile.age
    const expectedGross = noGrowth.statutoryPension.projectedEntgeltpunkte *
      de2026Rules.socialSecurity.aktuellerRentenwert * Math.pow(1 + growthRate, remainingYears)
    expect(withGrowth.statutoryPension.grossMonthlyPension).toBeCloseTo(expectedGross, 2)
  })

  it('rentenwertGrowthRate scales manual override pension', () => {
    const manualGross = 2_000
    const growthRate = 0.015
    const remainingYears = defaultProfile.retirementAge - defaultProfile.age
    const sim = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        statutoryPension: { ...defaultAssumptions.statutoryPension, manualMonthlyGross: manualGross, rentenwertGrowthRate: growthRate },
      },
      de2026Rules,
    )
    const expectedGross = manualGross * Math.pow(1 + growthRate, remainingYears)
    expect(sim.statutoryPension.grossMonthlyPension).toBeCloseTo(expectedGross, 2)
  })

  it('zero rentenwertGrowthRate leaves manual override unchanged', () => {
    const manualGross = 1_500
    const sim = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        statutoryPension: { ...defaultAssumptions.statutoryPension, manualMonthlyGross: manualGross, rentenwertGrowthRate: 0 },
      },
      de2026Rules,
    )
    expect(sim.statutoryPension.grossMonthlyPension).toBeCloseTo(manualGross, 2)
  })
})

// ---------------------------------------------------------------------------
// Wave 15: pensionBaselineType variants
// ---------------------------------------------------------------------------

describe('Wave 15 pensionBaselineType: versorgungswerk', () => {
  const vwSp = {
    ...defaultAssumptions.statutoryPension,
    pensionBaselineType: 'versorgungswerk' as const,
    versorgungswerkMonthlyContribution: 400,
    versorgungswerkEmployerMonthly: 400,
  }

  it('produces the same gross pension as GRV given identical EP inputs', () => {
    const grvSim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const vwSim = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: vwSp },
      de2026Rules,
    )
    expect(vwSim.statutoryPension.grossMonthlyPension).toBeCloseTo(
      grvSim.statutoryPension.grossMonthlyPension,
      2,
    )
  })

  it('grvReductionApplied is always 0 (bAV does not reduce VW pension)', () => {
    const sim = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: { ...vwSp, includeGrvReduction: true } },
      de2026Rules,
    )
    expect(sim.statutoryPension.grvReductionApplied).toBe(0)
  })

  it('KV/PV differs from GRV (full health rate on Versorgungsbezug vs §249a half-rate)', () => {
    const vwSim = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: { ...vwSp, manualMonthlyGross: 2000, versorgungswerkMonthlyContribution: 0, versorgungswerkEmployerMonthly: 0 } },
      de2026Rules,
    )
    const grvManualSim = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: { ...defaultAssumptions.statutoryPension, manualMonthlyGross: 2000 } },
      de2026Rules,
    )
    // VW uses full health rate (minus Freibetrag), GRV uses half rate → VW KV/PV differs
    // The VW Freibetrag can make it higher or similar; just verify they are treated differently
    expect(vwSim.statutoryPension.kvPvMonthly).not.toBeCloseTo(
      grvManualSim.statutoryPension.kvPvMonthly,
      0,
    )
  })

  it('VW contributions reduce the Schicht-1 cap for Basisrente', () => {
    const noVwSim = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: { ...vwSp, versorgungswerkMonthlyContribution: 0, versorgungswerkEmployerMonthly: 0 } },
      de2026Rules,
    )
    const highVwSim = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: { ...vwSp, versorgungswerkMonthlyContribution: 800, versorgungswerkEmployerMonthly: 800 } },
      de2026Rules,
    )
    expect(highVwSim.basisrenteFunding.annualPensionContributionsTowardsCap).toBeGreaterThan(
      noVwSim.basisrenteFunding.annualPensionContributionsTowardsCap,
    )
    expect(highVwSim.basisrenteFunding.remainingSchicht1Cap).toBeLessThan(
      noVwSim.basisrenteFunding.remainingSchicht1Cap,
    )
  })
})

describe('Wave 15 pensionBaselineType: beamtenpension', () => {
  const beamteSp = {
    ...defaultAssumptions.statutoryPension,
    pensionBaselineType: 'beamtenpension' as const,
    manualMonthlyGross: 2_500,
  }

  it('gross equals the manual input (no EP estimation)', () => {
    const sim = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: beamteSp },
      de2026Rules,
    )
    expect(sim.statutoryPension.grossMonthlyPension).toBeCloseTo(2_500, 1)
    expect(sim.statutoryPension.projectedEntgeltpunkte).toBe(0)
  })

  it('income tax is routed differently from GRV (§19 EStG Versorgungsfreibetrag vs §22 Besteuerungsanteil)', () => {
    // For the same gross, GRV and Beamtenpension use different tax pipelines.
    // GRV: gross × Besteuerungsanteil enters the base (e.g. ~88.6% for 2040 cohort).
    // Beamtenpension: full gross enters but reduced by the remaining Versorgungsfreibetrag.
    // Which is lower depends on cohort; we just verify the two routes produce different results,
    // proving Beamtenpension is correctly routed through bavPensionAnnual (not statutoryPensionAnnual).
    const profile2040 = { ...defaultProfile, age: 53 }  // retires 2040
    const beamteSim = simulateRetirementComparison(
      profile2040,
      { ...defaultAssumptions, statutoryPension: { ...beamteSp, manualMonthlyGross: 2_500 } },
      de2026Rules,
    )
    const grvManualSim = simulateRetirementComparison(
      profile2040,
      { ...defaultAssumptions, statutoryPension: { ...defaultAssumptions.statutoryPension, manualMonthlyGross: 2_500 } },
      de2026Rules,
    )
    expect(beamteSim.statutoryPension.taxMonthly).toBeGreaterThan(0)
    expect(grvManualSim.statutoryPension.taxMonthly).toBeGreaterThan(0)
    // Different routing → different tax amounts (confirms §19 vs §22 code path distinction).
    expect(beamteSim.statutoryPension.taxMonthly).not.toBeCloseTo(
      grvManualSim.statutoryPension.taxMonthly,
      0,
    )
  })

  it('PKV holder: KV/PV is 0 (Beamte typically have Beihilfe + supplemental PKV)', () => {
    const pkvProfile = { ...defaultProfile, publicHealthInsurance: false }
    const sim = simulateRetirementComparison(
      pkvProfile,
      { ...defaultAssumptions, statutoryPension: beamteSp },
      de2026Rules,
    )
    expect(sim.statutoryPension.kvPvMonthly).toBe(0)
  })

  it('GKV holder: KV/PV positive (routes as Versorgungsbezug with Freibetrag)', () => {
    const sim = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: beamteSp },
      de2026Rules,
    )
    expect(sim.statutoryPension.kvPvMonthly).toBeGreaterThan(0)
  })

  it('grvReductionApplied is 0 (bAV does not affect Beamtenpension)', () => {
    const sim = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: { ...beamteSp, includeGrvReduction: true } },
      de2026Rules,
    )
    expect(sim.statutoryPension.grvReductionApplied).toBe(0)
  })

  it('Schicht-1 cap is not reduced by Beamtenpension (no pension contributions toward cap)', () => {
    const beamteSim = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: beamteSp },
      de2026Rules,
    )
    // Beamtenpension contributions are 0 → cap fully available for Basisrente
    expect(beamteSim.basisrenteFunding.annualPensionContributionsTowardsCap).toBe(0)
    expect(beamteSim.basisrenteFunding.remainingSchicht1Cap).toBeCloseTo(
      de2026Rules.basisrente.schicht1CapSingle,
      0,
    )
  })
})

describe('Wave 15 pensionBaselineType: none', () => {
  const noneSp = {
    ...defaultAssumptions.statutoryPension,
    pensionBaselineType: 'none' as const,
  }

  it('returns all zeros', () => {
    const sim = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: noneSp },
      de2026Rules,
    )
    const { grossMonthlyPension, netMonthlyPension, taxMonthly, kvPvMonthly, grvReductionApplied } =
      sim.statutoryPension
    expect(grossMonthlyPension).toBe(0)
    expect(netMonthlyPension).toBe(0)
    expect(taxMonthly).toBe(0)
    expect(kvPvMonthly).toBe(0)
    expect(grvReductionApplied).toBe(0)
  })

  it('Schicht-1 cap is fully available (no pension-system contributions)', () => {
    const sim = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: noneSp },
      de2026Rules,
    )
    expect(sim.basisrenteFunding.annualPensionContributionsTowardsCap).toBe(0)
    expect(sim.basisrenteFunding.remainingSchicht1Cap).toBeCloseTo(
      de2026Rules.basisrente.schicht1CapSingle,
      0,
    )
  })
})
