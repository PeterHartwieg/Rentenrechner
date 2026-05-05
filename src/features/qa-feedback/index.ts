/**
 * QA feedback mode — Phase 1 Lane A public API.
 *
 * Lanes B (privacy redaction), C (a11y/mobile composer), and D (workspace
 * context capture) consume the names below. Treat any rename as a breaking
 * change and update Lane B/C/D in the same commit.
 */

/**
 * Top-level provider that wraps the calculator. Mounts the overlay,
 * composer, and preview only when QA mode is active. Inert when disabled
 * (PRD US-33).
 */
export { QaFeedbackProvider, QA_SESSION_KEY } from './QaFeedbackProvider'

/**
 * Persistent "QA-Modus aktiv" chip. Render anywhere in the app shell;
 * hides itself when QA mode is disabled.
 */
export { QaModeIndicator } from './QaModeIndicator'

/**
 * Read the QA-mode flag and access activate/deactivate primitives. Safe to
 * call outside the provider (returns `enabled: false`).
 */
export { useQaMode } from './useQaMode'

/**
 * Register a component as a feedback target. Returns `targetProps` to
 * spread onto the host element. Empty when QA mode is disabled.
 */
export { useFeedbackTarget } from './useFeedbackTarget'
export type { FeedbackTargetProps, FeedbackTargetSpec } from './useFeedbackTarget'

/**
 * React-free report payload contracts. Re-exported so consumers don't have
 * to deep-import the `report/` submodule. The names here MUST stay stable —
 * they are the contract Lanes B/C/D extend.
 */
export type {
  EnvironmentContext,
  FeedbackReport,
  FeedbackTargetId,
  FeedbackType,
  PrivacyFlags,
  ResolvedTarget,
  ScenarioContextSnapshot,
  ScreenshotRef,
  Severity,
  TargetPrecision,
  WorkspaceContext,
} from './report'

export { buildMarkdownTicket, defaultPrivacyFlags, generateTitle } from './report'

/**
 * Lane D: workspace context bridge.
 *
 * The app shell calls `setQaWorkspaceContext` in a tiny useEffect whenever the
 * active view changes. The QA module reads it at report-assembly time only —
 * no simulation rerenders, no React coupling.
 *
 * Example (app shell):
 *   import { setQaWorkspaceContext } from 'src/features/qa-feedback'
 *   useEffect(() => { setQaWorkspaceContext({ activeView }); }, [activeView]);
 */
export { setQaWorkspaceContext } from './context/workspaceContextRef'

/**
 * Lane E: single-file feedback bundle export (issue 07).
 *
 * `buildFeedbackBundle` assembles a JSON-envelope bundle containing the
 * Markdown ticket, the full FeedbackReport, and the screenshot blob (when
 * included). Pass the returned `{ blob, filename }` to `triggerBlobDownload`
 * or any download helper.
 *
 * React-free — safe to call from any context.
 */
export { buildFeedbackBundle } from './export/bundleExport'
export type { BundleInput, FeedbackBundle } from './export/bundleExport'

/**
 * Lane F: prefilled outbound destination helpers (issue 08).
 *
 * `buildMailtoUrl` produces a `mailto:` URL with the ticket as the body.
 * `buildGithubIssueUrl` produces a GitHub new-issue prefill URL.
 *
 * Both helpers build URLs only — no fetch, no XHR, no auth.
 * Pass the returned URL to `window.open(url, '_blank', 'noopener,noreferrer')`.
 *
 * React-free — safe to call from any context.
 */
export { buildMailtoUrl, buildGithubIssueUrl } from './export/outboundDestinations'
export type { MailtoOptions, GithubIssueOptions } from './export/outboundDestinations'
