/**
 * Evidence helpers — re-export barrel.
 *
 * The implementation has moved to `src/utils/evidence.ts` so that engine and
 * API modules can import from it without creating an upward `engine → app`
 * dependency. This barrel keeps backward-compat for all existing `src/app/`
 * callers.
 */
export {
  lowestConfidence,
  PRODUCT_EVIDENCE_FIELDS,
  confidenceForResult,
  EVIDENCE_FIELD_GERMAN_LABELS,
  confidenceLanguage,
} from '../utils/evidence'
