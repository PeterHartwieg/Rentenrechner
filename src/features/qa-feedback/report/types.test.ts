import { describe, expect, it } from 'vitest'
import type {
  EnvironmentContext,
  FeedbackReport,
  FeedbackType,
  PrivacyFlags,
  ResolvedTarget,
  ScreenshotRef,
  Severity,
  TargetPrecision,
} from './types'

/**
 * Sanity tests for the report payload type contract. These exist to lock
 * the public type names that Lanes B/C/D consume. If a name changes, this
 * file must change too — surfaces the contract churn loudly.
 */

describe('FeedbackReport type contract', () => {
  it('accepts a fully populated report (all optional fields filled in)', () => {
    const target: ResolvedTarget = {
      id: 'inputs.bav.employerSubsidy.label',
      label: 'AG-Zuschuss',
      visibleText: 'AG-Zuschuss laut Vertrag (%)',
      precision: 'exact',
    }
    const env: EnvironmentContext = {
      route: '/',
      timestamp: '2026-05-05T10:00:00.000Z',
      viewport: { width: 1280, height: 800 },
      userAgentFamily: 'Chrome 124 / macOS',
      appBuild: 'dev',
    }
    const flags: PrivacyFlags = {
      sensitiveFieldsRedacted: true,
      scenarioStateIncluded: true,
      screenshotIncluded: true,
    }
    const screenshot: ScreenshotRef = { fileName: 'screenshot.png', width: 1280, height: 800 }
    const report: FeedbackReport = {
      type: 'copy',
      severity: 'minor',
      comment: 'Wrong word.',
      suggestedText: 'Better word.',
      target,
      environment: env,
      privacyFlags: flags,
      screenshot,
      workspaceContext: { mode: 'compare', activeView: 'vergleich', activeProductId: 'bav' },
      scenarioContext: { shareUrl: 'https://example.com/?s=abc' },
    }
    expect(report.target.id).toBe('inputs.bav.employerSubsidy.label')
    expect(report.environment.viewport.width).toBe(1280)
  })

  it('accepts a minimal report without optional context fields', () => {
    const minimal: FeedbackReport = {
      type: 'other',
      severity: 'nit',
      comment: '',
      target: { id: 'unknown.target', precision: 'unknown' },
      environment: {
        route: '/',
        timestamp: '2026-05-05T10:00:00.000Z',
        viewport: { width: 800, height: 600 },
        userAgentFamily: 'unknown',
        appBuild: 'dev',
      },
      privacyFlags: {
        sensitiveFieldsRedacted: true,
        scenarioStateIncluded: false,
        screenshotIncluded: false,
      },
    }
    expect(minimal.target.precision).toBe('unknown')
  })

  it('exports stable string-literal unions for FeedbackType, Severity, TargetPrecision', () => {
    const types: FeedbackType[] = ['copy', 'layout', 'flow', 'interaction', 'value', 'a11y', 'other']
    const sevs: Severity[] = ['blocker', 'major', 'minor', 'nit']
    const precs: TargetPrecision[] = ['exact', 'section', 'unknown']
    expect(types.length).toBe(7)
    expect(sevs.length).toBe(4)
    expect(precs.length).toBe(3)
  })
})
