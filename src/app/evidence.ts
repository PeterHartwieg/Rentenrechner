/**
 * Evidence helpers (Group G issue 09).
 *
 * Pure, no React imports. Consumed by the engine integration layer and UI
 * components that render confidence badges.
 */

import type { EvidenceState } from '../domain/instances'
import type { ProductResult } from '../domain/results'

// ---------------------------------------------------------------------------
// lowestConfidence
// ---------------------------------------------------------------------------

/**
 * Returns the lowest confidence tier across the given field paths.
 *
 * - Missing keys (never set by user) → `'model_estimate'`.
 * - `'statement'` counts as confirmed (highest tier).
 * - Returns `'model_estimate'` if ANY path is unconfirmed.
 */
export function lowestConfidence(
  evidenceMap: Record<string, EvidenceState>,
  fieldPaths: string[],
): EvidenceState {
  for (const path of fieldPaths) {
    const state = evidenceMap[path]
    if (state === undefined || state === 'model_estimate') {
      return 'model_estimate'
    }
  }
  return 'user_confirmed'
}

// ---------------------------------------------------------------------------
// Per-product field lists
// ---------------------------------------------------------------------------

/**
 * Fields consumed by each product's simulator that affect accumulation and
 * payout numbers. Conservative: include any field the simulator reads.
 *
 * These are the `InstanceCommon` + product-specific field names stored in
 * `evidenceMap` by the wizard.
 */
const PRODUCT_EVIDENCE_FIELDS: Record<string, string[]> = {
  etf: ['monthlyContribution', 'annualAssetFee'],
  bav: [
    'monthlyGrossConversion',
    'fees.wrapperAssetFee',
    'fees.fundAssetFee',
    'fees.acquisitionCostPct',
    'fees.pensionPayoutFeePct',
    'monthlyEmployerMatch',
    'durchfuehrungsweg',
    'pre2005EligibleTaxFree',
    'rentenfaktor',
    'payoutMode',
  ],
  versicherung: [
    'monthlyContribution',
    'fees.wrapperAssetFee',
    'fees.fundAssetFee',
    'fees.acquisitionCostPct',
    'fees.pensionPayoutFeePct',
    'rentenfaktor',
    'payoutMode',
    'contractStartYear',
  ],
  basisrente: [
    'monthlyGrossContribution',
    'fees.wrapperAssetFee',
    'fees.fundAssetFee',
    'fees.pensionPayoutFeePct',
    'rentenfaktor',
  ],
  altersvorsorgedepot: [
    'monthlyOwnContribution',
    'fees.wrapperAssetFee',
    'fees.fundAssetFee',
    'subtype',
  ],
  riester: [
    'monthlyOwnContribution',
    'fees.wrapperAssetFee',
    'fees.fundAssetFee',
    'rentenfaktor',
    'payoutMode',
  ],
}

// ---------------------------------------------------------------------------
// confidenceForResult
// ---------------------------------------------------------------------------

/**
 * Derives the input confidence for a `ProductResult` based on which fields
 * the simulator consumed from the instance's `evidenceMap`.
 *
 * When the instance has no `evidenceMap` (legacy or undefined), all fields
 * default to `'model_estimate'`, so the result is always `'model_estimate'`.
 */
export function confidenceForResult(
  result: Pick<ProductResult, 'productId'>,
  evidenceMap: Record<string, EvidenceState>,
): EvidenceState {
  const fields = PRODUCT_EVIDENCE_FIELDS[result.productId] ?? []
  if (fields.length === 0) return 'model_estimate'
  return lowestConfidence(evidenceMap, fields)
}

// ---------------------------------------------------------------------------
// confidenceLanguage — forward-compat for issue 12 recommender card
// ---------------------------------------------------------------------------

/**
 * Returns conditional language prefix for the recommender card (issue 12).
 *
 * `'model_estimate'` → hedged language ("auf deinen Schätzungen ergibt sich").
 * `'user_confirmed'` / `'statement'` → direct language ("ergibt sich").
 */
export function confidenceLanguage(state: EvidenceState): { prefix: string } {
  if (state === 'model_estimate') {
    return { prefix: 'auf deinen Schätzungen ergibt sich' }
  }
  return { prefix: 'ergibt sich' }
}
