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

// Run the default simulation once and reuse across all tests in this suite.
const defaultResult = simulateDefault()
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
  const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
  const find = (productId: string, scenarioId: string) =>
    sim.products.find((p) => p.productId === productId && p.scenarioId === scenarioId)!

  it('ETF: capitalAtRetirement, afterTaxLumpSum, netMonthlyPayout per scenario', () => {
    const k = find('etf', 'konservativ')
    expect(Math.round(k.capitalAtRetirement)).toBe(136_659)
    expect(Math.round(k.afterTaxLumpSum!)).toBe(134_815)
    expect(Math.round(k.netMonthlyPayout)).toBe(670)

    const b = find('etf', 'basis')
    expect(Math.round(b.capitalAtRetirement)).toBe(214_546)
    expect(Math.round(b.afterTaxLumpSum!)).toBe(201_503)
    expect(Math.round(b.netMonthlyPayout)).toBe(1_217)

    const o = find('etf', 'optimistisch')
    expect(Math.round(o.capitalAtRetirement)).toBe(347_498)
    expect(Math.round(o.afterTaxLumpSum!)).toBe(314_676)
    expect(Math.round(o.netMonthlyPayout)).toBe(2_240)
  })

  it('bAV: capitalAtRetirement, afterTaxLumpSum, netMonthlyPayout per scenario', () => {
    const k = find('bav', 'konservativ')
    expect(Math.round(k.capitalAtRetirement)).toBe(243_214)
    expect(Math.round(k.afterTaxLumpSum!)).toBe(98_632)
    expect(Math.round(k.netMonthlyPayout)).toBe(606)

    const b = find('bav', 'basis')
    expect(Math.round(b.capitalAtRetirement)).toBe(379_719)
    expect(Math.round(b.afterTaxLumpSum!)).toBe(141_809)
    expect(Math.round(b.netMonthlyPayout)).toBe(912)

    const o = find('bav', 'optimistisch')
    expect(Math.round(o.capitalAtRetirement)).toBe(611_164)
    expect(Math.round(o.afterTaxLumpSum!)).toBe(213_152)
    expect(Math.round(o.netMonthlyPayout)).toBe(1_300)
  })

  it('private insurance: capitalAtRetirement, afterTaxLumpSum, netMonthlyPayout per scenario', () => {
    const k = find('versicherung', 'konservativ')
    expect(Math.round(k.capitalAtRetirement)).toBe(96_525)
    expect(Math.round(k.afterTaxLumpSum!)).toBe(96_525)
    expect(Math.round(k.netMonthlyPayout)).toBe(270)

    const b = find('versicherung', 'basis')
    expect(Math.round(b.capitalAtRetirement)).toBe(147_636)
    expect(Math.round(b.afterTaxLumpSum!)).toBe(141_947)
    expect(Math.round(b.netMonthlyPayout)).toBe(413)

    const o = find('versicherung', 'optimistisch')
    expect(Math.round(o.capitalAtRetirement)).toBe(233_291)
    expect(Math.round(o.afterTaxLumpSum!)).toBe(211_565)
    expect(Math.round(o.netMonthlyPayout)).toBe(653)
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
      { ...defaultAssumptions, statutoryPension: { manualMonthlyGross: null, currentEntgeltpunkte: 0, includeGrvReduction: false } },
      de2026Rules,
    )
    const cappedSim = simulateRetirementComparison(
      { ...defaultProfile, grossSalaryYear: de2026Rules.socialSecurity.pensionCapYear },
      { ...defaultAssumptions, statutoryPension: { manualMonthlyGross: null, currentEntgeltpunkte: 0, includeGrvReduction: false } },
      de2026Rules,
    )
    // 200k and BBG cap should produce identical projectedEP (both capped)
    expect(highSim.statutoryPension.projectedEntgeltpunkte).toBeCloseTo(
      cappedSim.statutoryPension.projectedEntgeltpunkte,
      4,
    )
  })
})
