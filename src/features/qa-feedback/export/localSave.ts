/**
 * Local-save export adapter — issue 14.
 *
 * Takes a `FeedbackReport` + an optional captured screenshot and writes them
 * as files to the tester's locally-selected directory via the File System
 * Access API.
 *
 * ## What gets written
 *
 * For each save operation two files may be written:
 *
 *   1. `qa-<ISO-timestamp>-<target-slug>.md`
 *      Issue-tracker Markdown with YAML-style frontmatter (Status, Type,
 *      Priority, Parent) followed by the full `buildMarkdownTicket` body.
 *
 *   2. `qa-<ISO-timestamp>-<target-slug>-screenshot.png`  (only when included)
 *      The raw PNG bytes decoded from `CapturedScreenshot.dataUrl`.
 *
 * ## Filename rationale
 *
 * The `qa-<timestamp>-<slug>` prefix mirrors the project's existing
 * `bundleExport.ts` convention (`CLAUDE.md`: "Filenames stay ASCII"). The `.md`
 * extension makes the file immediately openable by VS Code / the issue tracker.
 *
 * ## No network
 *
 * No fetch, no XHR. All writes go through `localDirectoryHandle.ts`.
 */

import type { FeedbackReport, FeedbackType, Severity } from '../report/types'
import { buildMarkdownTicket } from '../report/buildMarkdown'
import type { CapturedScreenshot } from '../capture/screenshot'
import {
  acquireReportsDirectory,
  saveBinaryToDirectory,
  saveToDirectory,
} from './localDirectoryHandle'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface LocalSaveInput {
  report: FeedbackReport
  /**
   * The captured screenshot. Pass the full `CapturedScreenshot` object so
   * the adapter can decode the PNG bytes. The screenshot is only written
   * when `report.screenshot` is set (i.e. the tester opted to include it).
   */
  screenshot: CapturedScreenshot | null
}

export interface LocalSaveResult {
  /** Path-relative name of the written Markdown file. */
  mdFilename: string
  /** Path-relative name of the written PNG file, when applicable. */
  pngFilename?: string
}

// ─── Main export helper ────────────────────────────────────────────────────────

/**
 * Save a QA issue report to the locally-selected directory.
 *
 * On first call per session, `acquireReportsDirectory()` shows the native
 * directory picker and caches the handle. Subsequent calls write directly.
 *
 * Returns the filenames written so the caller can surface them in the UI.
 * Throws on picker cancellation or file write failure — callers should catch
 * and report to the tester.
 */
export async function saveReportLocally(input: LocalSaveInput): Promise<LocalSaveResult> {
  const { report, screenshot } = input

  const handle = await acquireReportsDirectory()

  const base = buildIssueFilenameBase(report)
  const mdFilename = `${base}.md`

  // Build and write the Markdown file.
  const mdContent = buildIssueMarkdown(report)
  await saveToDirectory(handle, mdFilename, mdContent)

  // Write the screenshot PNG alongside the .md when the report includes one.
  let pngFilename: string | undefined
  if (report.screenshot && screenshot) {
    pngFilename = `${base}-screenshot.png`
    const pngBytes = dataUrlToUint8Array(screenshot.dataUrl)
    await saveBinaryToDirectory(handle, pngFilename, pngBytes)
  }

  return { mdFilename, pngFilename }
}

// ─── Issue Markdown builder ────────────────────────────────────────────────────

/**
 * Build the full issue-tracker Markdown for the given report.
 *
 * The file starts with a YAML-style frontmatter block that matches the project
 * issue-tracker conventions visible in `.scratch/qa-feedback-mode/issues/`.
 * The frontmatter is followed by the full `buildMarkdownTicket` body.
 */
function buildIssueMarkdown(report: FeedbackReport): string {
  const frontmatter = buildFrontmatter(report)
  const body = buildMarkdownTicket(report)
  // The frontmatter sits above the ticket title — the title comes from the
  // markdown body (first `# ...` line), so we inject the frontmatter lines
  // before it.
  return `${frontmatter}\n${body}`
}

/**
 * Build YAML-style frontmatter in the project issue-tracker format.
 *
 * Example:
 * ```
 * Status: needs-triage
 * Type: copy
 * Priority: minor
 *
 * ## Parent
 *
 * .scratch/qa-feedback-mode/PRD.md
 * ```
 */
function buildFrontmatter(report: FeedbackReport): string {
  const lines: string[] = []
  lines.push(`Status: needs-triage`)
  lines.push(`Type: ${mapFeedbackTypeToIssueType(report.type)}`)
  lines.push(`Priority: ${mapSeverityToPriority(report.severity)}`)
  lines.push('')
  lines.push('## Parent')
  lines.push('')
  lines.push('.scratch/qa-feedback-mode/PRD.md')
  return lines.join('\n')
}

// ─── Filename builder ──────────────────────────────────────────────────────────

/**
 * Build the base filename (without extension) for the issue file.
 *
 * Format: `qa-<YYYY-MM-DDTHH-MM-SS>-<target-slug>`
 *
 * The ISO timestamp uses hyphens instead of colons so the filename is safe on
 * all platforms. The target slug strips dots and non-ASCII characters.
 */
export function buildIssueFilenameBase(report: FeedbackReport): string {
  const ts = buildTimestampSlug(report.environment.timestamp)
  const slug = buildTargetSlug(report.target.id)
  return `qa-${ts}-${slug}`
}

/**
 * Convert an ISO 8601 timestamp to a filename-safe slug.
 * `2026-05-05T10:30:00.000Z` → `2026-05-05T10-30-00`
 */
function buildTimestampSlug(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '0000-00-00T00-00-00'
    const pad = (n: number, w = 2) => n.toString().padStart(w, '0')
    const yyyy = pad(d.getUTCFullYear(), 4)
    const mm = pad(d.getUTCMonth() + 1)
    const dd = pad(d.getUTCDate())
    const hh = pad(d.getUTCHours())
    const min = pad(d.getUTCMinutes())
    const sec = pad(d.getUTCSeconds())
    return `${yyyy}-${mm}-${dd}T${hh}-${min}-${sec}`
  } catch {
    return '0000-00-00T00-00-00'
  }
}

/**
 * Turn a dot-separated target id into a filename-safe slug.
 * `inputs.bav.employerSubsidy.label` → `inputs-bav-employersubsidy-label`
 */
function buildTargetSlug(id: string): string {
  return id
    .toLowerCase()
    .replace(/\./g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'unknown'
}

// ─── Type mappings ─────────────────────────────────────────────────────────────

const FEEDBACK_TYPE_TO_ISSUE_TYPE: Record<FeedbackType, string> = {
  copy: 'copy',
  layout: 'layout',
  flow: 'flow',
  interaction: 'interaction',
  value: 'value',
  a11y: 'accessibility',
  other: 'other',
}

function mapFeedbackTypeToIssueType(type: FeedbackType): string {
  return FEEDBACK_TYPE_TO_ISSUE_TYPE[type] ?? 'other'
}

const SEVERITY_TO_PRIORITY: Record<Severity, string> = {
  blocker: 'blocker',
  major: 'major',
  minor: 'minor',
  nit: 'nit',
}

function mapSeverityToPriority(severity: Severity): string {
  return SEVERITY_TO_PRIORITY[severity] ?? 'minor'
}

// ─── PNG decode helper ─────────────────────────────────────────────────────────

/**
 * Decode a `data:image/png;base64,...` data URL into a `Uint8Array` of raw
 * PNG bytes. Strips the header prefix before decoding.
 *
 * Throws when the data URL is malformed or not base64-encoded.
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex === -1) {
    throw new Error('Invalid data URL: no comma separator.')
  }
  const base64 = dataUrl.slice(commaIndex + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
