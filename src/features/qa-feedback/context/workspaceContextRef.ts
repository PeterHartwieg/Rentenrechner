/**
 * Global mutable ref holding the latest workspace context snapshot supplied
 * by the app shell. Using a plain ref (not React state) avoids triggering
 * simulation rerenders — the QA module reads it at report-assembly time only.
 *
 * Preferred over a React context wrapper in App.tsx to keep App.tsx untouched
 * and coupling minimal (DECISIONS §8 / CLAUDE.md "Backend boundary").
 *
 * Usage:
 *   // App shell (one tiny useEffect, no restructuring):
 *   useEffect(() => { setQaWorkspaceContext({ activeView }); }, [activeView]);
 *
 *   // QaFeedbackProvider:
 *   const ctx = getQaWorkspaceContext();
 */

import type { WorkspaceContextInput } from './collectWorkspaceContext'

let _current: WorkspaceContextInput = {}

/** Write the latest workspace snapshot. Called from the app shell. */
export function setQaWorkspaceContext(ctx: WorkspaceContextInput): void {
  _current = ctx
}

/** Read the latest snapshot. Called at report-assembly time. */
export function getQaWorkspaceContext(): WorkspaceContextInput {
  return _current
}
