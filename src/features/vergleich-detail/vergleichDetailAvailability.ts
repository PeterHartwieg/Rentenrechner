import type { ProductId } from '../../domain'
import {
  productAvailabilityCopy,
  type AvailabilityContext,
  type AvailabilityEntry,
} from '../../content/productAvailabilityCopy'

/**
 * Resolve the "Verfügbar ab" footer copy for a given product id (PR 10).
 *
 * Pure, framework-agnostic. `productAvailabilityCopy` is typed as
 * `Record<ProductId, AvailabilityRegistryValue>`, so adding a new product to
 * `ProductId` forces a matching key in the map — the exhaustiveness
 * invariant is preserved at the type-system layer (registry-driven), not by
 * a hand-written switch body. PR 290 CodeRabbit Minor fix.
 *
 * The `ctx` argument is consumed only by registry entries that need
 * scenario-dependent dispatch (currently `versicherung`, whose minimum
 * payout age depends on `contractStartYear` per §52 Abs. 28 Satz 7 EStG).
 * Static entries ignore the context — the resolver checks `typeof entry ===
 * 'function'` and forwards the context only when the registry value is a
 * function. PR 290 Codex P2 fix.
 */
export function getAvailabilityEntry(
  productId: ProductId,
  ctx: AvailabilityContext,
): AvailabilityEntry {
  const entry = productAvailabilityCopy[productId]
  return typeof entry === 'function' ? entry(ctx) : entry
}
