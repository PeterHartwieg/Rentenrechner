// @vitest-environment jsdom

/**
 * Regression: the QA-feedback report payload NEVER contains a localStorage
 * snapshot (issue 03 acceptance criterion #8 / CLAUDE.md no-PII guardrail).
 *
 * The payload is built up entirely from in-memory state: composer draft,
 * pinned target, captured screenshot, and (only on opt-in) the share URL +
 * scenario JSON. None of those code paths read localStorage. This test
 * pins that contract:
 *
 *   1. The Markdown builder does not call `localStorage.getItem` etc.
 *   2. A serialised payload does not contain the `STORAGE_KEY_V2` literal
 *      (`rentenrechner-state-v2`) — i.e. nobody has accidentally embedded
 *      the state-v2 dump in a future commit.
 *   3. The payload's JSON serialisation does not include a `localStorage`
 *      key — protects against a future "for completeness" leak.
 *
 * If a future feature legitimately needs to attach localStorage data, this
 * test must be updated alongside an explicit opt-in flag and a security
 * review. Don't silently delete it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMarkdownTicket, defaultPrivacyFlags } from '../report'
import type { FeedbackReport } from '../report'
import { STORAGE_KEY_V1, STORAGE_KEY_V2 } from '../../../storage'

function makeDefaultReport(): FeedbackReport {
  return {
    type: 'copy',
    severity: 'minor',
    comment: 'Wrong word.',
    target: { id: 'inputs.bav.employerSubsidy.label', precision: 'exact' },
    environment: {
      route: '/',
      timestamp: '2026-05-05T10:00:00.000Z',
      viewport: { width: 1280, height: 800 },
      userAgentFamily: 'Chrome 124 / macOS',
      appBuild: 'dev',
    },
    privacyFlags: defaultPrivacyFlags(false),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

beforeEach(() => {
  localStorage.clear()
})

describe('QA-feedback payload — localStorage exclusion (issue 03 #8)', () => {
  it('buildMarkdownTicket does NOT call localStorage.getItem', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem')
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    const md = buildMarkdownTicket(makeDefaultReport())
    // The Markdown builder is a pure string builder — it must not consult
    // either localStorage or sessionStorage. We assert across all Storage
    // instances; the test exits with no calls observed.
    expect(getSpy).not.toHaveBeenCalled()
    expect(setSpy).not.toHaveBeenCalled()
    expect(md.length).toBeGreaterThan(0)
  })

  it('Markdown output does not contain the STORAGE_KEY_V2 literal', () => {
    // Seed localStorage with a realistic v2 payload so a buggy implementation
    // that copies the state would have a string to leak.
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ schemaVersion: 2, mode: 'compare' }))
    const md = buildMarkdownTicket(makeDefaultReport())
    expect(md).not.toContain(STORAGE_KEY_V2)
    expect(md).not.toContain(STORAGE_KEY_V1)
    expect(md).not.toContain('"schemaVersion":2')
  })

  it('default privacyFlags.localStorageIncluded is false', () => {
    const flags = defaultPrivacyFlags(false)
    expect(flags.localStorageIncluded).toBe(false)
  })

  it('serialised report payload does not contain a `localStorage` key', () => {
    // JSON-serialise the entire payload object — a future regression that
    // accidentally embeds storage data would surface here as a string match.
    const json = JSON.stringify(makeDefaultReport())
    expect(json).not.toContain('"localStorage"')
    expect(json).not.toContain(STORAGE_KEY_V2)
    expect(json).not.toContain(STORAGE_KEY_V1)
  })

  it('Markdown payload includes the localStorage flag set to "no" by default', () => {
    const md = buildMarkdownTicket(makeDefaultReport())
    expect(md).toContain('localStorage included: **no**')
  })
})
