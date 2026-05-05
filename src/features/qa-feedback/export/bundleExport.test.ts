/**
 * Tests for the QA-feedback bundle export (issue 07, Lane E).
 *
 * Coverage contract:
 *   - Bundle contents: markdown, JSON report, screenshot (with/without).
 *   - Filename determinism: same input → same name; type differences → different names.
 *   - No-network guarantee: fetch + XHR spies assert no outbound calls.
 *   - Scenario opt-in on/off reflected in envelope.
 *
 * Mirrors the fetch-spy pattern from `report/buildMarkdown.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFeedbackBundle, buildBundleFilename } from './bundleExport'
import { buildMarkdownTicket, defaultPrivacyFlags } from '../report'
import type { FeedbackReport } from '../report'
import type { CapturedScreenshot } from '../capture/screenshot'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<FeedbackReport> = {}): FeedbackReport {
  return {
    type: 'copy',
    severity: 'minor',
    comment: 'Wrong word in the label.',
    target: {
      id: 'inputs.bav.employerSubsidy.label',
      label: 'AG-Zuschuss',
      visibleText: 'AG-Zuschuss laut Vertrag (%)',
      precision: 'exact',
    },
    environment: {
      route: '/',
      timestamp: '2026-05-05T10:00:00.000Z',
      viewport: { width: 1280, height: 800 },
      userAgentFamily: 'Chrome 124 / macOS',
      appBuild: 'dev',
    },
    privacyFlags: defaultPrivacyFlags(false),
    ...overrides,
  }
}

/** Minimal fake screenshot blob with known bytes. */
function makeScreenshot(content = 'fake-png-bytes'): CapturedScreenshot {
  const blob = new Blob([content], { type: 'image/png' })
  return {
    blob,
    dataUrl: `data:image/png;base64,${btoa(content)}`,
    width: 1280,
    height: 800,
  }
}

// ─── Bundle contents ───────────────────────────────────────────────────────────

describe('buildFeedbackBundle — bundle contents (without screenshot)', () => {
  it('produces a blob of type application/json', async () => {
    const report = makeReport()
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    expect(blob.type).toContain('application/json')
  })

  it('envelope JSON is parseable and has schemaVersion 1', async () => {
    const report = makeReport()
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    const text = await blob.text()
    const envelope = JSON.parse(text) as { schemaVersion: unknown }
    expect(envelope.schemaVersion).toBe(1)
  })

  it('envelope contains the markdown ticket', async () => {
    const report = makeReport()
    const expectedMarkdown = buildMarkdownTicket(report)
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    const envelope = JSON.parse(await blob.text()) as { markdown: string }
    expect(envelope.markdown).toBe(expectedMarkdown)
  })

  it('envelope report field matches the full FeedbackReport', async () => {
    const report = makeReport()
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    const envelope = JSON.parse(await blob.text()) as { report: FeedbackReport }
    // Deep-compare the serialisable fields (round-tripped through JSON.stringify).
    expect(envelope.report).toEqual(JSON.parse(JSON.stringify(report)))
  })

  it('envelope does NOT contain a screenshot key when report.screenshot is absent', async () => {
    const report = makeReport() // no screenshot in report
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    const envelope = JSON.parse(await blob.text()) as { screenshot?: unknown }
    expect(envelope.screenshot).toBeUndefined()
  })

  it('envelope contains bundledAt as an ISO-8601 string', async () => {
    const report = makeReport()
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    const envelope = JSON.parse(await blob.text()) as { bundledAt: string }
    expect(typeof envelope.bundledAt).toBe('string')
    // Must parse as a valid date.
    expect(Number.isNaN(new Date(envelope.bundledAt).getTime())).toBe(false)
  })

  it('envelope report preserves privacy flags', async () => {
    const report = makeReport({
      privacyFlags: {
        sensitiveFieldsRedacted: true,
        scenarioStateIncluded: true,
        screenshotIncluded: false,
        localStorageIncluded: false,
        userInputsRedacted: false,
      },
    })
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    const envelope = JSON.parse(await blob.text()) as { report: FeedbackReport }
    expect(envelope.report.privacyFlags.scenarioStateIncluded).toBe(true)
    expect(envelope.report.privacyFlags.userInputsRedacted).toBe(false)
  })
})

describe('buildFeedbackBundle — bundle contents (with screenshot)', () => {
  it('embeds the screenshot as base64 when report.screenshot is set', async () => {
    const content = 'fake-png-bytes'
    const screenshot = makeScreenshot(content)
    const report = makeReport({
      privacyFlags: defaultPrivacyFlags(true),
      screenshot: { fileName: 'screenshot.png', width: 1280, height: 800 },
    })
    const { blob } = await buildFeedbackBundle({ report, screenshot })
    const envelope = JSON.parse(await blob.text()) as {
      screenshot?: { data: string; encoding: string; mimeType: string; fileName: string }
    }
    expect(envelope.screenshot).toBeDefined()
    expect(envelope.screenshot!.encoding).toBe('base64')
    expect(envelope.screenshot!.mimeType).toBe('image/png')
    expect(envelope.screenshot!.fileName).toBe('screenshot.png')
    // Decode and verify bytes.
    const decoded = atob(envelope.screenshot!.data)
    expect(decoded).toBe(content)
  })

  it('screenshot key is absent when report.screenshot is set but screenshot blob is null', async () => {
    // Edge case: report says screenshot included but blob was lost (e.g. capture failed).
    const report = makeReport({
      privacyFlags: defaultPrivacyFlags(true),
      screenshot: { fileName: 'screenshot.png', width: 1280, height: 800 },
    })
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    const envelope = JSON.parse(await blob.text()) as { screenshot?: unknown }
    expect(envelope.screenshot).toBeUndefined()
  })

  it('screenshot key is absent when report.screenshot is undefined even if blob is present', async () => {
    // The report does not include a screenshot (tester opted out in the UI).
    const screenshot = makeScreenshot()
    const report = makeReport() // no report.screenshot
    const { blob } = await buildFeedbackBundle({ report, screenshot })
    const envelope = JSON.parse(await blob.text()) as { screenshot?: unknown }
    expect(envelope.screenshot).toBeUndefined()
  })
})

describe('buildFeedbackBundle — scenario opt-in on/off', () => {
  it('envelope report reflects scenarioStateIncluded=true when scenario is attached', async () => {
    const report = makeReport({
      privacyFlags: { ...defaultPrivacyFlags(false), scenarioStateIncluded: true },
      scenarioContext: { shareUrl: 'https://example.com/?qa=1', scenarioJson: '{"a":1}' },
    })
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    const envelope = JSON.parse(await blob.text()) as { report: FeedbackReport }
    expect(envelope.report.privacyFlags.scenarioStateIncluded).toBe(true)
    expect(envelope.report.scenarioContext?.scenarioJson).toBe('{"a":1}')
  })

  it('envelope report has no scenarioContext when opt-in is off', async () => {
    const report = makeReport() // scenarioContext undefined
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    const envelope = JSON.parse(await blob.text()) as { report: FeedbackReport }
    expect(envelope.report.scenarioContext).toBeUndefined()
    expect(envelope.report.privacyFlags.scenarioStateIncluded).toBe(false)
  })

  it('markdown in envelope does NOT contain Scenario sections when opt-in is off', async () => {
    const report = makeReport()
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    const envelope = JSON.parse(await blob.text()) as { markdown: string }
    expect(envelope.markdown).not.toContain('## Scenario JSON')
    expect(envelope.markdown).not.toContain('## Scenario share URL')
  })

  it('markdown in envelope contains Scenario section when scenarioJson is present', async () => {
    const report = makeReport({
      privacyFlags: { ...defaultPrivacyFlags(false), scenarioStateIncluded: true },
      scenarioContext: { scenarioJson: '{"b":2}' },
    })
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    const envelope = JSON.parse(await blob.text()) as { markdown: string }
    expect(envelope.markdown).toContain('## Scenario JSON')
    expect(envelope.markdown).toContain('{"b":2}')
  })
})

// ─── Filename determinism ──────────────────────────────────────────────────────

describe('buildBundleFilename — determinism and format', () => {
  it('produces the same filename for the same report', () => {
    const report = makeReport()
    expect(buildBundleFilename(report)).toBe(buildBundleFilename(report))
  })

  it('includes the feedback type in the filename', () => {
    const copyReport = makeReport({ type: 'copy' })
    const layoutReport = makeReport({ type: 'layout' })
    expect(buildBundleFilename(copyReport)).toContain('copy')
    expect(buildBundleFilename(layoutReport)).toContain('layout')
  })

  it('different feedback types produce different filenames', () => {
    const copyFilename = buildBundleFilename(makeReport({ type: 'copy' }))
    const a11yFilename = buildBundleFilename(makeReport({ type: 'a11y' }))
    expect(copyFilename).not.toBe(a11yFilename)
  })

  it('filename is ASCII-only (no German characters, no spaces)', () => {
    const report = makeReport()
    const filename = buildBundleFilename(report)
    expect(/^[\x20-\x7E]+$/.test(filename)).toBe(true)
    expect(filename).not.toContain(' ')
  })

  it('filename ends with .json', () => {
    expect(buildBundleFilename(makeReport())).toMatch(/\.json$/)
  })

  it('filename starts with qa-feedback-', () => {
    expect(buildBundleFilename(makeReport())).toMatch(/^qa-feedback-/)
  })

  it('encodes the timestamp as YYYYMMDD-HHmm in the filename', () => {
    // Timestamp: 2026-05-05T10:00:00.000Z → 20260505-1000
    const report = makeReport() // timestamp: '2026-05-05T10:00:00.000Z'
    const filename = buildBundleFilename(report)
    expect(filename).toContain('20260505-1000')
  })

  it('filename is sortable by date (date portion appears early)', () => {
    const early = makeReport({ environment: { ...makeReport().environment, timestamp: '2026-01-01T00:00:00.000Z' } })
    const late = makeReport({ environment: { ...makeReport().environment, timestamp: '2026-12-31T23:59:00.000Z' } })
    const earlyName = buildBundleFilename(early)
    const lateName = buildBundleFilename(late)
    // Lexicographic order must match chronological order.
    expect(earlyName < lateName).toBe(true)
  })

  it('encodes the target id as a slug in the filename', () => {
    // Dots become hyphens; result must be lowercase ASCII.
    const report = makeReport()
    const filename = buildBundleFilename(report)
    expect(filename).toContain('inputs-bav-employersubsidy-label')
  })

  it('different targets produce different filenames', () => {
    const a = makeReport({ target: { id: 'inputs.bav.employerSubsidy.label', precision: 'exact' } })
    const b = makeReport({ target: { id: 'results.breakEvenChart.container', precision: 'exact' } })
    expect(buildBundleFilename(a)).not.toBe(buildBundleFilename(b))
  })
})

// ─── No-network guarantee ──────────────────────────────────────────────────────

describe('buildFeedbackBundle — no-network guarantee', () => {
  let originalFetch: typeof fetch | undefined
  let originalXHR: typeof XMLHttpRequest | undefined

  beforeEach(() => {
    originalFetch = (globalThis as { fetch?: typeof fetch }).fetch
    originalXHR = (globalThis as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalFetch !== undefined) {
      ;(globalThis as { fetch?: typeof fetch }).fetch = originalFetch
    }
    if (originalXHR !== undefined) {
      ;(globalThis as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest = originalXHR
    }
  })

  it('does not call fetch during bundle creation (no screenshot)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const report = makeReport()
    const { blob } = await buildFeedbackBundle({ report, screenshot: null })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(blob.size).toBeGreaterThan(0)
  })

  it('does not call fetch during bundle creation (with screenshot)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const screenshot = makeScreenshot()
    const report = makeReport({
      privacyFlags: defaultPrivacyFlags(true),
      screenshot: { fileName: 'screenshot.png', width: 1280, height: 800 },
    })
    const { blob } = await buildFeedbackBundle({ report, screenshot })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(blob.size).toBeGreaterThan(0)
  })

  it('does not call XMLHttpRequest during bundle creation', async () => {
    const xhrOpenSpy = vi.fn()
    vi.stubGlobal('XMLHttpRequest', class {
      open = xhrOpenSpy
      send = vi.fn()
    })
    const report = makeReport()
    await buildFeedbackBundle({ report, screenshot: null })
    expect(xhrOpenSpy).not.toHaveBeenCalled()
  })

  it('buildBundleFilename is synchronous and calls no network APIs', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const filename = buildBundleFilename(makeReport())
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(typeof filename).toBe('string')
  })
})
