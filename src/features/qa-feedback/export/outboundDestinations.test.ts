/**
 * Tests for issue 08 Lane F: prefilled outbound destination helpers.
 *
 * Coverage contract:
 *   - mailto: subject + body correct, special chars URL-encoded (umlauts,
 *     #, &, newlines), length-clamping works at and beyond the boundary.
 *   - GitHub: URL points at default repo, title/body/labels params present
 *     and encoded, custom owner/repo/labels honored.
 *   - Both: fetch and XMLHttpRequest are NEVER called during URL construction.
 *   - window.open spy: called with '_blank' and 'noopener,noreferrer' (wired
 *     in QaPreview — tested in outboundDestinations.open.test.ts).
 *
 * Mirrors the no-network spy pattern from `bundleExport.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildMailtoUrl,
  buildGithubIssueUrl,
} from './outboundDestinations'
import { defaultPrivacyFlags } from '../report'
import type { FeedbackReport } from '../report'

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

// ─── buildMailtoUrl ────────────────────────────────────────────────────────────

describe('buildMailtoUrl — URL structure', () => {
  it('starts with mailto:', () => {
    const url = buildMailtoUrl(makeReport())
    expect(url.startsWith('mailto:')).toBe(true)
  })

  it('includes subject= and body= query params', () => {
    const url = buildMailtoUrl(makeReport())
    expect(url).toContain('subject=')
    expect(url).toContain('body=')
  })

  it('has an empty To field by default (user fills it in)', () => {
    // mailto:?subject=... (nothing between "mailto:" and "?")
    const url = buildMailtoUrl(makeReport())
    expect(url.startsWith('mailto:?')).toBe(true)
  })

  it('includes the specified recipient when options.to is provided', () => {
    const url = buildMailtoUrl(makeReport(), { to: 'peter@hartwieg.com' })
    expect(url.startsWith('mailto:peter@hartwieg.com?')).toBe(true)
  })

  it('subject matches generateTitle(report)', () => {
    const report = makeReport({ severity: 'blocker', type: 'layout' })
    const url = buildMailtoUrl(report)
    // The subject is percent-encoded in the URL; decode for assertion.
    const match = /subject=([^&]+)/.exec(url)
    expect(match).not.toBeNull()
    const decodedSubject = decodeURIComponent(match![1])
    // Should start with [BLOCKER] qa(layout):
    expect(decodedSubject).toMatch(/^\[BLOCKER\] qa\(layout\):/)
  })

  it('body decodes to the full Markdown ticket when under the length cap', () => {
    const report = makeReport()
    const url = buildMailtoUrl(report)
    const bodyMatch = /body=(.+)$/.exec(url)
    expect(bodyMatch).not.toBeNull()
    const decodedBody = decodeURIComponent(bodyMatch![1])
    // Must contain characteristic Markdown headings.
    expect(decodedBody).toContain('## Tester comment')
    expect(decodedBody).toContain('## Privacy flags')
    expect(decodedBody).toContain('inputs.bav.employerSubsidy.label')
  })
})

describe('buildMailtoUrl — special character encoding', () => {
  it('URL-encodes German umlauts in the body', () => {
    const report = makeReport({ comment: 'Änderung: Bäume wachsen über Nacht.' })
    const url = buildMailtoUrl(report)
    // The raw URL must not contain literal umlauts.
    expect(url).not.toMatch(/[äöüÄÖÜß]/)
    // But decoding the body must restore them.
    const bodyMatch = /body=(.+)$/.exec(url)
    const decoded = decodeURIComponent(bodyMatch![1])
    expect(decoded).toContain('Änderung')
  })

  it('URL-encodes # characters that appear in Markdown headings', () => {
    // The markdown ticket contains lines like "# [Minor] qa(copy): ...".
    // '#' must be percent-encoded in the URL.
    const url = buildMailtoUrl(makeReport())
    // We strip subject= portion; look at body only.
    const bodyMatch = /body=(.+)$/.exec(url)
    expect(bodyMatch).not.toBeNull()
    // Raw # in the URL body param would break mail clients.
    // After the "body=" there must be no literal #.
    expect(bodyMatch![1]).not.toContain('#')
  })

  it('URL-encodes & characters that would split query params', () => {
    const report = makeReport({ comment: 'Beitrag = 100 & Zuschuss = 20' })
    const url = buildMailtoUrl(report)
    // Verify that decoding gives us the literal ampersand.
    const bodyMatch = /body=(.+)$/.exec(url)
    const decoded = decodeURIComponent(bodyMatch![1])
    expect(decoded).toContain('Beitrag = 100 & Zuschuss = 20')
    // And the raw encoded URL must not have an unescaped & inside the body value.
    // Split on the first & (which separates subject from body) then look at body.
    const afterBodyEq = url.split('body=')[1]
    expect(afterBodyEq).not.toContain('&')
  })

  it('URL-encodes newlines that appear in the Markdown body', () => {
    const url = buildMailtoUrl(makeReport())
    const afterBodyEq = url.split('body=')[1]
    // Raw newlines (\n or \r) in a mailto: body break many MUAs.
    expect(afterBodyEq).not.toContain('\n')
    expect(afterBodyEq).not.toContain('\r')
    // Instead, newlines appear as %0A or %0D%0A.
    expect(afterBodyEq).toMatch(/%0[aA]/)
  })
})

describe('buildMailtoUrl — length clamping', () => {
  it('returns a URL within a reasonable total length for a normal report', () => {
    const url = buildMailtoUrl(makeReport())
    // 1900 chars is the documented conservative ceiling for the total URL.
    expect(url.length).toBeLessThanOrEqual(1900)
  })

  it('appends truncation footer when body exceeds the encoded cap', () => {
    // Produce an enormous comment to force truncation.
    const hugeComment = 'Ä'.repeat(2000)
    const report = makeReport({ comment: hugeComment })
    const url = buildMailtoUrl(report)
    const bodyMatch = /body=(.+)$/.exec(url)
    const decoded = decodeURIComponent(bodyMatch![1])
    expect(decoded).toContain('[truncated — see attached bundle]')
  })

  it('does NOT append truncation footer when body fits', () => {
    const url = buildMailtoUrl(makeReport())
    expect(url).not.toContain('truncated')
  })

  it('encoded body portion never exceeds MAX_MAILTO_BODY_ENCODED_CHARS (1800)', () => {
    const hugeComment = 'x'.repeat(5000)
    const report = makeReport({ comment: hugeComment })
    const url = buildMailtoUrl(report)
    const bodyMatch = /body=(.+)$/.exec(url)
    expect(bodyMatch).not.toBeNull()
    const encodedBody = bodyMatch![1]
    expect(encodedBody.length).toBeLessThanOrEqual(1800)
  })
})

// ─── buildGithubIssueUrl ───────────────────────────────────────────────────────

describe('buildGithubIssueUrl — URL structure', () => {
  it('points at the default repo (PeterHartwieg/Rentenrechner)', () => {
    const url = buildGithubIssueUrl(makeReport())
    expect(url).toContain('github.com/PeterHartwieg/Rentenrechner/issues/new')
  })

  it('includes title= query param', () => {
    const url = buildGithubIssueUrl(makeReport())
    const parsed = new URL(url)
    expect(parsed.searchParams.has('title')).toBe(true)
  })

  it('includes body= query param', () => {
    const url = buildGithubIssueUrl(makeReport())
    const parsed = new URL(url)
    expect(parsed.searchParams.has('body')).toBe(true)
  })

  it('title matches generateTitle(report)', () => {
    const report = makeReport({ severity: 'major', type: 'a11y' })
    const url = buildGithubIssueUrl(report)
    const parsed = new URL(url)
    const title = parsed.searchParams.get('title') ?? ''
    expect(title).toMatch(/^\[Major\] qa\(a11y\):/)
  })

  it('body contains the Markdown ticket', () => {
    const report = makeReport()
    const url = buildGithubIssueUrl(report)
    const parsed = new URL(url)
    const body = parsed.searchParams.get('body') ?? ''
    expect(body).toContain('## Tester comment')
    expect(body).toContain('inputs.bav.employerSubsidy.label')
  })

  it('does NOT include labels= when no labels are provided', () => {
    const url = buildGithubIssueUrl(makeReport())
    const parsed = new URL(url)
    expect(parsed.searchParams.has('labels')).toBe(false)
  })

  it('includes labels= when labels are provided', () => {
    const url = buildGithubIssueUrl(makeReport(), { labels: ['qa', 'copy'] })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('labels')).toBe('qa,copy')
  })

  it('uses custom owner and repo when provided', () => {
    const url = buildGithubIssueUrl(makeReport(), { owner: 'myorg', repo: 'myrepo' })
    expect(url).toContain('github.com/myorg/myrepo/issues/new')
  })

  it('custom labels list is comma-separated in the URL', () => {
    const url = buildGithubIssueUrl(makeReport(), { labels: ['bug', 'qa-feedback', 'minor'] })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('labels')).toBe('bug,qa-feedback,minor')
  })

  it('a single label produces a labels= param without trailing comma', () => {
    const url = buildGithubIssueUrl(makeReport(), { labels: ['blocker'] })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('labels')).toBe('blocker')
  })
})

describe('buildGithubIssueUrl — encoding', () => {
  it('encodes German umlauts in the body', () => {
    const report = makeReport({ comment: 'Überprüfung der Beiträge' })
    const url = buildGithubIssueUrl(report)
    const parsed = new URL(url)
    const body = parsed.searchParams.get('body') ?? ''
    // URL param value is decoded by URL constructor — we should see the literal.
    expect(body).toContain('Überprüfung')
    // But the raw URL string should not contain unencoded non-ASCII.
    // Use the raw href to verify encoding.
    expect(url).not.toMatch(/[äöüÄÖÜßÜ]/)
  })

  it('encodes # characters in the title so they are not misinterpreted', () => {
    // generateTitle produces strings starting with "[Minor]" — no literal # in
    // the title. But if the comment contains one we shouldn't see it raw.
    const report = makeReport({ comment: 'See issue #42' })
    const url = buildGithubIssueUrl(report)
    // Grab the raw query string; '#' in a URL signals a fragment.
    const [, qs] = url.split('?')
    expect(qs).toBeDefined()
    // The raw query string must not have an unescaped '#'.
    expect(qs).not.toContain('#')
  })
})

describe('buildGithubIssueUrl — length clamping', () => {
  it('appends truncation footer when body exceeds encoded cap (7500)', () => {
    const hugeComment = 'Ä'.repeat(5000)
    const report = makeReport({ comment: hugeComment })
    const url = buildGithubIssueUrl(report)
    const parsed = new URL(url)
    const body = parsed.searchParams.get('body') ?? ''
    expect(body).toContain('[truncated — see attached bundle]')
  })

  it('does NOT append truncation footer for a normal-sized report', () => {
    const url = buildGithubIssueUrl(makeReport())
    expect(url).not.toContain('truncated')
  })

  it('encoded body never exceeds MAX_GITHUB_BODY_ENCODED_CHARS (7500)', () => {
    const hugeComment = 'x'.repeat(10000)
    const report = makeReport({ comment: hugeComment })
    const url = buildGithubIssueUrl(report)
    const parsed = new URL(url)
    const encodedBody = encodeURIComponent(parsed.searchParams.get('body') ?? '')
    expect(encodedBody.length).toBeLessThanOrEqual(7500)
  })
})

// ─── No-network guarantee ──────────────────────────────────────────────────────

describe('outbound destination helpers — no-network guarantee', () => {
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

  it('buildMailtoUrl does not call fetch', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const url = buildMailtoUrl(makeReport())
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(url.length).toBeGreaterThan(0)
  })

  it('buildMailtoUrl does not call XMLHttpRequest', () => {
    const xhrOpenSpy = vi.fn()
    vi.stubGlobal('XMLHttpRequest', class {
      open = xhrOpenSpy
      send = vi.fn()
    })
    buildMailtoUrl(makeReport())
    expect(xhrOpenSpy).not.toHaveBeenCalled()
  })

  it('buildGithubIssueUrl does not call fetch', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const url = buildGithubIssueUrl(makeReport())
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(url.length).toBeGreaterThan(0)
  })

  it('buildGithubIssueUrl does not call XMLHttpRequest', () => {
    const xhrOpenSpy = vi.fn()
    vi.stubGlobal('XMLHttpRequest', class {
      open = xhrOpenSpy
      send = vi.fn()
    })
    buildGithubIssueUrl(makeReport())
    expect(xhrOpenSpy).not.toHaveBeenCalled()
  })

  it('buildMailtoUrl with huge input does not call fetch (truncation path)', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const url = buildMailtoUrl(makeReport({ comment: 'Ä'.repeat(2000) }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(url).toContain('truncated')
  })

  it('buildGithubIssueUrl with huge input does not call fetch (truncation path)', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const url = buildGithubIssueUrl(makeReport({ comment: 'Ä'.repeat(5000) }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(url).toContain('truncated')
  })
})
