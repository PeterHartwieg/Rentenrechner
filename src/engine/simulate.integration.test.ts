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
import { defaultAssumptions } from '../data/defaultScenario'

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
