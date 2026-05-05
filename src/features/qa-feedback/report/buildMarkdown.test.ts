import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMarkdownTicket, defaultPrivacyFlags } from './buildMarkdown'
import type { FeedbackReport } from './types'

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
    privacyFlags: {
      sensitiveFieldsRedacted: true,
      scenarioStateIncluded: false,
      screenshotIncluded: false,
      localStorageIncluded: false,
      userInputsRedacted: true,
    },
    ...overrides,
  }
}

describe('buildMarkdownTicket', () => {
  it('renders the title as the first line', () => {
    const md = buildMarkdownTicket(makeReport({ severity: 'blocker' }))
    const firstLine = md.split('\n')[0]
    expect(firstLine.startsWith('# [BLOCKER] qa(copy):')).toBe(true)
  })

  it('emits a header table with target, route, viewport, browser, build, timestamp', () => {
    const md = buildMarkdownTicket(makeReport())
    expect(md).toContain('| Field | Value |')
    expect(md).toContain('| Type | Copy |')
    expect(md).toContain('| Severity | Minor |')
    expect(md).toContain('| Target id | `inputs.bav.employerSubsidy.label` |')
    expect(md).toContain('| Precision | exact |')
    expect(md).toContain('| Target label | AG-Zuschuss |')
    expect(md).toContain('| Route | / |')
    expect(md).toContain('| Viewport | 1280×800 |')
    expect(md).toContain('| Browser | Chrome 124 / macOS |')
    expect(md).toContain('| App build | dev |')
    expect(md).toContain('| Timestamp | 2026-05-05T10:00:00.000Z |')
  })

  it('renders the tester comment as a section', () => {
    const md = buildMarkdownTicket(makeReport({ comment: 'Should be "Pflichtzuschuss".' }))
    expect(md).toContain('## Tester comment')
    expect(md).toContain('Should be "Pflichtzuschuss".')
  })

  it('renders an "_(empty)_" placeholder when the comment is empty', () => {
    const md = buildMarkdownTicket(makeReport({ comment: '   ' }))
    expect(md).toContain('## Tester comment')
    expect(md).toContain('_(empty)_')
  })

  it('renders the visible text when present', () => {
    const md = buildMarkdownTicket(makeReport())
    expect(md).toContain('## Visible text at selection')
    expect(md).toContain('AG-Zuschuss laut Vertrag (%)')
  })

  it('omits the visible-text section when visibleText is missing', () => {
    const md = buildMarkdownTicket(
      makeReport({
        target: { id: 'inputs.bav.employerSubsidy.label', precision: 'exact' },
      }),
    )
    expect(md).not.toContain('## Visible text at selection')
  })

  it('renders suggested replacement text when provided', () => {
    const md = buildMarkdownTicket(makeReport({ suggestedText: 'AG-Pflichtzuschuss laut Vertrag (%)' }))
    expect(md).toContain('## Suggested replacement')
    expect(md).toContain('AG-Pflichtzuschuss laut Vertrag (%)')
  })

  it('omits the suggested-replacement section when suggestedText is missing', () => {
    const md = buildMarkdownTicket(makeReport())
    expect(md).not.toContain('## Suggested replacement')
  })

  it('always emits the privacy-flags section so maintainers see the redaction posture', () => {
    const md = buildMarkdownTicket(makeReport())
    expect(md).toContain('## Privacy flags')
    expect(md).toContain('Sensitive fields redacted: **yes**')
    expect(md).toContain('User inputs redacted: **yes**')
    expect(md).toContain('Scenario state included: **no**')
    expect(md).toContain('Screenshot included: **no**')
    expect(md).toContain('localStorage included: **no**')
  })

  it('reflects opt-in privacy-flag changes', () => {
    const md = buildMarkdownTicket(
      makeReport({
        privacyFlags: {
          sensitiveFieldsRedacted: false,
          scenarioStateIncluded: true,
          screenshotIncluded: true,
          localStorageIncluded: false,
          userInputsRedacted: false,
        },
      }),
    )
    expect(md).toContain('Sensitive fields redacted: **no**')
    expect(md).toContain('User inputs redacted: **no**')
    expect(md).toContain('Scenario state included: **yes**')
    expect(md).toContain('Screenshot included: **yes**')
    expect(md).toContain('localStorage included: **no**')
  })

  it('renders a screenshot reference when present', () => {
    const md = buildMarkdownTicket(
      makeReport({
        screenshot: { fileName: 'screenshot.png', width: 1280, height: 800 },
      }),
    )
    expect(md).toContain('## Screenshot')
    // Markdown image syntax pointing at the bundle artifact
    expect(md).toMatch(/!\[screenshot\.png \(1280×800\)\]\(\.\/screenshot\.png\)/)
  })

  it('omits the screenshot section when no screenshot is attached', () => {
    const md = buildMarkdownTicket(makeReport())
    expect(md).not.toContain('## Screenshot')
  })

  it('emits a workspace-context section only when at least one field is set', () => {
    const empty = buildMarkdownTicket(makeReport({ workspaceContext: {} }))
    expect(empty).not.toContain('## Workspace context')
    const filled = buildMarkdownTicket(
      makeReport({ workspaceContext: { mode: 'compare', activeView: 'vergleich' } }),
    )
    expect(filled).toContain('## Workspace context')
    expect(filled).toContain('Mode: `compare`')
    expect(filled).toContain('Active view: `vergleich`')
  })

  it('emits the scenario JSON only when scenarioContext.scenarioJson is set', () => {
    const md = buildMarkdownTicket(
      makeReport({
        scenarioContext: { scenarioJson: '{"a":1}' },
      }),
    )
    expect(md).toContain('## Scenario JSON')
    expect(md).toContain('{"a":1}')
  })

  it('escapes backticks in the target id so the inline-code stays valid', () => {
    const md = buildMarkdownTicket(
      makeReport({
        target: { id: 'inputs.bav.`weird`.label', precision: 'exact' },
      }),
    )
    expect(md).toContain('| Target id | `inputs.bav.\\`weird\\`.label` |')
  })

  it('ends with exactly one trailing newline', () => {
    const md = buildMarkdownTicket(makeReport())
    expect(md.endsWith('\n')).toBe(true)
    expect(md.endsWith('\n\n')).toBe(false)
  })
})

describe('buildMarkdownTicket — no-network guarantee', () => {
  let originalFetch: typeof fetch | undefined

  beforeEach(() => {
    originalFetch = (globalThis as { fetch?: typeof fetch }).fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalFetch) {
      ;(globalThis as { fetch?: typeof fetch }).fetch = originalFetch
    }
  })

  it('does not call fetch when building a markdown ticket', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const md = buildMarkdownTicket(makeReport())
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(md.length).toBeGreaterThan(0)
  })

  // The export path in QaPreview is also synchronous DOM-only:
  //   - Markdown copy uses navigator.clipboard.writeText (no network)
  //   - Bundle download uses URL.createObjectURL + a synthetic <a> click (no network)
  // The Markdown builder above is the only place that could plausibly serialize
  // remote resources; structuring it as a pure string builder keeps the no-backend
  // guardrail trivially true.
})

describe('defaultPrivacyFlags', () => {
  it('defaults to redaction-on, no scenario state, no localStorage, screenshot reflects argument', () => {
    expect(defaultPrivacyFlags(false)).toEqual({
      sensitiveFieldsRedacted: true,
      scenarioStateIncluded: false,
      screenshotIncluded: false,
      localStorageIncluded: false,
      userInputsRedacted: true,
    })
    expect(defaultPrivacyFlags(true)).toEqual({
      sensitiveFieldsRedacted: true,
      scenarioStateIncluded: false,
      screenshotIncluded: true,
      localStorageIncluded: false,
      userInputsRedacted: true,
    })
  })

  it('always sets localStorageIncluded=false (no opt-in path exists yet)', () => {
    // The Phase 1 contract: there is no public path that flips this flag to
    // true. A future opt-in would land alongside a security review and an
    // explicit toggle in QaPreview. See `__tests__/privacy-localStorage.test.ts`
    // for the regression coverage.
    expect(defaultPrivacyFlags(false).localStorageIncluded).toBe(false)
    expect(defaultPrivacyFlags(true).localStorageIncluded).toBe(false)
  })
})
