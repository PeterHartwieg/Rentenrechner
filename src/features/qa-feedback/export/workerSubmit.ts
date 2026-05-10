/**
 * QA-feedback worker submission — Phase 3 of ADR-0001's QA-submission backend.
 *
 * POSTs the feedback report to the Cloudflare Worker at qa.rentenwiki.de.
 * The Worker verifies a Turnstile token, optionally uploads the screenshot
 * to a private R2 bucket, and creates a GitHub issue with the
 * `needs-triage` label so the existing triage cron picks it up.
 *
 * Sibling `outboundDestinations.ts` covers the no-network paths (mailto +
 * GitHub-prefilled-URL); this module is the only QA-feedback module that
 * actually calls fetch. The existing no-network e2e test doesn't click the
 * "Direkt an GitHub einreichen" button so it stays a regression net for
 * the local-only paths.
 */

import type { CapturedScreenshot } from '../capture/screenshot'
import { getDevCode } from '../devCode'
import type { FeedbackReport } from '../report'
import { buildMarkdownTicket, generateTitle } from '../report'

/** Public Worker endpoint — sanctioned by ADR-0001. */
export const WORKER_SUBMIT_URL = 'https://qa.rentenwiki.de/submit'

/**
 * Cloudflare Turnstile site key for the rentenwiki-qa-submit widget.
 * Public — safe to include in client source. The matching secret lives in
 * the Worker's `wrangler secret put TURNSTILE_SECRET`.
 */
export const TURNSTILE_SITE_KEY = '0x4AAAAAADKSdGCO2gQSFrtS'

/** Soft caps mirroring the Worker's validation. */
const TITLE_MAX = 250
const BODY_MAX = 10_000
const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024

export type WorkerSubmitOutcome =
  | { ok: true; issueUrl: string; issueNumber: number }
  | { ok: false; code: string; message: string }

/**
 * POST a feedback report to the qa-submit Worker. Returns a discriminated
 * union the caller can render directly — no exceptions on the happy or
 * predictable-error paths. Network failures yield `{ ok: false, code:
 * 'network_error' }`.
 *
 * Error messages are pre-translated German strings ready for display.
 */
export async function submitToWorker(
  report: FeedbackReport,
  screenshot: CapturedScreenshot | null,
  turnstileToken: string,
): Promise<WorkerSubmitOutcome> {
  const title = clamp(generateTitle(report), TITLE_MAX)
  // The Worker appends its own `## Screenshot` block referencing the
  // hosted R2 URL. Drop the report's local-file ref so the issue body
  // doesn't carry a duplicate (broken) screenshot link.
  const reportForBody = screenshot ? { ...report, screenshot: undefined } : report
  const body = clamp(buildMarkdownTicket(reportForBody), BODY_MAX)

  const payload: Record<string, unknown> = {
    title,
    body,
    turnstileToken,
  }

  const devCode = getDevCode()
  if (devCode) {
    payload.devCode = devCode
  }

  if (screenshot) {
    const { base64, contentType } = stripDataUrlPrefix(screenshot.dataUrl)
    if (estimateDecodedSize(base64) > SCREENSHOT_MAX_BYTES) {
      return {
        ok: false,
        code: 'screenshot_too_large',
        message:
          'Screenshot zu groß. Bitte Screenshot abwählen und erneut versuchen.',
      }
    }
    payload.screenshotBase64 = base64
    payload.screenshotContentType = contentType
  }

  let response: Response
  try {
    response = await fetch(WORKER_SUBMIT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    return {
      ok: false,
      code: 'network_error',
      message: 'Verbindungsproblem. Bitte später erneut versuchen.',
    }
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'Antwort konnte nicht gelesen werden. Bitte später erneut versuchen.',
    }
  }

  if (!response.ok) {
    const data = json as { error?: string; message?: string }
    return {
      ok: false,
      code: data.error ?? 'unknown',
      message:
        data.message ??
        `Unerwarteter Fehler (${response.status}). Bitte später erneut versuchen.`,
    }
  }

  const data = json as { ok?: boolean; issueUrl?: string; issueNumber?: number }
  if (
    data.ok !== true ||
    typeof data.issueUrl !== 'string' ||
    typeof data.issueNumber !== 'number'
  ) {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'Unerwartete Antwort vom Server.',
    }
  }

  return { ok: true, issueUrl: data.issueUrl, issueNumber: data.issueNumber }
}

function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

function stripDataUrlPrefix(dataUrl: string): {
  base64: string
  contentType: string
} {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
  if (!match || !match[1] || !match[2]) {
    return { base64: '', contentType: 'image/png' }
  }
  return { contentType: match[1], base64: match[2] }
}

function estimateDecodedSize(base64: string): number {
  return Math.floor((base64.length * 3) / 4)
}
