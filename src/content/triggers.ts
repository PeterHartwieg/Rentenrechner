/**
 * Product groupings shared between the InventoryWizard product checklist and
 * the compare-mode ComparisonPicker. Pure content + types — no React, no
 * engine imports.
 *
 * Adjust the primary/secondary split here, not in component code.
 */

import type { ProductId } from '../domain'

/**
 * Product groupings for the comparison picker. PRIMARY products show on the
 * always-visible chip row; SECONDARY products live behind a "Weitere
 * Produkte" disclosure.
 */
export const PRIMARY_PRODUCT_IDS: readonly ProductId[] = ['etf', 'bav', 'versicherung'] as const
export const SECONDARY_PRODUCT_IDS: readonly ProductId[] = [
  'basisrente',
  'altersvorsorgedepot',
  'riester',
] as const
