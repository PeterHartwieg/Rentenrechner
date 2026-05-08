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
 * State for the intercept dialog that fires when a tester clicks the same
 * interactive element twice in a row during a QA session.
 */
export interface QaInterceptState {
  /** The resolved target metadata (id, label, etc.). */
  target: ResolvedTarget
  /** Live reference to the DOM element — used to re-fire the click. */
  element: HTMLElement
}

/**
 * Context value exposed to consumers via `useQaMode` / `useFeedbackTarget`.
 *
 * `pickTarget` is intentionally a callback: the overlay calls it from a
 * click handler, but `useFeedbackTarget` may also expose imperative
 * activation if Lane C/D need keyboard/voice paths later. Lane B/C/D should
 * not change this signature without a breaking-change note.
 *
 * `pickTarget` now also accepts the live `element` reference so the intercept
 * dialog can re-fire the original click after QA mode is deactivated.
 */
export interface QaFeedbackContextValue {
  enabled: boolean
  pinned: QaPinState | null
  /** Non-null when the intercept dialog should be shown (second same-id pin). */
  intercept: QaInterceptState | null
  activate(): void
  deactivate(): void
  pickTarget(target: ResolvedTarget, rect: DOMRect, element: HTMLElement): void
  /** Dismiss the intercept dialog without changing anything (× / Esc). */
  dismissIntercept(): void
  /** Open the composer normally for the intercepted target. */
  proceedWithComposer(): void
  /** Deactivate QA mode and re-fire the stored element click. */
  exitAndNavigate(): void
}

/**
 * Default value used when no provider is mounted (or QA mode is disabled).
 * `enabled: false` ensures consumers fall back to a no-op path even outside
 * the provider — `useFeedbackTarget` returns inert props in that case.
 */
const DEFAULT_VALUE: QaFeedbackContextValue = {
  enabled: false,
  pinned: null,
  intercept: null,
  activate() {
    /* no-op outside provider */
  },
  deactivate() {
    /* no-op outside provider */
  },
  pickTarget() {
    /* no-op outside provider */
  },
  dismissIntercept() {
    /* no-op outside provider */
  },
  proceedWithComposer() {
    /* no-op outside provider */
  },
  exitAndNavigate() {
    /* no-op outside provider */
  },
}

export const QaFeedbackContext = createContext<QaFeedbackContextValue>(DEFAULT_VALUE)
