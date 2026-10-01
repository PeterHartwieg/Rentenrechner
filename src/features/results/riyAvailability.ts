import type { ProductResult } from '../../domain'

/** A zero RIY is not evidence of zero costs when the projection charged fees. */
export function availableRiy(result: Pick<ProductResult, 'accumulationRiy' | 'totalFees'> | undefined): number | undefined {
  if (!result || !Number.isFinite(result.accumulationRiy)) return undefined
  if (result.accumulationRiy <= 0 && result.totalFees > 0) return undefined
  return result.accumulationRiy
}

export const RIY_UNAVAILABLE = 'Nicht ermittelbar'
export const RIY_UNAVAILABLE_REASON = 'Es fallen Kosten an. Für diesen Zahlungsverlauf lässt sich die Renditeminderung nicht verlässlich ausweisen; 0 % würde Kostenfreiheit suggerieren.'
