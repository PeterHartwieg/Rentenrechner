import type {
  FeedbackReport,
  FeedbackType,
  PrivacyFlags,
  Severity,
} from './types'
import { generateTitle } from './buildTitle'

const TYPE_HEADING: Record<FeedbackType, string> = {
  copy: 'Copy',
  layout: 'Layout',
  flow: 'Flow',
  interaction: 'Interaction',
  value: 'Value',
  a11y: 'Accessibility',
  other: 'Other',
}

const SEVERITY_HEADING: Record<Severity, string> = {
  blocker: 'Blocker',
  major: 'Major',
  minor: 'Minor',
  nit: 'Nit',
}

/**
 * Build a Markdown ticket payload for the QA-feedback report.
 *
 * The output is a self-contained Markdown document with:
 *   - title (from `generateTitle`)
 *   - target metadata (id, label, precision, visible text)
 *   - tester comment + optional suggested replacement text
 *   - environment context (route, viewport, browser, build, timestamp)
 *   - privacy flags
 *   - screenshot reference (rendered as a placeholder so a Markdown viewer can
 *     resolve it from the bundle download)
 *
 * **No network access.** This function is a pure string builder — no fetch,
 * no clipboard, no DOM. Tests assert this explicitly.
 *
 * Optional fields (`suggestedText`, `target.label`, `screenshot`,
 * `workspaceContext`, `scenarioContext`) are omitted from the output rather
 * than emitted as empty rows so the ticket stays readable.
 */
export function buildMarkdownTicket(report: FeedbackReport): string {
  const title = generateTitle(report)
  const lines: string[] = []

  lines.push(`# ${title}`)
  lines.push('')

  // Header table — quick triage block at the top.
  lines.push('| Field | Value |')
  lines.push('| --- | --- |')
  lines.push(`| Type | ${TYPE_HEADING[report.type]} |`)
  lines.push(`| Severity | ${SEVERITY_HEADING[report.severity]} |`)
  lines.push(`| Target id | \`${escapeInlineCode(report.target.id)}\` |`)
  lines.push(`| Precision | ${report.target.precision} |`)
  if (report.target.label) {
    lines.push(`| Target label | ${escapePipe(report.target.label)} |`)
  }
  lines.push(`| Route | ${escapePipe(report.environment.route)} |`)
  lines.push(
    `| Viewport | ${report.environment.viewport.width}×${report.environment.viewport.height} |`,
  )
  lines.push(`| Browser | ${escapePipe(report.environment.userAgentFamily)} |`)
  lines.push(`| App build | ${escapePipe(report.environment.appBuild)} |`)
  lines.push(`| Timestamp | ${report.environment.timestamp} |`)
  lines.push('')

  // Comment section (always present).
  lines.push('## Tester comment')
  lines.push('')
  lines.push(report.comment.trim().length > 0 ? report.comment.trim() : '_(empty)_')
  lines.push('')

  // Visible text capture so developers can grep for the exact string (PRD US-12).
  if (report.target.visibleText && report.target.visibleText.trim().length > 0) {
    lines.push('## Visible text at selection')
    lines.push('')
    lines.push('```')
    lines.push(report.target.visibleText.trim())
    lines.push('```')
    lines.push('')
  }

  // Suggested replacement copy (PRD US-11).
  if (report.suggestedText && report.suggestedText.trim().length > 0) {
    lines.push('## Suggested replacement')
    lines.push('')
    lines.push('```')
    lines.push(report.suggestedText.trim())
    lines.push('```')
    lines.push('')
  }

  // Workspace context (Lane D will populate; emit only when present).
  if (
    report.workspaceContext &&
    Object.values(report.workspaceContext).some((v) => v !== undefined && v !== '')
  ) {
    lines.push('## Workspace context')
    lines.push('')
    if (report.workspaceContext.mode) lines.push(`- Mode: \`${report.workspaceContext.mode}\``)
    if (report.workspaceContext.activeView)
      lines.push(`- Active view: \`${report.workspaceContext.activeView}\``)
    if (report.workspaceContext.activeProductId)
      lines.push(`- Active product: \`${report.workspaceContext.activeProductId}\``)
    if (report.workspaceContext.flow) lines.push(`- Flow: ${report.workspaceContext.flow}`)
    lines.push('')
  }

  // Privacy flags (always emitted — maintainers need to see whether scenario
  // state or screenshots were intentionally included; PRD US-29).
  lines.push('## Privacy flags')
  lines.push('')
  lines.push(formatPrivacyFlag('Sensitive fields redacted', report.privacyFlags.sensitiveFieldsRedacted))
  lines.push(formatPrivacyFlag('Scenario state included', report.privacyFlags.scenarioStateIncluded))
  lines.push(formatPrivacyFlag('Screenshot included', report.privacyFlags.screenshotIncluded))
  lines.push('')

  // Scenario state opt-in (Lane D may populate). Phase 1 leaves this off.
  if (report.scenarioContext) {
    if (report.scenarioContext.shareUrl) {
      lines.push('## Scenario share URL')
      lines.push('')
      lines.push(`<${report.scenarioContext.shareUrl}>`)
      lines.push('')
    }
    if (report.scenarioContext.scenarioJson) {
      lines.push('## Scenario JSON')
      lines.push('')
      lines.push('```json')
      lines.push(report.scenarioContext.scenarioJson)
      lines.push('```')
      lines.push('')
    }
  }

  // Screenshot reference. Issue 07 (Lane E) replaces the inline placeholder
  // with a real bundle attachment; for Phase 1 the file ships alongside
  // the markdown via a separate download.
  if (report.screenshot) {
    lines.push('## Screenshot')
    lines.push('')
    const dims =
      report.screenshot.width && report.screenshot.height
        ? ` (${report.screenshot.width}×${report.screenshot.height})`
        : ''
    lines.push(`![${escapeAlt(report.screenshot.fileName)}${dims}](./${report.screenshot.fileName})`)
    lines.push('')
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function formatPrivacyFlag(label: string, value: boolean): string {
  return `- ${label}: **${value ? 'yes' : 'no'}**`
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, '\\|')
}

function escapeInlineCode(value: string): string {
  return value.replace(/`/g, '\\`')
}

function escapeAlt(value: string): string {
  return value.replace(/[[\]]/g, '')
}

/**
 * Default privacy flags for a fresh draft: redaction on, scenario data off,
 * screenshot inclusion driven by whether the tester captured one.
 */
export function defaultPrivacyFlags(screenshotIncluded: boolean): PrivacyFlags {
  return {
    sensitiveFieldsRedacted: true,
    scenarioStateIncluded: false,
    screenshotIncluded,
  }
}
