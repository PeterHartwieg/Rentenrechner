import { describe, expect, it } from 'vitest'
import { generateTitle } from './buildTitle'
import type { FeedbackReport } from './types'

function makeReport(overrides: Partial<FeedbackReport> = {}): FeedbackReport {
  return {
    type: 'copy',
    severity: 'minor',
    comment: 'Wrong word',
    target: {
      id: 'inputs.bav.employerSubsidy.label',
      precision: 'exact',
    },
    environment: {
      route: '/',
      timestamp: '2026-05-05T10:00:00Z',
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

describe('generateTitle', () => {
  it('includes the severity prefix and target id', () => {
    const title = generateTitle(makeReport({ severity: 'blocker' }))
    expect(title.startsWith('[BLOCKER] qa(copy):')).toBe(true)
    expect(title).toContain('inputs.bav.employerSubsidy.label')
  })

  it('uses severity-specific prefixes for non-blocker reports', () => {
    expect(generateTitle(makeReport({ severity: 'major' }))).toContain('[Major]')
    expect(generateTitle(makeReport({ severity: 'minor' }))).toContain('[Minor]')
    expect(generateTitle(makeReport({ severity: 'nit' }))).toContain('[Nit]')
  })

  it('appends a comment summary when comment is non-empty', () => {
    const title = generateTitle(makeReport({ comment: 'Label says "Zuschuss" but should be "Pflichtzuschuss"' }))
    expect(title).toContain('—')
    expect(title).toContain('Pflichtzuschuss')
  })

  it('omits the comment summary when comment is empty', () => {
    const title = generateTitle(makeReport({ comment: '' }))
    expect(title.endsWith('inputs.bav.employerSubsidy.label')).toBe(true)
    expect(title).not.toContain('—')
  })

  it('truncates very long comments with a single ellipsis', () => {
    const long = 'a'.repeat(200)
    const title = generateTitle(makeReport({ comment: long }))
    expect(title.length).toBeLessThan(150)
    expect(title.endsWith('…')).toBe(true)
  })

  it('flattens multi-line comments into a single line', () => {
    const title = generateTitle(makeReport({ comment: 'first line\n\nsecond line' }))
    expect(title.includes('\n')).toBe(false)
    expect(title).toContain('first line second line')
  })

  it('falls back to a placeholder target id when missing', () => {
    const title = generateTitle(
      makeReport({
        target: { id: '', precision: 'unknown' },
      }),
    )
    expect(title).toContain('unknown.target')
  })

  it('encodes the feedback type as the qa(...) tag', () => {
    expect(generateTitle(makeReport({ type: 'a11y' }))).toContain('qa(a11y)')
    expect(generateTitle(makeReport({ type: 'layout' }))).toContain('qa(layout)')
  })
})
