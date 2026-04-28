import type { EtfAssumptions } from '../../domain/types'
import { inRange, isFiniteNumber } from '../../domain/validation/primitives'

const VALID_PARTIAL_EXEMPTIONS = [0, 0.15, 0.3, 0.6, 0.8] as const

export function validateEtf(etf: EtfAssumptions): boolean {
  if (!inRange(etf.annualAssetFee, 0, 0.5)) return false
  if (!isFiniteNumber(etf.equityPartialExemption)) return false
  return (VALID_PARTIAL_EXEMPTIONS as readonly number[]).includes(etf.equityPartialExemption)
}
