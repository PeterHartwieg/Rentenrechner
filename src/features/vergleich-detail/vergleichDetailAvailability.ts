import type { ProductId } from '../../domain'
import {
  productAvailabilityCopy,
  type AvailabilityEntry,
} from '../../content/productAvailabilityCopy'

/**
 * Resolve the "Verfügbar ab" footer copy for a given product id (PR 10).
 *
 * Pure, framework-agnostic. `productAvailabilityCopy` is typed as
 * `Record<ProductId, AvailabilityEntry>`, so adding a new product to
 * `ProductId` forces a matching key in the map — the exhaustiveness
 * invariant is preserved at the type-system layer (registry-driven), not by
 * a hand-written switch body. PR 290 CodeRabbit Minor fix.
 */
export function getAvailabilityEntry(productId: ProductId): AvailabilityEntry {
  return productAvailabilityCopy[productId]
}
