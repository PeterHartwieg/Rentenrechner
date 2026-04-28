// Primitive validation guards shared by all product validators and the top-level scenarioSchema.

import type { FeeModel } from '../types'

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function inRange(v: unknown, min: number, max: number): v is number {
  return isFiniteNumber(v) && v >= min && v <= max
}

export function isInt(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v)
}

export function intInRange(v: unknown, min: number, max: number): v is number {
  return isInt(v) && v >= min && v <= max
}

export function validateFees(fees: FeeModel): boolean {
  return (
    inRange(fees.wrapperAssetFee, 0, 0.5) &&
    inRange(fees.fundAssetFee, 0, 0.5) &&
    inRange(fees.pensionPayoutFeePct, 0, 0.5) &&
    inRange(fees.contributionFee, 0, 0.5) &&
    inRange(fees.fixedMonthlyFee, 0, 1_000_000) &&
    inRange(fees.acquisitionCostPct, 0, 0.5) &&
    intInRange(fees.acquisitionCostSpreadYears, 1, 50)
  )
}
