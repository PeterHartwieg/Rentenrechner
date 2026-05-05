/**
 * React-free public API of the QA-feedback report builder.
 *
 * Lanes B/C/D import from this entry point so they never accidentally pull
 * a React dependency into the payload module. Keep this file the only
 * re-exporter for consumers outside the qa-feedback feature folder.
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
} from './types'

export { buildMarkdownTicket, defaultPrivacyFlags } from './buildMarkdown'
export { computeHeadlinePreview, generateTitle } from './buildTitle'
