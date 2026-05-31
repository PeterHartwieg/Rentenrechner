/**
 * Public entry point for the copy catalog.
 *
 *     import { copy } from '@/content/copy'   // accessor for UI code
 *
 * Tooling (CLI / editor / tests) also reaches in for the lower-level helpers.
 */
export type { CopyEntry, CopyRisk, CopyLang, CopySurface } from './types'
export { copy, createCopyAccessor, allCopyEntries } from './catalog'
export type { CopyAccessor, CreateCopyAccessorOptions } from './catalog'
export {
  COPY_RISKS,
  COPY_KEY_PATTERN,
  HIGH_RISK_TIERS,
  isHighRiskTier,
  structuralIssues,
  policyIssues,
} from './validate'
export type { CopyIssue, CopyIssueLevel } from './validate'
export { buildTranslationReport, formatTranslationReport } from './bilingual'
export type { TranslationReport, MissingTranslation } from './bilingual'
