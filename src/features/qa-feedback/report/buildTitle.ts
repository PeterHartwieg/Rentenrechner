import type { FeedbackReport, Severity } from './types'

const SEVERITY_PREFIX: Record<Severity, string> = {
  blocker: '[BLOCKER]',
  major: '[Major]',
  minor: '[Minor]',
  nit: '[Nit]',
}

const TYPE_LABEL: Record<FeedbackReport['type'], string> = {
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
 * Format: `[Severity] qa(type): <target id> — <comment summary>`
 *
 * Title generation is defensive — comment may be empty, target id may be
 * missing — so testers never end up with a "TypeError" instead of a ticket.
 * Truncates the comment summary so titles stay scannable in issue lists.
 */
export function generateTitle(report: FeedbackReport): string {
  const sev = SEVERITY_PREFIX[report.severity] ?? '[Minor]'
  const type = TYPE_LABEL[report.type] ?? 'other'
  const targetId = report.target?.id?.trim() || 'unknown.target'
  const summary = summarizeComment(report.comment)
  const tail = summary ? ` — ${summary}` : ''
  return `${sev} qa(${type}): ${targetId}${tail}`
}

function summarizeComment(comment: string | undefined): string {
  if (!comment) return ''
  // Collapse whitespace + line breaks so the title stays a single line.
  const flat = comment.replace(/\s+/g, ' ').trim()
  if (flat.length === 0) return ''
  const MAX = 80
  if (flat.length <= MAX) return flat
  return flat.slice(0, MAX - 1).trimEnd() + '…'
}
