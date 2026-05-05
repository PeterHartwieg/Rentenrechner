// @vitest-environment jsdom

/**
 * Tests for localSave.ts (issue 14).
 *
 * Coverage:
 *   - `buildIssueFilenameBase`: format, timestamp encoding, target slug.
 *   - `saveReportLocally`: writes .md file; writes .png when screenshot included;
 *     skips .png when report has no screenshot ref; re-throws errors.
 *   - No-network guarantee: fetch + XHR spies confirm no outbound calls.
 *   - Frontmatter: Status always 'needs-triage'; Type maps from FeedbackType;
 *     Priority maps from Severity; Parent pointer present.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildIssueFilenameBase, saveReportLocally } from './localSave'
import { clearCachedHandle } from './localDirectoryHandle'
import { defaultPrivacyFlags } from '../report/buildMarkdown'
import type { FeedbackReport } from '../report/types'
import type { CapturedScreenshot } from '../capture/screenshot'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<FeedbackReport> = {}): FeedbackReport {
  return {
    type: 'copy',
    severity: 'minor',
    comment: 'Wrong label text.',
    target: {
      id: 'inputs.bav.employerSubsidy.label',
      label: 'AG-Zuschuss',
      visibleText: 'AG-Zuschuss laut Vertrag (%)',
      precision: 'exact',
    },
    environment: {
      route: '/',
      timestamp: '2026-05-05T10:30:00.000Z',
      viewport: { width: 1280, height: 800 },
      userAgentFamily: 'Chrome 124 / Windows',
      appBuild: 'dev',
    },
    privacyFlags: defaultPrivacyFlags(false),
    ...overrides,
  }
}

function makeScreenshot(content = 'fake-png-bytes'): CapturedScreenshot {
  const b64 = btoa(content)
  return {
    blob: new Blob([content], { type: 'image/png' }),
    dataUrl: `data:image/png;base64,${b64}`,
    width: 1280,
    height: 800,
  }
}

/** Build a minimal fake FileSystemDirectoryHandle whose writes are inspectable. */
function makeFakeHandle() {
  const writes: Record<string, unknown> = {}

  function makeWritable(filename: string) {
    return {
      write: vi.fn().mockImplementation((data: unknown) => {
        writes[filename] = data
        return Promise.resolve()
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }
  }

  const getFileHandleSpy = vi.fn().mockImplementation((filename: string) =>
    Promise.resolve({ createWritable: () => Promise.resolve(makeWritable(filename)) }),
  )

  const handle = {
    getFileHandle: getFileHandleSpy,
  } as unknown as FileSystemDirectoryHandle

  return { handle, writes, getFileHandleSpy }
}

// ─── buildIssueFilenameBase ────────────────────────────────────────────────────

describe('buildIssueFilenameBase()', () => {
  it('starts with qa-', () => {
    expect(buildIssueFilenameBase(makeReport())).toMatch(/^qa-/)
  })

  it('encodes the timestamp in YYYY-MM-DDTHH-MM-SS format', () => {
    const report = makeReport() // timestamp: '2026-05-05T10:30:00.000Z'
    expect(buildIssueFilenameBase(report)).toContain('2026-05-05T10-30-00')
  })

  it('contains the target slug (dots replaced with hyphens, lowercase)', () => {
    const report = makeReport()
    expect(buildIssueFilenameBase(report)).toContain('inputs-bav-employersubsidy-label')
  })

  it('is ASCII-only', () => {
    const base = buildIssueFilenameBase(makeReport())
    expect(/^[\x20-\x7E]+$/.test(base)).toBe(true)
  })

  it('produces the same base for the same report (deterministic)', () => {
    const report = makeReport()
    expect(buildIssueFilenameBase(report)).toBe(buildIssueFilenameBase(report))
  })

  it('differs for different target ids', () => {
    const a = makeReport({ target: { id: 'inputs.bav.label', precision: 'exact' } })
    const b = makeReport({ target: { id: 'results.chart.legend', precision: 'exact' } })
    expect(buildIssueFilenameBase(a)).not.toBe(buildIssueFilenameBase(b))
  })

  it('falls back gracefully for an invalid timestamp', () => {
    const report = makeReport({
      environment: { ...makeReport().environment, timestamp: 'not-a-date' },
    })
    const base = buildIssueFilenameBase(report)
    expect(base).toMatch(/^qa-0000-00-00T00-00-00/)
  })
})

// ─── saveReportLocally — file writes ──────────────────────────────────────────

describe('saveReportLocally()', () => {
  beforeEach(() => {
    clearCachedHandle()
  })

  afterEach(() => {
    clearCachedHandle()
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
    vi.restoreAllMocks()
  })

  function installPicker(handle: FileSystemDirectoryHandle) {
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi
      .fn()
      .mockResolvedValue(handle)
  }

  it('writes a .md file for the issue', async () => {
    const { handle, writes, getFileHandleSpy } = makeFakeHandle()
    installPicker(handle)

    const report = makeReport()
    const { mdFilename } = await saveReportLocally({ report, screenshot: null })

    expect(mdFilename).toMatch(/^qa-.*\.md$/)
    expect(getFileHandleSpy).toHaveBeenCalledWith(mdFilename, { create: true })
    // Written content must be a non-empty string.
    expect(typeof writes[mdFilename]).toBe('string')
    expect((writes[mdFilename] as string).length).toBeGreaterThan(0)
  })

  it('md file contains issue-tracker frontmatter with Status: needs-triage', async () => {
    const { handle, writes } = makeFakeHandle()
    installPicker(handle)

    const report = makeReport()
    const { mdFilename } = await saveReportLocally({ report, screenshot: null })

    const content = writes[mdFilename] as string
    expect(content).toContain('Status: needs-triage')
  })

  it('md file frontmatter Type maps from FeedbackType', async () => {
    const { handle, writes } = makeFakeHandle()
    installPicker(handle)

    const report = makeReport({ type: 'layout' })
    const { mdFilename } = await saveReportLocally({ report, screenshot: null })

    expect(writes[mdFilename] as string).toContain('Type: layout')
  })

  it('md file frontmatter Priority maps from Severity', async () => {
    const { handle, writes } = makeFakeHandle()
    installPicker(handle)

    const report = makeReport({ severity: 'blocker' })
    const { mdFilename } = await saveReportLocally({ report, screenshot: null })

    expect(writes[mdFilename] as string).toContain('Priority: blocker')
  })

  it('md file contains Parent pointer to PRD', async () => {
    const { handle, writes } = makeFakeHandle()
    installPicker(handle)

    const report = makeReport()
    const { mdFilename } = await saveReportLocally({ report, screenshot: null })

    expect(writes[mdFilename] as string).toContain('.scratch/qa-feedback-mode/PRD.md')
  })

  it('md file contains the full markdown ticket body (tester comment)', async () => {
    const { handle, writes } = makeFakeHandle()
    installPicker(handle)

    const report = makeReport({ comment: 'Unique-tester-comment-abc123' })
    const { mdFilename } = await saveReportLocally({ report, screenshot: null })

    expect(writes[mdFilename] as string).toContain('Unique-tester-comment-abc123')
  })

  it('does NOT write a png file when report.screenshot is absent', async () => {
    const { handle, getFileHandleSpy } = makeFakeHandle()
    installPicker(handle)

    const report = makeReport() // no screenshot ref
    const result = await saveReportLocally({ report, screenshot: null })

    expect(result.pngFilename).toBeUndefined()
    // Only one file handle request — the .md file.
    expect(getFileHandleSpy).toHaveBeenCalledOnce()
  })

  it('writes a .png file alongside the .md when screenshot is included', async () => {
    const { handle, writes, getFileHandleSpy } = makeFakeHandle()
    installPicker(handle)

    const screenshot = makeScreenshot('fake-png-content')
    const report = makeReport({
      privacyFlags: defaultPrivacyFlags(true),
      screenshot: { fileName: 'screenshot.png', width: 1280, height: 800 },
    })
    const { pngFilename } = await saveReportLocally({ report, screenshot })

    expect(pngFilename).toBeDefined()
    expect(pngFilename).toMatch(/\.png$/)
    // Two file handles: .md + .png
    expect(getFileHandleSpy).toHaveBeenCalledTimes(2)
    // PNG data written as Uint8Array.
    const pngData = writes[pngFilename!]
    expect(pngData instanceof Uint8Array).toBe(true)
    // Decode the bytes back to the original content.
    const decoded = new TextDecoder().decode(pngData as Uint8Array)
    expect(decoded).toBe('fake-png-content')
  })

  it('md and png base filenames share the same timestamp-slug prefix', async () => {
    const { handle } = makeFakeHandle()
    installPicker(handle)

    const screenshot = makeScreenshot()
    const report = makeReport({
      privacyFlags: defaultPrivacyFlags(true),
      screenshot: { fileName: 'screenshot.png' },
    })
    const { mdFilename, pngFilename } = await saveReportLocally({ report, screenshot })

    // Strip extensions and the -screenshot suffix to compare bases.
    const mdBase = mdFilename.replace(/\.md$/, '')
    const pngBase = pngFilename!.replace(/-screenshot\.png$/, '')
    expect(mdBase).toBe(pngBase)
  })

  it('re-throws errors from the directory handle', async () => {
    const writeError = new Error('Disk full')
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn().mockResolvedValue({
      getFileHandle: vi.fn().mockRejectedValue(writeError),
    })

    const report = makeReport()
    await expect(saveReportLocally({ report, screenshot: null })).rejects.toThrow('Disk full')
  })

  it('re-throws AbortError so the caller can distinguish cancellation', async () => {
    const abort = Object.assign(new Error('Cancelled'), { name: 'AbortError' })
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(abort)

    const report = makeReport()
    await expect(saveReportLocally({ report, screenshot: null })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})

// ─── No-network guarantee ──────────────────────────────────────────────────────

describe('saveReportLocally — no-network guarantee', () => {
  beforeEach(() => {
    clearCachedHandle()
  })

  afterEach(() => {
    clearCachedHandle()
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
    vi.restoreAllMocks()
  })

  it('does not call fetch during local save', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { handle } = makeFakeHandle()
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi
      .fn()
      .mockResolvedValue(handle)

    await saveReportLocally({ report: makeReport(), screenshot: null })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not call XMLHttpRequest during local save', async () => {
    const xhrOpenSpy = vi.fn()
    vi.stubGlobal('XMLHttpRequest', class {
      open = xhrOpenSpy
      send = vi.fn()
    })

    const { handle } = makeFakeHandle()
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi
      .fn()
      .mockResolvedValue(handle)

    await saveReportLocally({ report: makeReport(), screenshot: null })
    expect(xhrOpenSpy).not.toHaveBeenCalled()
  })
})
