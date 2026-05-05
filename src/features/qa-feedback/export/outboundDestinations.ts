/**
 * QA-feedback outbound destination helpers — issue 08, Lane F.
 *
 * Builds prefilled `mailto:` and GitHub new-issue URLs from a reviewed
 * `FeedbackReport`. No network access — these functions construct URLs
 * only. The caller (QaPreview) hands the URL to `window.open`.
 *
 * ## No-network guarantee
 *
 * Both helpers are pure string builders. They call no `fetch`, no
 * `XMLHttpRequest`, and no `navigator.*` APIs. Tests assert this
 * explicitly via the same spy pattern used by `bundleExport.test.ts`.
 *
 * ## Length-cap rationale
 *
 * mailto: RFC 2368 leaves maximum URL length to the MUA (Mail User Agent).
 * Common desktop clients (Outlook, Apple Mail, Thunderbird) and web
 * clients (Gmail, Outlook.com) behave reliably up to ~2000 chars for the
 * entire mailto: URI. We cap the *body* portion so the full URI
 * (scheme + subject + body + separators) stays under 1900 chars total —
 * a conservative 100-char headroom for the subject and encoding overhead.
 * When the body exceeds the budget, the Markdown is hard-truncated and a
 * `[truncated — see attached bundle]` footer is appended so the
 * developer knows to request the bundle download instead.
 *
 * Chosen cap: MAX_MAILTO_BODY_ENCODED_CHARS = 1800
 *   - Leaves ~100 chars for scheme, subject, separators, and percent
 *     overhead on a typical title. Conservative enough for the worst-case
 *     (long title + long comment).
 *
 * GitHub: The GitHub UI accepts new-issue URLs up to ~8192 chars (the
 * Chromium URL limit). We cap the body at MAX_GITHUB_BODY_ENCODED_CHARS =
 * 7500 encoded chars, leaving comfortable headroom for the title and
 * labels params. In practice most tickets are well below this threshold.
 */

import type { FeedbackReport } from '../report'
import { buildMarkdownTicket, generateTitle } from '../report'

// ─── Length-cap constants ──────────────────────────────────────────────────────

/**
 * Maximum length of the **encoded** body in a mailto: URL.
 * Conservative: keeps the total mailto: URI below common MUA limits (~2000).
 */
const MAX_MAILTO_BODY_ENCODED_CHARS = 1800

/**
 * Maximum length of the **encoded** body in a GitHub new-issue URL.
 * GitHub's UI is backed by Chromium's URL limit (~8192). We leave
 * headroom for the title, labels, and other params.
 */
const MAX_GITHUB_BODY_ENCODED_CHARS = 7500

/** Sentinel appended to a truncated body so developers know more exists. */
const TRUNCATION_FOOTER = '\n\n[truncated — see attached bundle]'

// ─── Public options types ──────────────────────────────────────────────────────

export interface MailtoOptions {
  /**
   * Recipient address. Default: empty string so the user picks their own
   * mail client / compose window.
   */
  to?: string
}

export interface GithubIssueOptions {
  /**
   * GitHub repository owner. Defaults to this project's GitHub owner
   * (`PeterHartwieg`).
   */
  owner?: string
  /**
   * GitHub repository name. Defaults to this project's repository name
   * (`Rentenrechner`).
   */
  repo?: string
  /**
   * Optional label names to pre-apply. Maps to the `labels` query param.
   * GitHub accepts a comma-separated list.
   */
  labels?: string[]
}

// ─── Public helpers ────────────────────────────────────────────────────────────

/**
 * Build a `mailto:` URL with the QA ticket as the email body.
 *
 * - Subject: `generateTitle(report)` (one-line, already ASCII-safe for
 *   common mail clients after percent-encoding).
 * - Body: `buildMarkdownTicket(report)`, truncated if necessary (see
 *   MAX_MAILTO_BODY_ENCODED_CHARS).
 * - Recipient: `options.to` (default: empty, so the MUA opens with a
 *   blank To field — the tester fills it in).
 *
 * The returned string is ready to pass to `window.open` or an `<a href>`.
 */
export function buildMailtoUrl(report: FeedbackReport, options: MailtoOptions = {}): string {
  const to = options.to ?? ''
  const subject = generateTitle(report)
  const fullBody = buildMarkdownTicket(report)

  const body = clampEncodedLength(fullBody, MAX_MAILTO_BODY_ENCODED_CHARS)

  // URLSearchParams encodes spaces as "+" (application/x-www-form-urlencoded),
  // which is wrong for mailto: — MUAs expect percent-encoding. Build the query
  // string manually with encodeURIComponent.
  const subjectEncoded = encodeURIComponent(subject)
  const bodyEncoded = encodeURIComponent(body)

  const queryString = `subject=${subjectEncoded}&body=${bodyEncoded}`
  return `mailto:${to}?${queryString}`
}

/**
 * Build a GitHub "new issue" prefill URL.
 *
 * - Title: `generateTitle(report)`.
 * - Body: `buildMarkdownTicket(report)`, truncated if necessary (see
 *   MAX_GITHUB_BODY_ENCODED_CHARS).
 * - Labels: joined as a comma-separated string if provided.
 * - Default repo: `PeterHartwieg/Rentenrechner` (this project's remote).
 *
 * The returned string is ready to pass to `window.open`.
 */
export function buildGithubIssueUrl(
  report: FeedbackReport,
  options: GithubIssueOptions = {},
): string {
  const owner = options.owner ?? 'PeterHartwieg'
  const repo = options.repo ?? 'Rentenrechner'

  const title = generateTitle(report)
  const fullBody = buildMarkdownTicket(report)
  const body = clampEncodedLength(fullBody, MAX_GITHUB_BODY_ENCODED_CHARS)

  const params: Record<string, string> = {
    title,
    body,
  }
  if (options.labels && options.labels.length > 0) {
    params['labels'] = options.labels.join(',')
  }

  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/new?${queryString}`
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Truncate `text` so that `encodeURIComponent(result)` fits within
 * `maxEncodedChars`. When truncation is needed, append TRUNCATION_FOOTER.
 *
 * We iterate conservatively: `encodeURIComponent` can expand each character
 * by up to 3× (for non-ASCII bytes). We binary-search on the source length
 * to avoid O(n²) scanning through a multi-kilobyte ticket.
 */
function clampEncodedLength(text: string, maxEncodedChars: number): string {
  if (encodeURIComponent(text).length <= maxEncodedChars) {
    return text
  }

  // We need to truncate. Reserve space for the truncation footer in the budget.
  const footerEncoded = encodeURIComponent(TRUNCATION_FOOTER).length
  const budget = maxEncodedChars - footerEncoded

  // Binary search on source character count to find the longest prefix
  // whose encoded length fits within budget.
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (encodeURIComponent(text.slice(0, mid)).length <= budget) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  // Snap back to avoid splitting a surrogate pair.
  let cutPoint = lo
  if (cutPoint > 0 && cutPoint < text.length) {
    const code = text.charCodeAt(cutPoint - 1)
    if (code >= 0xd800 && code <= 0xdbff) {
      cutPoint -= 1
    }
  }

  return text.slice(0, cutPoint) + TRUNCATION_FOOTER
}
