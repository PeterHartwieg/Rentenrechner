import { useContext } from 'react'
import { QaFeedbackContext } from './QaFeedbackContext'

/**
 * Read the current QA-mode flag and access activate/deactivate primitives.
 *
 * Outside of `QaFeedbackProvider` this returns `enabled: false` and no-op
 * activate/deactivate functions, so callers can use the hook unconditionally
 * (e.g. in shared UI primitives) without checking provider mounting.
 */
export function useQaMode(): {
  enabled: boolean
  activate(): void
  deactivate(): void
} {
  const ctx = useContext(QaFeedbackContext)
  return {
    enabled: ctx.enabled,
    activate: ctx.activate,
    deactivate: ctx.deactivate,
  }
}
