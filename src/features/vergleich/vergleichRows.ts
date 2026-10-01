import type { ProductId } from '../../domain'
import type { ProductResult } from '../../domain/results'
import { getProductMeta } from '../../engine/productRegistry'
import { availableRiy } from '../results/riyAvailability'

// ---------------------------------------------------------------------------
// VergleichTableRow + builder — pure, React-free. Lives in its own module so
// the component file remains "components only" (react-refresh constraint).
// ---------------------------------------------------------------------------

export interface VergleichTableRow {
  /** Stable id (the canonical ProductId from `PRODUCT_REGISTRY`). */
  productId: ProductId
  /** Long display label, e.g. "Private Rentenversicherung". */
  label: string
  /** Compact monospace tag, e.g. "ETF", "BAV". */
  shortLabel: string
  /** Capital available at retirement (engine: `capitalAtRetirement`). */
  capitalAtRetirement: number
  /**
   * Effektivkosten p. a. (decimal — e.g. 0.012 for 1.2 %). `undefined` when
   * the engine's RIY is not presentable (`availableRiy`): a legacy zero next
   * to positive `totalFees` must not read as a cost-free product.
   */
  effectiveAnnualCost: number | undefined
  /** Gross monthly payout before tax + KV/PV. */
  grossMonthlyPayout: number
  /** Monthly deductions = gross − net. */
  deductionsMonthly: number
  /** Net monthly payout after tax + KV/PV. */
  netMonthlyPayout: number
}

/**
 * Build a `VergleichTableRow` from a `ProductResult`. The mapping is intentionally
 * narrow: the table consumes only six engine-derived figures plus the registry
 * metadata. Effektivkosten p.a. is the `accumulationRiy` decimal (already in
 * fractional form), gated through `availableRiy` so a zero RIY with fees
 * charged surfaces as unavailable. `getProductMeta` may return `undefined` even when the
 * product id is known — null-guard at the call site (see CLAUDE.md "Non-obvious
 * architecture").
 */
export function rowFromResult(result: ProductResult): VergleichTableRow | null {
  const meta = getProductMeta(result.productId)
  if (!meta) return null
  return {
    productId: result.productId,
    label: meta.label,
    shortLabel: meta.shortLabel,
    capitalAtRetirement: result.capitalAtRetirement,
    effectiveAnnualCost: availableRiy(result),
    grossMonthlyPayout: result.grossMonthlyPayout,
    deductionsMonthly: Math.max(0, result.grossMonthlyPayout - result.netMonthlyPayout),
    netMonthlyPayout: result.netMonthlyPayout,
  }
}
