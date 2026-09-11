/**
 * Pure helpers over `FeeModel` shared by `FeeSection` and the inventory cards.
 * Kept out of the component file so react-refresh keeps working.
 */
import type { FeeModel } from '../../../domain'
import { formatCurrency, formatPercent } from '../../../utils/format'

/**
 * True when the model carries charges beyond the two asset fees (fixed,
 * per-contribution, acquisition, payout). In that case wrapper + fund is only
 * the ongoing asset charge, not the quoted all-in Effektivkosten.
 */
export function hasNonAssetFees(fees: FeeModel): boolean {
  return (
    fees.fixedMonthlyFee > 0 ||
    fees.contributionFee > 0 ||
    fees.acquisitionCostPct > 0 ||
    fees.pensionPayoutFeePct > 0
  )
}

/** Short German list of the non-asset charges present, for the all-in note. */
export function describeNonAssetFees(fees: FeeModel): string {
  const parts: string[] = []
  if (fees.fixedMonthlyFee > 0) parts.push(`Fixkosten ${formatCurrency(fees.fixedMonthlyFee, 2)}/Monat`)
  if (fees.contributionFee > 0) parts.push(`Kosten je Beitrag ${formatPercent(fees.contributionFee)}`)
  if (fees.acquisitionCostPct > 0) parts.push(`Abschlusskosten ${formatPercent(fees.acquisitionCostPct)}`)
  if (fees.pensionPayoutFeePct > 0) parts.push(`Auszahlungsgebühr ${formatPercent(fees.pensionPayoutFeePct)}`)
  return parts.join(', ')
}
