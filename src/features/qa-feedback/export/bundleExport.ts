/**
 * QA-feedback bundle export — issue 07, Lane E.
 *
 * Produces a **single** downloadable artifact that bundles:
 *   - The Markdown ticket (UTF-8 text).
 *   - A structured JSON payload (`FeedbackReport` + envelope metadata).
 *   - The screenshot artifact (base64-encoded PNG) when included.
 *
 * ## Format choice — JSON envelope (zero-dependency, justified)
 *
 * The spec allows ".zip, .tar, or a structured JSON envelope" and asks for
 * "smallest dependency footprint". A JSON envelope is chosen because:
 *
 *   1. **Zero new dependencies.** No `fflate`, no `jszip` — the feature is
 *      developer-testing tooling used while QA mode is active; pulling a
 *      binary-format library for it would be disproportionate.
 *   2. **Self-contained.** The envelope stores the screenshot as a base64
 *      string — the same data `CapturedScreenshot.dataUrl` already provides.
 *      A receiving agent parses the bundle with a single `JSON.parse` call and
 *      can reconstruct the PNG without any library.
 *   3. **Forward-compatible.** Future tooling (issue 08 mailto/GitHub prefill,
 *      issue 10 server submission) can parse the envelope without a zip decoder.
 *
 * ## Envelope schema (schemaVersion 1)
 *
 * ```json
 * {
 *   "schemaVersion": 1,
 *   "bundledAt": "<ISO-8601>",
 *   "markdown": "<ticket text>",
 *   "report": { /* FeedbackReport — screenshot bytes omitted *\/ },
 *   "screenshot": {              // present only when included
 *     "fileName": "screenshot.png",
 *     "mimeType": "image/png",
 *     "encoding": "base64",
 *     "data": "<base64>"
 *   }
 * }
 * ```
 *
 * ## Filename format (DECISIONS §4, CLAUDE.md "Filenames stay ASCII")
 *
 *   qa-feedback-YYYYMMDD-HHmm-<type>-<target-slug>.json
 *
 * Deterministic for the same `FeedbackReport.environment.timestamp` + type +
 * target id. Sortable by date, filterable by type.
 *
 * ## No-network guarantee
 *
 * All operations are synchronous CPU + DOM (TextEncoder, FileReader-free base64
 * via `btoa` from a `Uint8Array`). No `fetch`, no `XMLHttpRequest`.
 */

import type { FeedbackReport } from '../report'
import { buildMarkdownTicket } from '../report'
import type { CapturedScreenshot } from '../capture/screenshot'

// ─── Public types ─────────────────────────────────────────────────────────────

/** Inputs for `buildFeedbackBundle`. */
export interface BundleInput {
  report: FeedbackReport
  /**
   * The captured screenshot. Pass the full `CapturedScreenshot` object so the
   * bundle helper can extract the blob. The screenshot is only embedded when
   * `report.screenshot` is set (i.e. the tester opted to include it).
   */
  screenshot: CapturedScreenshot | null
}

/** Return value of `buildFeedbackBundle`. */
export interface FeedbackBundle {
  /** The assembled JSON blob, ready for `triggerBlobDownload`. */
  blob: Blob
  /** Deterministic filename: `qa-feedback-YYYYMMDD-HHmm-<type>-<slug>.json`. */
  filename: string
}

// ─── Envelope schema (schemaVersion 1) ────────────────────────────────────────

interface BundleEnvelopeV1 {
  schemaVersion: 1
  bundledAt: string
  markdown: string
  /** Full `FeedbackReport`. The `screenshot.fileName` reference is preserved;
   *  the actual bytes live in the `screenshot` envelope key below. */
  report: FeedbackReport
  /** Present only when the report includes a screenshot. */
  screenshot?: {
    fileName: string
    mimeType: string
    encoding: 'base64'
    data: string
  }
}

// ─── Main export helper ────────────────────────────────────────────────────────

/**
 * Assemble the single-file feedback bundle.
 *
 * This function is **synchronous-except-for-blob-reading**. The blob-to-base64
 * step requires an async `FileReader` or `blob.arrayBuffer()` call. We use the
 * `blob.arrayBuffer()` path (available in all environments that support the
 * File API) so callers must `await` this function.
 *
 * The no-network guarantee holds: only `blob.arrayBuffer()` (a local Blob
 * method) and `btoa` (string encoding) are used. No `fetch`, no XHR.
 */
export async function buildFeedbackBundle(input: BundleInput): Promise<FeedbackBundle> {
  const { report, screenshot } = input
  const markdown = buildMarkdownTicket(report)
  const filename = buildBundleFilename(report)

  const envelope: BundleEnvelopeV1 = {
    schemaVersion: 1,
    bundledAt: new Date().toISOString(),
    markdown,
    report,
  }

  // Embed the screenshot only when the report references one and we have the
  // blob. `report.screenshot` being set is the canonical flag (set by
  // `buildReport` in QaPreview when `draft.includeScreenshot && screenshot`).
  if (report.screenshot && screenshot) {
    const base64 = await blobToBase64(screenshot.blob)
    envelope.screenshot = {
      fileName: report.screenshot.fileName,
      mimeType: screenshot.blob.type || 'image/png',
      encoding: 'base64',
      data: base64,
    }
  }

  const json = JSON.stringify(envelope, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  return { blob, filename }
}

// ─── Filename builder ──────────────────────────────────────────────────────────

/**
 * Build a deterministic, ASCII-safe bundle filename from the report.
 *
 * Format: `qa-feedback-YYYYMMDD-HHmm-<type>-<target-slug>.json`
 *
 * The timestamp comes from `report.environment.timestamp` (ISO 8601) so the
 * same report always produces the same filename.
 */
export function buildBundleFilename(report: FeedbackReport): string {
  const datePart = formatTimestamp(report.environment.timestamp)
  const typePart = sanitizeSegment(report.type)
  const slugPart = targetSlug(report.target.id)
  return `qa-feedback-${datePart}-${typePart}-${slugPart}.json`
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Convert an ISO 8601 timestamp to `YYYYMMDD-HHmm`. Falls back to a
 * fixed sentinel when the string cannot be parsed so tests stay deterministic.
 */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '00000000-0000'
    const yyyy = d.getUTCFullYear().toString().padStart(4, '0')
    const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0')
    const dd = d.getUTCDate().toString().padStart(2, '0')
    const hh = d.getUTCHours().toString().padStart(2, '0')
    const min = d.getUTCMinutes().toString().padStart(2, '0')
    return `${yyyy}${mm}${dd}-${hh}${min}`
  } catch {
    return '00000000-0000'
  }
}

/**
 * Turn a target id (dot-separated, may contain dots + camelCase) into a
 * URL/filename-safe slug. Dots become hyphens; other non-ASCII chars are
 * stripped. Capped at 40 chars to keep filenames readable.
 */
function targetSlug(id: string): string {
  return sanitizeSegment(id.replace(/\./g, '-')).slice(0, 40)
}

/**
 * Strip characters that are not safe in filenames, collapse runs of
 * separators, lowercase. CLAUDE.md: "Filenames stay ASCII".
 */
function sanitizeSegment(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'unknown'
}

/**
 * Encode a `Blob` as a base64 string without any network access.
 *
 * Uses `Blob.arrayBuffer()` (Baseline 2020+) then `btoa` so there is no
 * `FileReader` state machine to manage. The result is a plain base64 string
 * (no `data:` prefix).
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  // `btoa` accepts a binary string: each character's char code = one byte.
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
