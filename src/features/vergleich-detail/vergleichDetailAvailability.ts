import type { ProductId } from '../../domain'
import {
  productAvailabilityCopy,
  type AvailabilityEntry,
} from '../../content/productAvailabilityCopy'

/**
 * Resolve the "Verfügbar ab" footer copy for a given product id (PR 10).
 *
 * Pure, framework-agnostic. The switch is exhaustive over `ProductId` so a
 * future seventh product surfaces a type error at the `_exhaustive: never`
 * default branch, forcing both the registry copy file *and* this helper to be
 * updated together.
 */
export function getAvailabilityEntry(productId: ProductId): AvailabilityEntry {
  switch (productId) {
    case 'etf':
    case 'bav':
    case 'versicherung':
    case 'basisrente':
    case 'altersvorsorgedepot':
    case 'riester':
      return productAvailabilityCopy[productId]
    default: {
      const _exhaustive: never = productId
      return _exhaustive
    }
  }
}
