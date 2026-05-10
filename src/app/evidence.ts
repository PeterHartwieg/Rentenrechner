// Re-export barrel — canonical home is src/utils/evidence.ts.
// Engine and API layers import directly from src/utils/evidence to avoid
// upward app-layer dependencies.
export {
  lowestConfidence,
  PRODUCT_EVIDENCE_FIELDS,
  confidenceForResult,
  EVIDENCE_FIELD_GERMAN_LABELS,
  confidenceLanguage,
} from '../utils/evidence'
