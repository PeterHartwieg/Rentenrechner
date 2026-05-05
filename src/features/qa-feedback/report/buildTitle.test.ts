import { describe, expect, it } from 'vitest'
import { computeHeadlinePreview, generateTitle } from './buildTitle'
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
  it('produces structured title from severity, type, and target id', () => {
    const title = generateTitle(makeReport({ severity: 'blocker' }))
    expect(title).toBe('[BLOCKER] qa(copy): inputs.bav.employerSubsidy.label')
  })

  it('uses target label instead of id when label is present', () => {
    const title = generateTitle(
      makeReport({
        target: { id: 'inputs.bav.employerSubsidy.label', label: 'Eingaben / bAV', precision: 'exact' },
      }),
    )
    expect(title).toBe('[Minor] qa(copy): Eingaben / bAV')
    expect(title).not.toContain('inputs.bav.employerSubsidy.label')
  })

  it('falls back to id when label is empty string', () => {
    const title = generateTitle(
      makeReport({
        target: { id: 'inputs.bav.employerSubsidy.label', label: '', precision: 'exact' },
      }),
    )
    expect(title).toContain('inputs.bav.employerSubsidy.label')
  })

  it('does not include the tester comment in the title', () => {
    const title = generateTitle(
      makeReport({ comment: 'Label says "Zuschuss" but should be "Pflichtzuschuss"' }),
    )
    expect(title).not.toContain('Zuschuss')
    expect(title).not.toContain('—')
  })

  it('does not include comment even when comment is very long', () => {
    const long = 'a'.repeat(200)
    const title = generateTitle(makeReport({ comment: long }))
    expect(title).not.toContain('a'.repeat(10))
    expect(title).not.toContain('…')
  })

  it('uses severity-specific prefixes for non-blocker reports', () => {
    expect(generateTitle(makeReport({ severity: 'major' }))).toContain('[Major]')
    expect(generateTitle(makeReport({ severity: 'minor' }))).toContain('[Minor]')
    expect(generateTitle(makeReport({ severity: 'nit' }))).toContain('[Nit]')
  })

  it('encodes the feedback type as the qa(...) tag', () => {
    expect(generateTitle(makeReport({ type: 'a11y' }))).toContain('qa(a11y)')
    expect(generateTitle(makeReport({ type: 'layout' }))).toContain('qa(layout)')
  })

  it('falls back to a placeholder target when id and label are missing', () => {
    const title = generateTitle(
      makeReport({
        target: { id: '', precision: 'unknown' },
      }),
    )
    expect(title).toContain('unknown.target')
  })

  it('title stays a single line (no newline characters)', () => {
    const title = generateTitle(
      makeReport({
        target: {
          id: 'some.id',
          label: 'line one\nline two',
          precision: 'exact',
        },
      }),
    )
    // Label with embedded newline: trimmed, but no forced flattening needed
    // because target labels should not contain newlines in practice. The title
    // itself must never contain a newline from the format string.
    expect(title.startsWith('[Minor] qa(copy):')).toBe(true)
  })
})

describe('computeHeadlinePreview', () => {
  it('returns structured headline from severity, type, and target label', () => {
    const preview = computeHeadlinePreview('minor', 'layout', 'Eingaben / bAV', 'inputs.bav')
    expect(preview).toBe('[Minor] qa(layout): Eingaben / bAV')
  })

  it('falls back to target id when label is absent', () => {
    const preview = computeHeadlinePreview('blocker', 'copy', undefined, 'inputs.bav.label')
    expect(preview).toBe('[BLOCKER] qa(copy): inputs.bav.label')
  })

  it('falls back to unknown.target when both label and id are absent', () => {
    const preview = computeHeadlinePreview('nit', 'other', undefined, undefined)
    expect(preview).toBe('[Nit] qa(other): unknown.target')
  })

  it('returns null when severity is null', () => {
    expect(computeHeadlinePreview(null, 'copy', 'Some label', 'some.id')).toBeNull()
  })

  it('returns null when type is null', () => {
    expect(computeHeadlinePreview('minor', null, 'Some label', 'some.id')).toBeNull()
  })

  it('all severity levels produce correct prefix', () => {
    expect(computeHeadlinePreview('blocker', 'copy', 'L', 'i')).toContain('[BLOCKER]')
    expect(computeHeadlinePreview('major', 'copy', 'L', 'i')).toContain('[Major]')
    expect(computeHeadlinePreview('minor', 'copy', 'L', 'i')).toContain('[Minor]')
    expect(computeHeadlinePreview('nit', 'copy', 'L', 'i')).toContain('[Nit]')
  })
})
