/**
 * collectWorkspaceContext — pure helper that assembles a WorkspaceContext
 * snapshot without touching engine or simulation code.
 *
 * Design constraints (Lane D / issue 05):
 *  - Must NOT import useCalculatorState or useSimulationResult.
 *  - Reads mode from localStorage via the same detectSavedMode() that
 *    useRoute already exposes — no new coupling.
 *  - activeView and activeProductId are passed in as arguments (the caller
 *    holds the live React state; we just format it).
 *  - flow is detected from the DOM: checks for an open [role="dialog"]
 *    ancestor of the pinned element, or for aria-expanded="true" containers.
 *  - Runs synchronously — no useEffect, no delayed state updates.
 */

import { detectSavedMode } from '../../../app/useRoute'
import type { WorkspaceContext } from '../report/types'

export interface WorkspaceContextInput {
  /** Workspace view active at the moment of capture, e.g. 'vergleich'. */
  activeView?: string
  /**
   * Active product tab id, if the caller can provide it without importing
   * engine code. Leave undefined when not readily available.
   * TODO(future): wire from workspace product-tab state once Group G instances land.
   */
  activeProductId?: string
  /**
   * Optional DOM element that is the pinned target. When provided the helper
   * walks up the DOM to find open modal / disclosure context.
   */
  pinnedElement?: Element | null
}

/**
 * Collect a WorkspaceContext snapshot.
 *
 * Pure in the functional sense: it reads from localStorage (via detectSavedMode)
 * and optionally from the DOM (for `flow` detection), but never writes anywhere.
 * Calling it does not trigger React rerenders.
 */
export function collectWorkspaceContext(input: WorkspaceContextInput = {}): WorkspaceContext {
  const { activeView, activeProductId, pinnedElement } = input

  // mode: read from localStorage without importing useCalculatorState.
  const savedMode = detectSavedMode()
  const mode: string | undefined =
    savedMode === 'compare' ? 'compare' : savedMode === 'combine' ? 'combine' : undefined

  // flow: best-effort DOM detection of an enclosing dialog or disclosure.
  const flow = detectFlow(pinnedElement ?? null)

  const ctx: WorkspaceContext = {}
  if (mode !== undefined) ctx.mode = mode
  if (activeView !== undefined) ctx.activeView = activeView
  if (activeProductId !== undefined) ctx.activeProductId = activeProductId
  if (flow !== undefined) ctx.flow = flow

  return ctx
}

/**
 * Walk from `el` toward the document root looking for:
 *   1. An ancestor with `role="dialog"` (modal / panel).
 *   2. An ancestor with `aria-expanded="true"` (accordion / disclosure).
 *
 * Returns the first matching context label, or undefined when nothing is found.
 */
function detectFlow(el: Element | null): string | undefined {
  if (!el || typeof document === 'undefined') return undefined

  let node: Element | null = el
  while (node && node !== document.documentElement) {
    // Skip the QA overlay itself (it has data-qa-overlay).
    if (node.hasAttribute('data-qa-overlay')) {
      node = node.parentElement
      continue
    }

    const role = node.getAttribute('role')
    if (role === 'dialog') {
      // Only use aria-label (static, author-controlled) as the breadcrumb.
      // aria-labelledby is an IDREF that resolves to arbitrary DOM text, which
      // may contain private user data — never dereference it here.
      const label = node.getAttribute('aria-label')
      if (label && label.trim()) {
        return `dialog: ${label.trim()}`
      }
      return 'dialog'
    }

    if (node.getAttribute('aria-expanded') === 'true') {
      const label = node.getAttribute('aria-label')
      return label ? `disclosure: ${label.trim()}` : 'disclosure'
    }

    node = node.parentElement
  }

  return undefined
}
