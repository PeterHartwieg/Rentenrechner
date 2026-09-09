import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PANELS, assertExplicitComplexFlag, selectPanel } from './lib/panels.mjs'
import { REVIEWER_BIN_DEFAULTS, assertReviewerBinAvailable, describeReviewerBin, resolveReviewerBin } from './lib/binPaths.mjs'

describe('panel routing', () => {
  it('routine panel is exactly Grok 4.6 + Opus', () => {
    const panel = selectPanel({})
    expect(panel.kind).toBe('routine')
    expect(panel.reviewers).toEqual([
      { reviewer: 'grok', model: 'grok-4.6', label: expect.any(String) },
      { reviewer: 'claude', model: 'opus', label: expect.any(String) },
    ])
  })

  it('complex panel is exactly Fable 5.1 + GPT-6-Astra + Grok 4.6', () => {
    const panel = selectPanel({ complex: true })
    expect(panel.kind).toBe('complex')
    expect(panel.reviewers.map((r) => `${r.reviewer}:${r.model}`)).toEqual([
      'claude:claude-fable-5-1',
      'codex:gpt-6-astra',
      'grok:grok-4.6',
    ])
  })

  it('the complex panel is unreachable without the explicit flag', () => {
    expect(selectPanel({ complex: false }).kind).toBe('routine')
    expect(selectPanel({}).kind).toBe('routine')
    expect(selectPanel().kind).toBe('routine')
  })

  it('accepts the bare flag and the documented literal true', () => {
    expect(assertExplicitComplexFlag(true)).toBe(true)
    expect(assertExplicitComplexFlag('')).toBe(true)
    expect(assertExplicitComplexFlag('true')).toBe(true)
    expect(assertExplicitComplexFlag(false)).toBe(false)
    expect(assertExplicitComplexFlag(undefined)).toBe(false)
  })

  it('rejects any other value-bearing form instead of silently downgrading', () => {
    // `--complex false` / `--complex 1` used to fall through to the routine
    // panel with no warning. An explicit escalation request must never be
    // answered with a cheaper panel.
    for (const raw of ['false', '1', 'yes', 'no', '391', 0, 1]) {
      expect(() => assertExplicitComplexFlag(raw), JSON.stringify(raw)).toThrow(/takes no value/)
    }
  })

  it('panel definitions never leak fable/astra into the routine panel', () => {
    const routineModels = PANELS.routine.map((r) => r.model)
    expect(routineModels).not.toContain('claude-fable-5-1')
    expect(routineModels).not.toContain('gpt-6-astra')
  })
})

describe('reviewer binary resolution', () => {
  it('defaults match the documented CLI locations', () => {
    expect(REVIEWER_BIN_DEFAULTS.claude).toMatch(/\.local\/bin\/claude$/)
    expect(REVIEWER_BIN_DEFAULTS.grok).toMatch(/\.grok\/bin\/grok$/)
    expect(REVIEWER_BIN_DEFAULTS.codex).toBe('codex')
  })

  it('env overrides win over defaults', () => {
    const resolved = resolveReviewerBin('claude', { REVIEW_CLAUDE_BIN: '/opt/tools/claude' })
    expect(resolved).toMatchObject({ command: '/opt/tools/claude', source: 'env', envVar: 'REVIEW_CLAUDE_BIN' })
  })

  it('missing binaries produce a helpful, env-var-naming error', () => {
    expect(() => assertReviewerBinAvailable('claude', { REVIEW_CLAUDE_BIN: '/definitely/not/here' })).toThrow(
      /not found at \/definitely\/not\/here[\s\S]*REVIEW_CLAUDE_BIN[\s\S]*\.local\/bin\/claude/,
    )
    expect(() => assertReviewerBinAvailable('grok', { REVIEW_GROK_BIN: '/definitely/not/grok' })).toThrow(
      /REVIEW_GROK_BIN/,
    )
  })

  it('describes availability for probing and PATH resolution for bare commands', () => {
    const missing = describeReviewerBin('claude', { REVIEW_CLAUDE_BIN: '/definitely/not/here' })
    expect(missing).toMatchObject({ available: false, onPath: false })
    const viaPath = describeReviewerBin('codex', {})
    expect(viaPath.onPath).toBe(true)
    expect(viaPath.available).toBeNull()
  })

  it('unknown reviewer kinds are rejected', () => {
    expect(() => resolveReviewerBin('gpt')).toThrow(/unknown reviewer kind/)
  })

  it('existing fixture binaries resolve as available', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rw-bin-'))
    try {
      const bin = join(dir, 'fake-cli')
      writeFileSync(bin, '', 'utf8')
      const info = describeReviewerBin('grok', { REVIEW_GROK_BIN: bin })
      // The fixture file exists but is not chmod +x — resolution reports that
      // honestly instead of pretending availability.
      expect(info.available).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
