/**
 * Unit tests for FeeSection Einzelposten residual-split logic and the
 * Effektivkosten all-in toggle round-trip.
 *
 * These tests verify the pure derivation logic that lives inside the onChange
 * handlers — no React rendering needed.
 */
import { describe, expect, it } from 'vitest'
import type { FeeModel } from '../../../domain'

// ---------------------------------------------------------------------------
// Helper: the same residual logic as the fundAssetFee onChange handler in
// FeeSection.tsx. Kept here as a named function so tests stay readable.
// ---------------------------------------------------------------------------

function applyFundFeeEdit(
  fees: FeeModel,
  newFundPct: number, // user-typed value in percent (e.g. 0.3)
): FeeModel {
  const totalAsset = fees.wrapperAssetFee + fees.fundAssetFee
  const newFund = newFundPct / 100
  const newWrapper = Math.max(0, totalAsset - newFund)
  return { ...fees, fundAssetFee: newFund, wrapperAssetFee: newWrapper }
}

/**
 * The Effektivkosten all-in toggle collapses the split into a single
 * wrapperAssetFee and zeros everything else. On the toggle-back path the
 * user switches to Einzelposten — the stored FeeModel already has the
 * correct total in wrapperAssetFee with fundAssetFee === 0.
 */
function applyAllInEdit(_fees: FeeModel, allInPct: number): FeeModel {
  return {
    wrapperAssetFee: allInPct / 100,
    fundAssetFee: 0,
    contributionFee: 0,
    fixedMonthlyFee: 0,
    acquisitionCostPct: 0,
    acquisitionCostSpreadYears: 5,
    pensionPayoutFeePct: 0,
  }
}

const BASE_FEES: FeeModel = {
  wrapperAssetFee: 0.007, // 0.7 %
  fundAssetFee: 0.003,    // 0.3 %  → total = 1.0 %
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 5,
  pensionPayoutFeePct: 0,
}

describe('FeeSection: Einzelposten fundAssetFee residual split', () => {
  it('routes the edited Fondskosten to fundAssetFee and derives wrapperAssetFee as residual', () => {
    // Bug scenario: start at 0.7 % wrapper + 0.3 % fund = 1.0 % total
    // User types 0.3 in Fondskosten field.
    // Expected: fundAssetFee = 0.3 %, wrapperAssetFee = 0.7 % (unchanged total).
    const result = applyFundFeeEdit(BASE_FEES, 0.3)
    expect(result.fundAssetFee).toBeCloseTo(0.003)
    expect(result.wrapperAssetFee).toBeCloseTo(0.007)
    expect(result.fundAssetFee + result.wrapperAssetFee).toBeCloseTo(0.01)
  })

  it('increases fundAssetFee and decreases wrapperAssetFee when user raises Fondskosten', () => {
    // Start 0.7 % wrapper + 0.3 % fund. User raises fund to 0.6 %.
    // Expected: wrapper drops to 0.4 %, fund goes up to 0.6 %.
    const result = applyFundFeeEdit(BASE_FEES, 0.6)
    expect(result.fundAssetFee).toBeCloseTo(0.006)
    expect(result.wrapperAssetFee).toBeCloseTo(0.004)
    expect(result.fundAssetFee + result.wrapperAssetFee).toBeCloseTo(0.01)
  })

  it('decreases fundAssetFee and increases wrapperAssetFee when user lowers Fondskosten', () => {
    // Start 0.7 % wrapper + 0.3 % fund. User lowers fund to 0.1 %.
    // Expected: wrapper climbs to 0.9 %.
    const result = applyFundFeeEdit(BASE_FEES, 0.1)
    expect(result.fundAssetFee).toBeCloseTo(0.001)
    expect(result.wrapperAssetFee).toBeCloseTo(0.009)
    expect(result.fundAssetFee + result.wrapperAssetFee).toBeCloseTo(0.01)
  })

  it('clamps wrapperAssetFee to 0 when fund exceeds total', () => {
    // User enters a fund fee larger than the current total → wrapper is floored at 0.
    const result = applyFundFeeEdit(BASE_FEES, 2.0) // 2.0 % > 1.0 % total
    expect(result.fundAssetFee).toBeCloseTo(0.02)
    expect(result.wrapperAssetFee).toBe(0)
    // Total has grown (user explicitly widened it).
    expect(result.fundAssetFee + result.wrapperAssetFee).toBeCloseTo(0.02)
  })

  it('does not mutate other FeeModel fields', () => {
    const fees: FeeModel = {
      ...BASE_FEES,
      contributionFee: 0.03,
      fixedMonthlyFee: 2.5,
      acquisitionCostPct: 0.02,
      acquisitionCostSpreadYears: 7,
      pensionPayoutFeePct: 0.01,
    }
    const result = applyFundFeeEdit(fees, 0.5)
    expect(result.contributionFee).toBe(0.03)
    expect(result.fixedMonthlyFee).toBe(2.5)
    expect(result.acquisitionCostPct).toBe(0.02)
    expect(result.acquisitionCostSpreadYears).toBe(7)
    expect(result.pensionPayoutFeePct).toBe(0.01)
  })
})

describe('FeeSection: Effektivkosten all-in toggle round-trip', () => {
  it('collapses split into wrapperAssetFee with other fees zeroed', () => {
    const result = applyAllInEdit(BASE_FEES, 1.0)
    expect(result.wrapperAssetFee).toBeCloseTo(0.01)
    expect(result.fundAssetFee).toBe(0)
    expect(result.contributionFee).toBe(0)
    expect(result.fixedMonthlyFee).toBe(0)
    expect(result.acquisitionCostPct).toBe(0)
    expect(result.pensionPayoutFeePct).toBe(0)
  })

  it('preserves total after switch from Einzelposten to all-in and back via fund edit', () => {
    // Step 1: switch to all-in at 1 % → FeeModel: wrapper=0.01, fund=0
    const afterAllIn = applyAllInEdit(BASE_FEES, 1.0)
    expect(afterAllIn.wrapperAssetFee + afterAllIn.fundAssetFee).toBeCloseTo(0.01)

    // Step 2: user switches back to Einzelposten (state unchanged) and edits
    // Fondskosten to 0.3 %. The total is still 1 % (wrapper=0.01, fund=0).
    const afterEdit = applyFundFeeEdit(afterAllIn, 0.3)
    expect(afterEdit.fundAssetFee).toBeCloseTo(0.003)
    expect(afterEdit.wrapperAssetFee).toBeCloseTo(0.007)
    expect(afterEdit.fundAssetFee + afterEdit.wrapperAssetFee).toBeCloseTo(0.01)
  })
})
