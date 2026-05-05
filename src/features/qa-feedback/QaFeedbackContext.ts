import { createContext } from 'react'
import type { ResolvedTarget } from './report'

/**
 * Pinned target + cached bounding rect at the moment of selection. Stored
 * in the provider so the composer/preview can render the outline without
 * walking the DOM again.
 */
export interface QaPinState {
  target: ResolvedTarget
  rect: { top: number; left: number; width: number; height: number }
}

/**
 * Context value exposed to consumers via `useQaMode` / `useFeedbackTarget`.
 *
 * `pickTarget` is intentionally a callback: the overlay calls it from a
 * click handler, but `useFeedbackTarget` may also expose imperative
 * activation if Lane C/D need keyboard/voice paths later. Lane B/C/D should
 * not change this signature without a breaking-change note.
 */
export interface QaFeedbackContextValue {
  enabled: boolean
  pinned: QaPinState | null
  activate(): void
  deactivate(): void
  pickTarget(target: ResolvedTarget, rect: DOMRect): void
}

/**
 * Default value used when no provider is mounted (or QA mode is disabled).
 * `enabled: false` ensures consumers fall back to a no-op path even outside
 * the provider — `useFeedbackTarget` returns inert props in that case.
 */
const DEFAULT_VALUE: QaFeedbackContextValue = {
  enabled: false,
  pinned: null,
  activate() {
    /* no-op outside provider */
  },
  deactivate() {
    /* no-op outside provider */
  },
  pickTarget() {
    /* no-op outside provider */
  },
}

export const QaFeedbackContext = createContext<QaFeedbackContextValue>(DEFAULT_VALUE)
