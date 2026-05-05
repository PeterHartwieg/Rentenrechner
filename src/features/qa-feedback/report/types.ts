/**
 * Types for the QA-feedback ticket payload (issue 02 — Phase 1 Lane A).
 *
 * This module is React-free so the payload builder can be unit-tested with
 * Vitest only. Lane B (privacy redaction) extends `PrivacyFlags` and
 * `FeedbackReport.privacyFlags`. Lane D (workspace context capture) fills in
 * `scenarioContext` and `workspaceContext`. Both lanes append fields rather
 * than rewrite — keep new optional fields backward-compatible.
 */

/**
 * Stable, semantic, dot-separated English target id (DECISIONS §3).
 * Examples: `inputs.bav.employerSubsidy.label`, `results.breakEvenChart.legend.bav`.
 */
export type FeedbackTargetId = string

/**
 * Coverage classification of the resolved target. `exact` = the tester
 * clicked an instrumented element directly. `section` = the overlay
 * fell back to a nearby section-level container (PRD US-7).
 */
export type TargetPrecision = 'exact' | 'section' | 'unknown'

/**
 * High-level taxonomy aligned with PRD US-9 so maintainers can triage
 * incoming reports quickly.
 */
export type FeedbackType =
  | 'copy'
  | 'layout'
  | 'flow'
  | 'interaction'
  | 'value'
  | 'a11y'
  | 'other'

/**
 * Severity tracks the ticket-tracker label vocabulary so QA findings
 * get filed with consistent priority.
 */
export type Severity = 'blocker' | 'major' | 'minor' | 'nit'

/**
 * Privacy review state. Defaults are conservative: sensitive fields
 * are auto-redacted, scenario state is excluded, screenshot is included
 * only because the tester chose to attach one.
 *
 * Lane B will extend this with finer-grained flags (e.g. `localStorageIncluded`,
 * per-region masking metadata). Add new optional fields, never rename existing
 * ones — Lane B and downstream consumers depend on the names.
 */
export interface PrivacyFlags {
  /** True when `data-qa-sensitive` elements were redacted before screenshot capture. */
  sensitiveFieldsRedacted: boolean
  /** True when the tester opted into attaching scenario/share-link state (PRD US-19). */
  scenarioStateIncluded: boolean
  /** True when the report bundle includes a screenshot. */
  screenshotIncluded: boolean
}

/**
 * Selected target metadata captured at click time.
 */
export interface ResolvedTarget {
  id: FeedbackTargetId
  label?: string
  /** Plain-text content of the resolved element at the moment of selection. */
  visibleText?: string
  precision: TargetPrecision
}

/**
 * Environment context captured automatically at preview time
 * (PRD US-14, US-16, "Capture non-sensitive environment context").
 */
export interface EnvironmentContext {
  /** Pathname + search portion of the URL (without origin). */
  route: string
  /** ISO 8601 timestamp of when the report was assembled. */
  timestamp: string
  /** Viewport width × height in CSS pixels. */
  viewport: { width: number; height: number }
  /** "Chrome 120 / macOS"-style summary parsed from the user agent. */
  userAgentFamily: string
  /** App build identifier, e.g. from `import.meta.env.VITE_APP_BUILD`. */
  appBuild: string
}

/**
 * Optional workspace context (compare/combine view, active product tab, etc.).
 * Lane D fills this in. Keep optional so Lane A can ship without it.
 */
export interface WorkspaceContext {
  /** e.g. "compare" / "combine". */
  mode?: string
  /** e.g. "vergleich" / "angebot" / "details". */
  activeView?: string
  /** Active product id when known, e.g. "bav" / "etf". */
  activeProductId?: string
  /** Free-form breadcrumb when the tester is inside a modal or nested flow. */
  flow?: string
}

/**
 * Optional scenario/share-link state. Lane D fills this in. Phase 1 always
 * leaves it undefined; the privacy-flag opt-in lives in `PrivacyFlags`.
 */
export interface ScenarioContextSnapshot {
  shareUrl?: string
  scenarioJson?: string
}

/**
 * The screenshot artifact reference. The actual binary lives in the bundle
 * download — the report references it by file name so the markdown ticket is
 * self-describing without embedding base64.
 */
export interface ScreenshotRef {
  /** File name of the screenshot artifact in the export bundle. */
  fileName: string
  /** Optional rendered width × height of the captured image (px). */
  width?: number
  height?: number
}

/**
 * The full feedback report payload assembled by the composer/preview screen
 * before export. Consumed by `buildMarkdownTicket` and `generateTitle`.
 *
 * Lane B extends `privacyFlags`. Lane D extends `workspaceContext` and
 * `scenarioContext`. Both append, never rename — the names are the public
 * surface for downstream tooling (mailto/GitHub prefill in issue 08, etc.).
 */
export interface FeedbackReport {
  type: FeedbackType
  severity: Severity
  comment: string
  /** Tester's optional copy fix (PRD US-11). */
  suggestedText?: string
  target: ResolvedTarget
  environment: EnvironmentContext
  privacyFlags: PrivacyFlags
  screenshot?: ScreenshotRef
  workspaceContext?: WorkspaceContext
  scenarioContext?: ScenarioContextSnapshot
}
