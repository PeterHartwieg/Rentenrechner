import type { ProductResult } from '../../domain/results'
import type { ProductId } from '../../domain'
import { FeeDragChart } from '../results/FeeDragChart'
import { getProductMeta } from '../../engine/productRegistry'

interface Props {
  /** Engine result for this single contract at the selected scenario. */
  instanceResult: ProductResult | undefined
  /** Slot / canonical product id for the contract — drives the color swatch. */
  productId: ProductId
  /** Workspace retirement age (for the fee-drag horizon). */
  retirementAge: number
  /** Workspace retirement end age (for the comparison cap). */
  retirementEndAge: number
}

/**
 * Single-contract fee-impact viz for `/vertrag/:instanceId` (PR 9 plan §4).
 *
 * Thin wrapper over the shared `FeeDragChart`. The chart was originally a
 * cross-product surface in the legacy Vergleich pane; relocated here with a
 * one-row payload so each contract page shows its own
 * Nettoaufwand / Netto-Rendite / Gebühren stack.
 *
 * Renders nothing when there is no instance result yet (engine still running
 * or instance is surrendered without a payout path).
 */
export function VertragFeeImpact({
  instanceResult,
  productId,
  retirementAge,
  retirementEndAge,
}: Props) {
  if (!instanceResult) return null
  const meta = getProductMeta(productId)
  const productColors = meta ? { [productId]: meta.color } : {}
  return (
    <FeeDragChart
      selectedResults={[instanceResult]}
      productColors={productColors}
      retirementAge={retirementAge}
      retirementEndAge={retirementEndAge}
    />
  )
}
