import type { FeedbackReport, FeedbackType, Severity } from './types'

const SEVERITY_PREFIX: Record<Severity, string> = {
  blocker: '[BLOCKER]',
  major: '[Major]',
  minor: '[Minor]',
  nit: '[Nit]',
}

const TYPE_LABEL: Record<FeedbackType, string> = {
  copy: 'copy',
  layout: 'layout',
  flow: 'flow',
  interaction: 'interaction',
  value: 'value',
  a11y: 'a11y',
  other: 'other',
}

/**
 * Build a one-line title for the QA-feedback ticket.
 *
 * Format: `[Severity] qa(type): <target label or id>`
 *
 * The tester's comment belongs in the ticket body only — it must not
 * appear in the title. Using severity + type + target gives a structured,
 * scannable headline without requiring testers to write good titles manually.
 *
 * Title generation is defensive — target id may be missing — so testers
 * never end up with a "TypeError" instead of a ticket.
 */
export function generateTitle(report: FeedbackReport): string {
  const sev = SEVERITY_PREFIX[report.severity] ?? '[Minor]'
  const type = TYPE_LABEL[report.type] ?? 'other'
  const target = report.target?.label?.trim() || report.target?.id?.trim() || 'unknown.target'
  return `${sev} qa(${type}): ${target}`
}

/**
 * Compute the panel headline preview string from the current draft fields and
 * the pinned target. Mirrors `generateTitle` but accepts raw draft values so
 * the composer can show the preview before a full `FeedbackReport` is assembled.
 *
 * Returns `null` when the type or severity are not yet set (shouldn't happen
 * in practice since both have defaults, but left as a safety guard).
 */
export function computeHeadlinePreview(
  severity: Severity | null | undefined,
  type: FeedbackType | null | undefined,
  targetLabel: string | undefined,
  targetId: string | undefined,
): string | null {
  if (!severity || !type) return null
  const sev = SEVERITY_PREFIX[severity] ?? '[Minor]'
  const typeStr = TYPE_LABEL[type] ?? 'other'
  const target = targetLabel?.trim() || targetId?.trim() || 'unknown.target'
  return `${sev} qa(${typeStr}): ${target}`
}
